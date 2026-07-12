import { chatWithTrainer, summarizeTrainerSession } from '../services/claude.js'
import { db } from '../db/index.js'
import { mergeMemory, buildReport } from '../services/aiTrainerMemory.js'

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

  // ── Список сессий ──
  fastify.get('/api/ai-trainer/sessions', { preHandler: [fastify.authenticate] }, async (request) => {
    const { rows } = await db.query(
      'SELECT id, character, scenario, status, started_at, finished_at FROM ai_trainer_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 50',
      [request.user.id]
    )
    return rows
  })

  // ── Создать сессию (подтягивает память для баннера «тренер помнит») ──
  fastify.post('/api/ai-trainer/sessions', { preHandler: [fastify.authenticate] }, async (request) => {
    const { character = 'lena', scenario = 'free', starter } = request.body || {}
    const { rows } = await db.query(
      'INSERT INTO ai_trainer_sessions (user_id, character, scenario) VALUES ($1, $2, $3) RETURNING id',
      [request.user.id, character, scenario]
    )
    const sessionId = rows[0].id
    if (starter) {
      await db.query(
        'INSERT INTO ai_trainer_messages (session_id, role, text) VALUES ($1, $2, $3)',
        [sessionId, 'trainer', starter]
      )
    }
    const memory = await loadMemory(request.user.id)
    return {
      session_id: sessionId,
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
