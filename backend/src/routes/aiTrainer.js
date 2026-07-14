import { chatWithTrainer, summarizeTrainerSession } from '../services/claude.js'
import { db } from '../db/index.js'
import { mergeMemory, buildReport } from '../services/aiTrainerMemory.js'
import { isAvatarConfigured, personaPhoto, generateTalkingVideo, getCredits } from '../services/avatar.js'
import { transcribeAudio } from '../services/whisper.js'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

// Загрузить память пользователя (или null)
async function loadMemory(userId) {
  const { rows } = await db.query('SELECT * FROM ai_trainer_memory WHERE user_id = $1', [userId])
  return rows[0] || null
}

// Проверить, что сессия принадлежит пользователю
async function loadSession(sessionId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM ai_trainer_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  )
  return rows[0] || null
}

// Дневной лимит сообщений AI-тренера для бесплатных (v2). Возвращает {limit, used}
// если лимит исчерпан, иначе null. Действует только при включённой платной версии
// и plan != premium; premium и супер-админ — безлимит.
async function trainerLimitExceeded(userId) {
  const { rows: p } = await db.query('SELECT config FROM platform_settings WHERE id = 1')
  const mon = p[0]?.config?.monetization || {}
  const limit = mon.trainer_daily_limit || 0
  if (!mon.paid_enabled || limit <= 0) return null
  const { rows: u } = await db.query('SELECT plan FROM users WHERE id = $1', [userId])
  if (u[0]?.plan === 'premium') return null
  const { rows: c } = await db.query(
    `SELECT count(*)::int AS n FROM ai_trainer_messages m
     JOIN ai_trainer_sessions s ON s.id = m.session_id
     WHERE s.user_id = $1 AND m.role = 'user' AND m.created_at::date = CURRENT_DATE`, [userId])
  return c[0].n >= limit ? { limit, used: c[0].n } : null
}

