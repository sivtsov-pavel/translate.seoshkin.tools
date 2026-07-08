import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'
import { checkSentence } from '../services/claude.js'

export async function exercisesRoutes(fastify) {
  // Упражнения на сегодня по SRS очереди
  // Owner видит свои уроки; student видит все готовые уроки класса
  fastify.get('/api/exercises/today', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)

    const filter = role === 'owner'
      ? 'l.owner_id = $1'
      : 'l.status = $1'
    const param  = role === 'owner' ? userId : 'done'

    const { type } = request.query
    const typeFilter = type ? ` AND e.type = $3` : ''

    const { rows } = await db.query(
      `SELECT e.*, w.word_de, w.translation_ru
       FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN words w ON w.id = e.word_id
       WHERE ${filter}
         AND e.next_review_date <= $2
         ${typeFilter}
       ORDER BY e.next_review_date ASC
       LIMIT 50`,
      type ? [param, today, type] : [param, today]
    )
    return rows
  })

  // Статистика для дашборда — сколько упражнений по типам ждут сегодня
  fastify.get('/api/exercises/stats', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)

    const filter = role === 'owner'
      ? 'l.owner_id = $1'
      : 'l.status = $1'
    const param  = role === 'owner' ? userId : 'done'

    const { rows } = await db.query(
      `SELECT e.type, COUNT(*)::int AS count
       FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       WHERE ${filter}
         AND e.next_review_date <= $2
       GROUP BY e.type`,
      [param, today]
    )

    const byType = Object.fromEntries(rows.map(r => [r.type, r.count]))
    const total = rows.reduce((s, r) => s + r.count, 0)
    return { total, byType }
  })

  // Словарь: owner — свои слова; student — все слова из готовых уроков
  fastify.get('/api/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const { status } = request.query

    let query, params
    if (role === 'owner') {
      query = `SELECT w.*, l.title AS lesson_title
               FROM words w
               LEFT JOIN lessons l ON l.id = w.lesson_id
               WHERE w.user_id = $1`
      params = [userId]
    } else {
      query = `SELECT w.*, l.title AS lesson_title
               FROM words w
               LEFT JOIN lessons l ON l.id = w.lesson_id
               WHERE l.status = 'done'`
      params = []
    }

    if (status) {
      query += ` AND w.status = $${params.length + 1}`
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

  // Проверка предложения через Claude + автоматическая запись попытки
  fastify.post('/api/exercises/:id/check-sentence', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['sentence'],
        properties: {
          sentence: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const exerciseId = parseInt(request.params.id)
    const { sentence } = request.body
    const userId = request.user.id

    const { rows: exRows } = await db.query(
      'SELECT * FROM exercises WHERE id = $1',
      [exerciseId]
    )
    if (!exRows[0]) return reply.status(404).send({ error: 'Упражнение не найдено' })

    const ex = exRows[0]
    const { word_de, translation_ru } = ex.payload

    // Проверяем предложение через Claude
    const result = await checkSentence(word_de, translation_ru, sentence)

    // Обновляем SRS и записываем попытку
    const { newEf, newInterval, newReps } = sm2(
      result.quality,
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

    await db.query(
      `INSERT INTO exercise_attempts (exercise_id, user_id, user_answer, is_correct, quality)
       VALUES ($1, $2, $3, $4, $5)`,
      [exerciseId, userId, sentence, result.correct, result.quality]
    )

    return { ...result, nextReviewDate }
  })
}
