import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'
import { checkSentence } from '../services/claude.js'

export async function exercisesRoutes(fastify) {

  // Упражнения на сегодня — прогресс берётся из user_exercise_progress для каждого юзера отдельно
  fastify.get('/api/exercises/today', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)
    const { type } = request.query

    // $1 = userId (для LEFT JOIN uep), $2 = owner фильтр (или today для student), $3 = today / type
    let query, params
    if (role === 'owner') {
      params = [userId, userId, today]
      if (type) params.push(type)
      query = `
        SELECT e.*,
               w.word_de, w.translation_ru,
               l.title AS lesson_title,
               COALESCE(uep.easiness_factor,  2.5)         AS easiness_factor,
               COALESCE(uep.interval_days,    0)            AS interval_days,
               COALESCE(uep.repetitions,      0)            AS repetitions,
               COALESCE(uep.next_review_date, CURRENT_DATE) AS next_review_date
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN words w ON w.id = e.word_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE l.owner_id = $2
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $3
          ${type ? 'AND e.type = $4' : ''}
        ORDER BY COALESCE(uep.next_review_date, CURRENT_DATE) ASC
        LIMIT 50`
    } else {
      params = [userId, today]
      if (type) params.push(type)
      query = `
        SELECT e.*,
               w.word_de, w.translation_ru,
               l.title AS lesson_title,
               COALESCE(uep.easiness_factor,  2.5)         AS easiness_factor,
               COALESCE(uep.interval_days,    0)            AS interval_days,
               COALESCE(uep.repetitions,      0)            AS repetitions,
               COALESCE(uep.next_review_date, CURRENT_DATE) AS next_review_date
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN words w ON w.id = e.word_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE l.status = 'done'
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
          ${type ? 'AND e.type = $3' : ''}
        ORDER BY COALESCE(uep.next_review_date, CURRENT_DATE) ASC
        LIMIT 50`
    }

    const { rows } = await db.query(query, params)
    return rows
  })

  // Статистика для дашборда — per-user очередь
  fastify.get('/api/exercises/stats', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)

    let query, params
    if (role === 'owner') {
      params = [userId, userId, today]
      query = `
        SELECT e.type, COUNT(*)::int AS count
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE l.owner_id = $2
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $3
        GROUP BY e.type`
    } else {
      params = [userId, today]
      query = `
        SELECT e.type, COUNT(*)::int AS count
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE l.status = 'done'
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
        GROUP BY e.type`
    }

    const { rows } = await db.query(query, params)
    const byType = Object.fromEntries(rows.map(r => [r.type, r.count]))
    const total  = rows.reduce((s, r) => s + r.count, 0)
    return { total, byType }
  })

  // Словарь — per-user статус через user_word_status
  fastify.get('/api/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const { status } = request.query

    let lessonFilter, params
    if (role === 'owner') {
      lessonFilter = 'l.owner_id = $2'
      params = [userId, userId]
    } else {
      lessonFilter = "l.status = 'done'"
      params = [userId]
    }

    let query = `
      SELECT w.*,
             l.title AS lesson_title,
             COALESCE(uws.status, w.status, 'new') AS status
      FROM words w
      LEFT JOIN lessons l ON l.id = w.lesson_id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = $1
      WHERE ${lessonFilter}`

    if (status) {
      query += ` AND COALESCE(uws.status, w.status, 'new') = $${params.length + 1}`
      params.push(status)
    }

    query += ' ORDER BY w.created_at DESC'
    const { rows } = await db.query(query, params)
    return rows
  })

  // Обновить статус слова — per-user через user_word_status
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
    const wordId = parseInt(request.params.id)
    const { status } = request.body
    const userId = request.user.id

    const { rows: wRows } = await db.query('SELECT id FROM words WHERE id = $1', [wordId])
    if (!wRows[0]) return reply.status(404).send({ error: 'Слово не найдено' })

    await db.query(
      `INSERT INTO user_word_status (user_id, word_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, word_id) DO UPDATE SET status = $3`,
      [userId, wordId, status]
    )
    return { id: wordId, status }
  })

  // Ответ на упражнение + per-user SRS
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

    // Текущий прогресс пользователя (или дефолт SM-2)
    const { rows: progRows } = await db.query(
      `SELECT * FROM user_exercise_progress WHERE user_id = $1 AND exercise_id = $2`,
      [userId, exerciseId]
    )
    const prog = progRows[0] ?? { easiness_factor: 2.5, interval_days: 0, repetitions: 0 }

    const { newEf, newInterval, newReps } = sm2(
      quality,
      parseFloat(prog.easiness_factor),
      prog.interval_days,
      prog.repetitions
    )

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + newInterval)
    const nextReviewDate = nextReview.toISOString().slice(0, 10)

    await db.query(
      `INSERT INTO user_exercise_progress
         (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, exercise_id) DO UPDATE
         SET easiness_factor = $3, interval_days = $4,
             repetitions = $5, next_review_date = $6`,
      [userId, exerciseId, newEf, newInterval, newReps, nextReviewDate]
    )

    // Per-user статус слова
    const { rows: exRows } = await db.query(
      'SELECT word_id FROM exercises WHERE id = $1', [exerciseId]
    )
    if (exRows[0]?.word_id) {
      const wordStatus = newReps >= 5 ? 'known' : newReps >= 1 ? 'learning' : 'new'
      await db.query(
        `INSERT INTO user_word_status (user_id, word_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, word_id) DO UPDATE SET status = $3`,
        [userId, exRows[0].word_id, wordStatus]
      )
    }

    await db.query(
      `INSERT INTO exercise_attempts (exercise_id, user_id, user_answer, is_correct, quality)
       VALUES ($1, $2, $3, $4, $5)`,
      [exerciseId, userId, userAnswer, quality >= 3, quality]
    )

    return { correct: quality >= 3, nextReviewDate }
  })

  // Проверка предложения через Claude + per-user SRS
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
      'SELECT * FROM exercises WHERE id = $1', [exerciseId]
    )
    if (!exRows[0]) return reply.status(404).send({ error: 'Упражнение не найдено' })

    const ex = exRows[0]
    const { word_de, translation_ru } = ex.payload

    const result = await checkSentence(word_de, translation_ru, sentence)

    const { rows: progRows } = await db.query(
      `SELECT * FROM user_exercise_progress WHERE user_id = $1 AND exercise_id = $2`,
      [userId, exerciseId]
    )
    const prog = progRows[0] ?? { easiness_factor: 2.5, interval_days: 0, repetitions: 0 }

    const { newEf, newInterval, newReps } = sm2(
      result.quality,
      parseFloat(prog.easiness_factor),
      prog.interval_days,
      prog.repetitions
    )

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + newInterval)
    const nextReviewDate = nextReview.toISOString().slice(0, 10)

    await db.query(
      `INSERT INTO user_exercise_progress
         (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, exercise_id) DO UPDATE
         SET easiness_factor = $3, interval_days = $4,
             repetitions = $5, next_review_date = $6`,
      [userId, exerciseId, newEf, newInterval, newReps, nextReviewDate]
    )

    if (ex.word_id) {
      const wordStatus = newReps >= 5 ? 'known' : newReps >= 1 ? 'learning' : 'new'
      await db.query(
        `INSERT INTO user_word_status (user_id, word_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, word_id) DO UPDATE SET status = $3`,
        [userId, ex.word_id, wordStatus]
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
