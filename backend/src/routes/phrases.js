// API наборов фраз: набор урока, каталог тем, отметка пройденного шага тренировки.
import { db } from '../db/index.js'
import { summarizePhraseProgress } from '../services/phraseProgress.js'

// Фразы темы вместе с прогрессом текущего ученика и переводом на его локаль
async function loadTopic(topicId, userId, lang) {
  const { rows: topicRows } = await db.query(
    `SELECT id, title, title_i18n, emoji, level, image_url, lang, published
     FROM phrase_topics WHERE id = $1`, [topicId])
  if (!topicRows[0]) return null

  const { rows } = await db.query(
    `SELECT p.id, p.text, p.emoji, p.position, p.translations,
            up.step_listen, up.step_build, up.step_speak
     FROM phrases p
     LEFT JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $2
     WHERE p.topic_id = $1 ORDER BY p.position`, [topicId, userId])

  const topic = topicRows[0]
  return {
    topic: {
      id: topic.id, emoji: topic.emoji, level: topic.level, image_url: topic.image_url,
      title: topic.title, title_local: topic.title_i18n?.[lang] || null,
      lang: topic.lang, published: topic.published,
    },
    phrases: rows.map(r => ({
      id: r.id, text: r.text, emoji: r.emoji, position: r.position,
      translation: r.translations?.[lang] || r.translations?.ru || '',
      progress: { listen: !!r.step_listen, build: !!r.step_build, speak: !!r.step_speak },
    })),
    stats: summarizePhraseProgress(rows),
  }
}

export async function phrasesRoutes(fastify) {
  // Набор фраз урока
  fastify.get('/api/lessons/:id/phrases', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { rows } = await db.query(
      'SELECT id FROM phrase_topics WHERE lesson_id = $1', [parseInt(request.params.id)])
    if (!rows[0]) return reply.status(404).send({ error: 'У этого урока нет набора фраз' })
    return loadTopic(rows[0].id, request.user.id, request.query.lang || 'ru')
  })

  // Каталог наборов. Видно: опубликованные общие, свои личные и наборы уроков своей
  // школы. Последнее важно — наборы уроков создаются черновиками, и без этого условия
  // 316 сгенерированных фраз не увидел бы никто, включая их автора.
  fastify.get('/api/phrase-topics', { preHandler: [fastify.authenticate] }, async (request) => {
    const lang = request.query.lang || 'ru'
    const target = request.headers['x-target-lang'] || null
    const { rows } = await db.query(
      `SELECT t.id, t.title, t.title_i18n, t.emoji, t.level, t.image_url, t.lang,
              l.lesson_number, l.id AS lesson_id,
              (SELECT count(*)::int FROM phrases p WHERE p.topic_id = t.id) AS total,
              (SELECT count(*)::int FROM phrases p
                 JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $1
                WHERE p.topic_id = t.id AND up.step_listen AND up.step_build) AS done
       FROM phrase_topics t
       LEFT JOIN lessons l ON l.id = t.lesson_id
       WHERE EXISTS (SELECT 1 FROM phrases p WHERE p.topic_id = t.id)
         AND ($3::text IS NULL OR t.lang = $3)
         AND (
           t.published
           OR t.owner_id = $1
           OR ($2::int IS NOT NULL AND t.school_id = $2)
           OR l.owner_id = $1
         )
       ORDER BY l.lesson_number NULLS LAST, t.title`,
      [request.user.id, request.user.school_id ?? null, target])
    return rows.map(({ title_i18n, ...r }) => ({ ...r, title_local: title_i18n?.[lang] || null }))
  })

  // Набор по id
  fastify.get('/api/phrase-topics/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = await loadTopic(parseInt(request.params.id), request.user.id, request.query.lang || 'ru')
    if (!data) return reply.status(404).send({ error: 'Набор не найден' })
    return data
  })

  // Отметка пройденного шага тренировки
  fastify.post('/api/phrases/:id/step', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['step'],
        properties: { step: { type: 'string', enum: ['listen', 'build', 'speak'] } },
      },
    },
  }, async (request, reply) => {
    // Имя колонки берём из белого списка (enum в схеме выше) — в SQL не подставляется
    // ничего пришедшего от пользователя напрямую.
    const column = { listen: 'step_listen', build: 'step_build', speak: 'step_speak' }[request.body.step]
    const { rows } = await db.query(
      `INSERT INTO user_phrase_progress (user_id, phrase_id, ${column}, updated_at)
       VALUES ($1, $2, TRUE, now())
       ON CONFLICT (user_id, phrase_id) DO UPDATE SET ${column} = TRUE, updated_at = now()
       RETURNING step_listen, step_build, step_speak`,
      [request.user.id, parseInt(request.params.id)])
    const p = rows[0]
    return reply.send({
      listen: p.step_listen, build: p.step_build, speak: p.step_speak,
      done: Boolean(p.step_listen && p.step_build),
    })
  })
}
