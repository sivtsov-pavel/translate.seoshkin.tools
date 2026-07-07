import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'

export async function exercisesRoutes(fastify) {
  // Упражнения на сегодня по SRS очереди
  fastify.get('/api/exercises/today', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const today = new Date().toISOString().slice(0, 10)

    const { rows } = await db.query(
      `SELECT e.*, w.word_de, w.translation_ru
       FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN words w ON w.id = e.word_id
       WHERE l.owner_id = $1
         AND e.next_review_date <= $2
       ORDER BY e.next_review_date ASC
       LIMIT 50`,
      [userId, today]
    )
    return rows
  })

  // Словарь пользователя
  fastify.get('/api/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const { status } = request.query

    let query = `SELECT w.*, l.title AS lesson_title
                 FROM words w
                 LEFT JOIN lessons l ON l.id = w.lesson_id
                 WHERE w.user_id = $1`
    const params = [userId]

    if (status) {
      query += ' AND w.status = $2'
      params.push(status)
    }

    query += ' ORDER BY w.next_review_date ASC, w.created_at DESC'
    const { rows } = await db.query(query, params)
    return rows
  })

  // Обновить статус слова вручную (например "уже знаю")
  fastify.patch('/api/words/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new', 'learning', 'known'] },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const { status } = request.body
    const userId = request.user.id

    const { rows } = await db.query(
      'UPDATE words SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, userId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Слово не найдено' })
    return rows[0]
  })

  // Ответ на упражнение + обновление SRS
  fastify.post('/api/exercises/:id/attempt', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['userAnswer', 'quality'],
        properties: {
          userAnswer: { type: 'string' },
          quality:    { type: 'integer', minimum: 0, maximum: 5 },
        },
      },
    },
  }, async (request, reply) => {
    const exerciseId = parseInt(request.params.id)
    const { userAnswer, quality } = request.body
    const userId = request.user.id

    const { rows: exRows } = await db.query(
      'SELECT * FROM exercises WHERE id = $1',
      [exerciseId]
    )
    if (!exRows[0]) return reply.status(404).send({ error: 'Упражнение не найдено' })

    const ex = exRows[0]
    const isCorrect = quality >= 3

    // Обновляем SRS для упражнения
    const { newEf, newInterval, newReps } = sm2(
      quality,
      parseFloat(ex.easiness_factor),
      ex.interval_days,
      ex.repetitions
    )

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + newInterval)
    const nextReviewDate = nextReview.toISOString().slice(0, 10)

    await db.query(
      `UPDATE exercises
       SET easiness_factor = $1, interval_days = $2, repetitions = $3, next_review_date = $4
       WHERE id = $5`,
      [newEf, newInterval, newReps, nextReviewDate, exerciseId]
    )

    // Обновляем привязанное слово (статус по прогрессу)
    if (ex.word_id) {
      const wordStatus = newReps >= 5 ? 'known' : newReps >= 1 ? 'learning' : 'new'
      await db.query(
        `UPDATE words
         SET easiness_factor = $1, interval_days = $2, repetitions = $3,
             next_review_date = $4, status = $5
         WHERE id = $6`,
        [newEf, newInterval, newReps, nextReviewDate, wordStatus, ex.word_id]
      )
    }

    // Записываем попытку
    await db.query(
      `INSERT INTO exercise_attempts (exercise_id, user_id, user_answer, is_correct, quality)
       VALUES ($1, $2, $3, $4, $5)`,
      [exerciseId, userId, userAnswer, isCorrect, quality]
    )

    return { correct: isCorrect, nextReviewDate }
  })
}