export async function aiTrainerRoutes(fastify) {
  // ── Старый stateless-эндпоинт (обратная совместимость) ──
  fastify.post('/api/ai-trainer/chat', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { messages, character, scenario, userLang } = request.body
    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({ error: 'messages required' })
    }
    try {
      // Даже в stateless-режиме подмешиваем память — тренер «помнит» ученика
      const memory = await loadMemory(request.user.id)
      return await chatWithTrainer({ messages: messages.slice(-20), character, scenario, userLang, memory })
    } catch (e) {
      fastify.log.error(e)
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── Память тренера о пользователе ──
  fastify.get('/api/ai-trainer/memory', { preHandler: [fastify.authenticate] }, async (request) => {
    const memory = await loadMemory(request.user.id)
    return memory || { summary_text: '', known_facts: {}, recurring_mistakes: [], topics_covered: [], sessions_total: 0 }
  })

  // ── Точная транскрипция голоса (Whisper) для голосового тренера ──
  // Гибрид: Web Speech ловит конец фразы (hands-free), точный текст даёт Whisper.
  fastify.post('/api/ai-trainer/transcribe', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    let data
    try { data = await request.file() } catch { data = null }
    if (!data) return reply.status(400).send({ error: 'no audio' })
    const buf = await data.toBuffer()
    if (!buf || buf.length < 1000) return { text: '' }  // тишина/слишком коротко
    const mt = data.mimetype || ''
    const ext = mt.includes('webm') ? 'webm' : mt.includes('ogg') ? 'ogg' : mt.includes('mp4') ? 'mp4' : mt.includes('wav') ? 'wav' : 'webm'
    const tmp = join(tmpdir(), `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
    try {
      await writeFile(tmp, buf)
      const text = await transcribeAudio(tmp)
      return { text: (typeof text === 'string' ? text : (text?.text || '')).trim() }
    } catch (e) {
      fastify.log.error({ err: e }, 'voice transcribe failed')
      return reply.status(500).send({ error: 'transcribe failed' })
    } finally {
      unlink(tmp).catch(() => {})
    }
  })

  // ── Видео-аватар: доступность (настроен ли ключ D-ID) ──
  fastify.get('/api/ai-trainer/avatar/available', { preHandler: [fastify.authenticate] }, async () => {
    // Кнопка 🎥 (генерация нового видео D-ID) доступна, только если ключ есть И остались кредиты
    const configured = isAvatarConfigured()
    const credits = configured ? await getCredits() : 0
    return { available: configured && credits > 0, credits }
  })

  // ── Видео-аватар: сгенерировать говорящее видео для реплики ──
  // ⚠️ Каждый вызов тратит кредит D-ID — вызывается строго по кнопке пользователя
  fastify.post('/api/ai-trainer/avatar', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAvatarConfigured()) return reply.status(503).send({ error: 'avatar not configured' })
    // Пока генерировать видео может только учитель (owner) — экономим кредиты.
    // Тонкая настройка «кто может» — в тарифном спринте (супер-админ).
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Генерация видео-аватара доступна только учителю' })
    const { text, character = 'lena' } = request.body || {}
    if (!text || !text.trim()) return reply.status(400).send({ error: 'text required' })
    try {
      const video = await generateTalkingVideo({ photoUrl: personaPhoto(character), text: text.slice(0, 300) })
      return { video_url: video.url }
    } catch (e) {
      fastify.log.error({ err: e }, 'avatar generation failed')
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── Список сессий ──
  fastify.get('/api/ai-trainer/sessions', { preHandler: [fastify.authenticate] }, async (request) => {
    const { rows } = await db.query(
      'SELECT id, character, scenario, status, started_at, finished_at FROM ai_trainer_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50',
      [request.user.id]
    )
    return rows
  })

  // ── Полный лог конкретной сессии (для экрана «История сессий») ──
  fastify.get('/api/ai-trainer/sessions/:id/messages', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const session = await loadSession(request.params.id, request.user.id)
    if (!session) return reply.status(404).send({ error: 'session not found' })
    const { rows } = await db.query(
      'SELECT role, text, correction, translation, created_at FROM ai_trainer_messages WHERE session_id = $1 ORDER BY id ASC',
      [session.id]
    )
    return { session, messages: rows }
  })

  // ── Создать сессию (подтягивает память для баннера «тренер помнит») ──
  fastify.post('/api/ai-trainer/sessions', { preHandler: [fastify.authenticate] }, async (request) => {
    const { character = 'lena', scenario = 'free', userLang = 'uk', starter, targetWords } = request.body || {}
    const words = Array.isArray(targetWords) && targetWords.length ? targetWords.slice(0, 25) : null
    const { rows } = await db.query(
      'INSERT INTO ai_trainer_sessions (user_id, character, scenario, target_words) VALUES ($1, $2, $3, $4) RETURNING id',
      [request.user.id, character, scenario, words ? JSON.stringify(words) : null]
    )
    const sessionId = rows[0].id
    const memory = await loadMemory(request.user.id)

    // Первую реплику генерирует ИИ с учётом памяти — не повторяем одинаковое приветствие
    let opening = null, opening_translation = null
    try {
      const instr = words
        ? 'Розпочни розмову першим: привітайся і почни тренувати слова цього уроку — постав перше просте питання, у якому природно вживається одне зі слів уроку.'
        : (memory && memory.summary_text)
          ? 'Розпочни розмову першим. Ти вже спілкувався з цим учнем раніше — привітайся і природно згадай щось із минулих розмов АБО постав НОВЕ питання за сценарієм. НЕ повторюй щоразу однакове привітання.'
          : 'Розпочни розмову першим: коротко привітайся і постав перше питання за сценарієм.'
      const r = await chatWithTrainer({ messages: [{ role: 'user', content: instr }], character, scenario, userLang, memory, targetWords: words })
      opening = r && r.reply ? r.reply : null
      opening_translation = (r && r.translation && r.translation !== 'null') ? r.translation : null
    } catch (e) {
      fastify.log.error({ err: e }, 'ai-trainer opening generation failed')
    }

    const firstText = opening || starter
    if (firstText) {
      await db.query(
        'INSERT INTO ai_trainer_messages (session_id, role, text, translation) VALUES ($1, $2, $3, $4)',
        [sessionId, 'trainer', firstText, opening_translation]
      )
    }
    return {
      session_id: sessionId,
      opening: firstText || null,
      opening_translation,
      memory: memory
        ? { summary_text: memory.summary_text, recurring_mistakes: memory.recurring_mistakes }
        : null,
    }
  })

  // ── Реплика ученика → ответ тренера (с памятью, с сохранением истории) ──
  fastify.post('/api/ai-trainer/sessions/:id/message', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const session = await loadSession(request.params.id, request.user.id)
    if (!session) return reply.status(404).send({ error: 'session not found' })

    const { text, userLang } = request.body || {}
    if (!text || !text.trim()) return reply.status(400).send({ error: 'text required' })

    // Дневной лимит сообщений тренера (бесплатный тариф)
    const over = await trainerLimitExceeded(request.user.id)
    if (over) return reply.status(429).send({
      error: `Дневной лимит сообщений тренера исчерпан (${over.limit}). Оформи Premium для безлимита.`,
      limit: over.limit, upgrade: true,
    })

    // Сохраняем реплику ученика
    await db.query(
      'INSERT INTO ai_trainer_messages (session_id, role, text) VALUES ($1, $2, $3)',
      [session.id, 'user', text.trim()]
    )

    // Собираем историю для модели (последние 20 реплик)
    const { rows: history } = await db.query(
      'SELECT role, text FROM ai_trainer_messages WHERE session_id = $1 ORDER BY id ASC',
      [session.id]
    )
    const openaiMessages = history.slice(-20).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

    try {
      const memory = await loadMemory(request.user.id)
      const result = await chatWithTrainer({
        messages: openaiMessages,
        character: session.character,
        scenario: session.scenario,
        userLang,
        memory,
        targetWords: session.target_words,
      })
      // Сохраняем ответ тренера
      await db.query(
        'INSERT INTO ai_trainer_messages (session_id, role, text, correction, translation) VALUES ($1, $2, $3, $4, $5)',
        [session.id, 'trainer', result.reply, result.correction ?? null, result.translation ?? null]
      )
      return result
    } catch (e) {
      fastify.log.error(e)
      return reply.status(500).send({ error: e.message })
    }
  })

  // ── Завершить сессию: отчёт + обновление памяти (§3 ТЗ) ──
  fastify.post('/api/ai-trainer/sessions/:id/finish', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const session = await loadSession(request.params.id, request.user.id)
    if (!session) return reply.status(404).send({ error: 'session not found' })
    const { userLang } = request.body || {}

    const { rows: msgs } = await db.query(
      'SELECT role, text, correction FROM ai_trainer_messages WHERE session_id = $1 ORDER BY id ASC',
      [session.id]
    )

    // Отчёт — чистая функция (без AI)
    const report = buildReport(msgs)
    await db.query(
      'INSERT INTO ai_trainer_reports (session_id, mistakes, message_count) VALUES ($1, $2, $3)',
      [session.id, JSON.stringify(report.mistakes), report.message_count]
    )
    await db.query(
      "UPDATE ai_trainer_sessions SET status = 'finished', finished_at = NOW() WHERE id = $1",
      [session.id]
    )

    // Обновление памяти — отдельный AI-вызов (не критично, если упадёт)
    try {
      if (report.user_message_count > 0) {
        const existing = await loadMemory(request.user.id)
        const update = await summarizeTrainerSession({
          existingSummary: existing?.summary_text || '',
          messages: msgs,
          userLang,
        })
        const merged = mergeMemory(existing, update)
        await db.query(
          `INSERT INTO ai_trainer_memory (user_id, summary_text, known_facts, recurring_mistakes, topics_covered, sessions_total, updated_at)
           VALUES ($1, $2, $3, $4, $5, 1, NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             summary_text = EXCLUDED.summary_text,
             known_facts = EXCLUDED.known_facts,
             recurring_mistakes = EXCLUDED.recurring_mistakes,
             topics_covered = EXCLUDED.topics_covered,
             sessions_total = ai_trainer_memory.sessions_total + 1,
             updated_at = NOW()`,
          [
            request.user.id,
            merged.summary_text,
            JSON.stringify(merged.known_facts),
            JSON.stringify(merged.recurring_mistakes),
            JSON.stringify(merged.topics_covered),
          ]
        )
      }
    } catch (e) {
      fastify.log.error({ err: e }, 'ai-trainer memory update failed')
    }

    return report
  })
}
