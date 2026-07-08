import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'
import { checkSentence } from '../services/claude.js'
import { fetchImageUrl, fetchRandomImageUrl } from '../services/unsplash.js'

export async function exercisesRoutes(fastify) {

  // Упражнения на сегодня — прогресс берётся из user_exercise_progress для каждого юзера отдельно
  fastify.get('/api/exercises/today', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)
    const { type, lesson_id } = request.query

    const SELECT = `
        SELECT e.*,
               w.word_de, w.translation_ru,
               COALESCE(w.image_url, e.image_url) AS image_url,
               l.title AS lesson_title,
               COALESCE(uep.easiness_factor,  2.5)         AS easiness_factor,
               COALESCE(uep.interval_days,    0)            AS interval_days,
               COALESCE(uep.repetitions,      0)            AS repetitions,
               COALESCE(uep.next_review_date, CURRENT_DATE) AS next_review_date
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN words w ON w.id = e.word_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1`

    let query, params
    if (role === 'owner') {
      params = [userId, today]
      if (type)      params.push(type)
      if (lesson_id) params.push(parseInt(lesson_id))
      const p = params.length
      query = SELECT + `
        WHERE COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
          ${type      ? `AND e.type      = $${p - (lesson_id ? 1 : 0)}` : ''}
          ${lesson_id ? `AND e.lesson_id = $${p}` : ''}
        ORDER BY COALESCE(uep.next_review_date, CURRENT_DATE) ASC LIMIT 50`
    } else {
      params = [userId, today]
      if (type)      params.push(type)
      if (lesson_id) params.push(parseInt(lesson_id))
      const p = params.length
      query = SELECT + `
        WHERE l.status = 'done'
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
          ${type      ? `AND e.type      = $${p - (lesson_id ? 1 : 0)}` : ''}
          ${lesson_id ? `AND e.lesson_id = $${p}` : ''}
        ORDER BY COALESCE(uep.next_review_date, CURRENT_DATE) ASC LIMIT 50`
    }

    const { rows } = await db.query(query, params)
    return rows
  })

  // Статистика для дашборда — по урокам и типам, per-user
  fastify.get('/api/exercises/stats', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)

    let query, params
    if (role === 'owner') {
      params = [userId, today]
      query = `
        SELECT l.id AS lesson_id, l.title AS lesson_title, l.description AS lesson_description,
               e.type, COUNT(*)::int AS count
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
        GROUP BY l.id, l.title, l.description, e.type
        ORDER BY l.id, e.type`
    } else {
      params = [userId, today]
      query = `
        SELECT l.id AS lesson_id, l.title AS lesson_title, l.description AS lesson_description,
               e.type, COUNT(*)::int AS count
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE l.status = 'done'
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
        GROUP BY l.id, l.title, l.description, e.type
        ORDER BY l.id, e.type`
    }

    const { rows } = await db.query(query, params)

    // Группируем по урокам
    const lessonsMap = {}
    for (const r of rows) {
      if (!lessonsMap[r.lesson_id]) {
        lessonsMap[r.lesson_id] = { lesson_id: r.lesson_id, lesson_title: r.lesson_title, lesson_description: r.lesson_description, total: 0, byType: {} }
      }
      lessonsMap[r.lesson_id].byType[r.type] = r.count
      lessonsMap[r.lesson_id].total += r.count
    }
    const lessons = Object.values(lessonsMap)
    const total   = lessons.reduce((s, l) => s + l.total, 0)
    const byType  = {}
    for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + r.count

    return { total, byType, lessons }
  })

  // Словарь — per-user статус через user_word_status
  fastify.get('/api/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const { status } = request.query

    let lessonFilter, params
    if (role === 'owner') {
      lessonFilter = '1=1'
      params = [userId]
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

  // Обновить картинку одного слова — получает случайную новую
  fastify.post('/api/words/:id/refresh-image', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const wordId = parseInt(request.params.id)

    const { rows } = await db.query('SELECT id, word_de FROM words WHERE id = $1', [wordId])
    if (!rows[0]) return reply.status(404).send({ error: 'Слово не найдено' })

    const imageUrl = await fetchRandomImageUrl(rows[0].word_de)
    if (!imageUrl) return reply.status(502).send({ error: 'Unsplash не вернул картинку' })

    await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [imageUrl, wordId])
    return { image_url: imageUrl }
  })

  // Загрузка картинок: сначала слова, потом упражнения без image_url
  fastify.post('/api/admin/fetch-images', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    let updated = 0
    let failed  = 0

    // 1. Слова без image_url
    const { rows: words } = await db.query(
      `SELECT id, word_de FROM words WHERE image_url IS NULL ORDER BY id`
    )
    for (const word of words) {
      try {
        const url = await fetchImageUrl(word.word_de)
        if (url) {
          await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [url, word.id])
          updated++
        } else { failed++ }
        await new Promise(r => setTimeout(r, 250))
      } catch { failed++ }
    }

    // 2. Упражнения без image_url — ищем слово из payload
    const { rows: exs } = await db.query(`
      SELECT e.id, e.type,
        COALESCE(w.word_de,
          e.payload->>'question',
          e.payload->>'word_de',
          e.payload->>'blank'
        ) AS word_de
      FROM exercises e
      LEFT JOIN words w ON w.id = e.word_id
      WHERE e.image_url IS NULL
        AND COALESCE(w.image_url, '') = ''
      ORDER BY e.id
    `)

    for (const ex of exs) {
      if (!ex.word_de) { failed++; continue }
      try {
        // Сначала проверяем есть ли уже в words для этого слова
        const { rows: cached } = await db.query(
          `SELECT image_url FROM words WHERE LOWER(word_de) = LOWER($1) AND image_url IS NOT NULL LIMIT 1`,
          [ex.word_de]
        )
        const url = cached[0]?.image_url ?? await fetchImageUrl(ex.word_de)
        if (url) {
          await db.query('UPDATE exercises SET image_url = $1 WHERE id = $2', [url, ex.id])
          updated++
        } else { failed++ }
        await new Promise(r => setTimeout(r, 250))
      } catch { failed++ }
    }

    return { total: words.length + exs.length, updated, failed }
  })
}
