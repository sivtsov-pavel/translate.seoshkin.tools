import { db } from '../db/index.js'
import { explainGrammarError, translateText, justifyAnswer } from '../services/claude.js'

export async function phrasebookRoutes(fastify) {

  // ─── Разговорник ───

  // Получить все фразы текущего пользователя (сгруппированные по категориям)
  fastify.get('/api/phrasebook', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { rows } = await db.query(
      `SELECT id, de, ru, category, source, exercise_id, learned, created_at
       FROM phrasebook WHERE user_id = $1 ORDER BY category NULLS LAST, created_at DESC`,
      [request.user.id]
    )
    return rows
  })

  // Добавить фразу
  fastify.post('/api/phrasebook', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { de, ru, category, source, exercise_id } = request.body
    if (!de || !ru) return reply.status(400).send({ error: 'de и ru обязательны' })

    // Не дублировать одинаковые фразы для одного пользователя
    const existing = await db.query(
      'SELECT id FROM phrasebook WHERE user_id = $1 AND LOWER(de) = LOWER($2)',
      [request.user.id, de.trim()]
    )
    if (existing.rows.length) return reply.status(200).send({ ...existing.rows[0], duplicate: true })

    const { rows } = await db.query(
      `INSERT INTO phrasebook (user_id, de, ru, category, source, exercise_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, de, ru, category, source, exercise_id, learned, created_at`,
      [request.user.id, de.trim(), ru.trim(), category || null, source || 'manual', exercise_id || null]
    )
    return reply.status(201).send(rows[0])
  })

  // Редактировать фразу (de, ru, category)
  fastify.patch('/api/phrasebook/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { de, ru, category } = request.body
    if (!de || !ru) return reply.status(400).send({ error: 'de и ru обязательны' })
    const { rows } = await db.query(
      `UPDATE phrasebook SET de = $1, ru = $2, category = $3
       WHERE id = $4 AND user_id = $5
       RETURNING id, de, ru, category, source, exercise_id, learned, created_at`,
      [de.trim(), ru.trim(), category || null, parseInt(request.params.id), request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Не найдено' })
    return rows[0]
  })

  // Переключить статус "Выучил"
  fastify.patch('/api/phrasebook/:id/learned', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { rows } = await db.query(
      `UPDATE phrasebook SET learned = NOT learned
       WHERE id = $1 AND user_id = $2 RETURNING id, learned`,
      [parseInt(request.params.id), request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Не найдено' })
    return rows[0]
  })

  // Удалить фразу
  fastify.delete('/api/phrasebook/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { rows } = await db.query(
      'DELETE FROM phrasebook WHERE id = $1 AND user_id = $2 RETURNING id',
      [parseInt(request.params.id), request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Не найдено' })
    return reply.status(204).send()
  })

  // Автоперевод фразы (DE → целевой язык, по умолчанию RU)
  fastify.post('/api/translate-text', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { text, from = 'de', to = 'ru' } = request.body
    if (!text?.trim()) return reply.status(400).send({ error: 'text обязателен' })
    try {
      const translation = await translateText(text.trim(), from, to)
      return { translation }
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ─── Обоснование правильного ответа ───

  fastify.post('/api/justify-answer', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { wordDe, correctAnswer, sentence, type } = request.body
    if (!correctAnswer) return reply.status(400).send({ error: 'correctAnswer обязателен' })
    try {
      const explanation = await justifyAnswer({ wordDe, correctAnswer, sentence, type })
      return { explanation }
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })

  // ─── Объяснение ошибки ───

  fastify.post('/api/explain-error', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { de, type, userAnswer, correctAnswer } = request.body
    if (!de || !correctAnswer) return reply.status(400).send({ error: 'de и correctAnswer обязательны' })
    try {
      const explanation = await explainGrammarError({ de, type, userAnswer: userAnswer || '', correctAnswer })
      return { explanation }
    } catch (e) {
      return reply.status(500).send({ error: e.message })
    }
  })
}
