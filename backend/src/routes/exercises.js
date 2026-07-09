import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'
import { checkSentence, translateSentences, enrichWords } from '../services/claude.js'
import { fetchImageUrl, fetchRandomImageUrl, downloadAndSave } from '../services/unsplash.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { config } from '../config.js'

export async function exercisesRoutes(fastify) {

  // Трекер прогресса admin-операций (одна за раз, in-memory)
  const adminOp = { name: null, done: 0, total: 0, status: 'idle', updated: 0, failed: 0 }

  fastify.get('/api/admin/operation-status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    return { ...adminOp }
  })

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

    // Сколько упражнений уже изучено (next_review_date в будущем)
    const doneFilter = role === 'owner'
      ? ''
      : "JOIN lessons l2 ON l2.id = e2.lesson_id WHERE l2.status = 'done' AND"
    const doneQuery = role === 'owner'
      ? `SELECT COUNT(*)::int AS done FROM exercises e2
         JOIN user_exercise_progress uep2 ON uep2.exercise_id = e2.id AND uep2.user_id = $1
         WHERE uep2.next_review_date > $2`
      : `SELECT COUNT(*)::int AS done FROM exercises e2
         JOIN lessons l2 ON l2.id = e2.lesson_id
         JOIN user_exercise_progress uep2 ON uep2.exercise_id = e2.id AND uep2.user_id = $1
         WHERE l2.status = 'done' AND uep2.next_review_date > $2`
    const { rows: doneRows } = await db.query(doneQuery, [userId, today])
    const done = doneRows[0]?.done ?? 0

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

    // Статистика уроков
    const { rows: lessonStats } = await db.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'done')::int AS done_count
       FROM lessons WHERE owner_id = $1`,
      [userId]
    )
    const lessonsTotal = lessonStats[0]?.total ?? 0
    const lessonsDone  = lessonStats[0]?.done_count ?? 0

    return { total, done, byType, lessons, lessonsTotal, lessonsDone }
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

    const remoteUrl = await fetchRandomImageUrl(rows[0].word_de)
    if (!remoteUrl) return reply.status(502).send({ error: 'Unsplash не вернул картинку' })

    const imageUrl = await downloadAndSave(remoteUrl, wordId)
    await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [imageUrl, wordId])
    return { image_url: imageUrl }
  })

  // Загрузка своей картинки для слова
  fastify.post('/api/words/:id/upload-image', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const wordId = parseInt(request.params.id)

    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Файл не передан' })

    const buf = await data.toBuffer()
    const ext = extname(data.filename || '.jpg').toLowerCase() || '.jpg'
    const dir = join(config.uploadDir, 'word-images')
    mkdirSync(dir, { recursive: true })
    const filename = `word_${wordId}${ext}`
    writeFileSync(join(dir, filename), buf)
    const imageUrl = `/uploads/word-images/${filename}`

    await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [imageUrl, wordId])
    return { image_url: imageUrl }
  })

  // Загрузка картинок: сначала слова, потом упражнения без image_url
  fastify.post('/api/admin/fetch-images', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    // Оба запроса до начала обработки — чтобы знать total сразу
    const { rows: words } = await db.query(
      `SELECT id, word_de FROM words WHERE image_url IS NULL ORDER BY id`
    )
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

    Object.assign(adminOp, { name: 'fetch-images', done: 0, total: words.length + exs.length, status: 'running', updated: 0, failed: 0 })

    for (const word of words) {
      try {
        const remoteUrl = await fetchImageUrl(word.word_de)
        if (remoteUrl) {
          const localUrl = await downloadAndSave(remoteUrl, word.id)
          await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [localUrl, word.id])
          adminOp.updated++
        } else { adminOp.failed++ }
        await new Promise(r => setTimeout(r, 250))
      } catch { adminOp.failed++ }
      adminOp.done++
    }

    for (const ex of exs) {
      if (!ex.word_de) { adminOp.failed++; adminOp.done++; continue }
      try {
        const { rows: cached } = await db.query(
          `SELECT image_url FROM words WHERE LOWER(word_de) = LOWER($1) AND image_url IS NOT NULL LIMIT 1`,
          [ex.word_de]
        )
        const url = cached[0]?.image_url ?? await fetchImageUrl(ex.word_de)
        if (url) {
          await db.query('UPDATE exercises SET image_url = $1 WHERE id = $2', [url, ex.id])
          adminOp.updated++
        } else { adminOp.failed++ }
        await new Promise(r => setTimeout(r, 250))
      } catch { adminOp.failed++ }
      adminOp.done++
    }

    adminOp.status = 'done'
    return { total: adminOp.total, updated: adminOp.updated, failed: adminOp.failed }
  })

  // Дополнить словарь: переводы + примеры для всех неполных слов
  fastify.post('/api/admin/enrich-words', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    const { rows } = await db.query(
      `SELECT id, word_de, translation_ru,
              (word_de = translation_ru) AS needs_translation,
              (example_sentence IS NULL) AS needs_example
       FROM words
       WHERE example_sentence IS NULL OR word_de = translation_ru
       ORDER BY id`
    )
    if (!rows.length) return { updated: 0 }

    Object.assign(adminOp, { name: 'enrich-words', done: 0, total: rows.length, status: 'running', updated: 0, failed: 0 })

    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20)
      const results = await enrichWords(batch)
      for (const r of results) {
        if (!r) continue
        await db.query(
          `UPDATE words SET
             translation_ru     = CASE WHEN word_de = translation_ru THEN $1 ELSE translation_ru END,
             example_sentence   = COALESCE(example_sentence, $2),
             example_sentence_ru = COALESCE(example_sentence_ru, $3)
           WHERE id = $4`,
          [r.translation_ru, r.example_sentence, r.example_sentence_ru, r.id]
        )
        adminOp.updated++
      }
      adminOp.done = Math.min(i + 20, rows.length)
    }

    adminOp.status = 'done'
    return { updated: adminOp.updated, total: rows.length }
  })

  // Перевести примеры предложений для всех слов без example_sentence_ru
  fastify.post('/api/admin/translate-sentences', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    const { rows } = await db.query(
      `SELECT id, example_sentence FROM words
       WHERE example_sentence IS NOT NULL AND example_sentence_ru IS NULL
       ORDER BY id`
    )
    if (!rows.length) return { updated: 0 }

    Object.assign(adminOp, { name: 'translate-sentences', done: 0, total: rows.length, status: 'running', updated: 0, failed: 0 })

    const BATCH = 25
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const results = await translateSentences(batch.map(r => ({ id: r.id, sentence: r.example_sentence })))
      for (const r of results) {
        if (!r.translation) continue
        await db.query('UPDATE words SET example_sentence_ru = $1 WHERE id = $2', [r.translation, r.id])
        adminOp.updated++
      }
      adminOp.done = Math.min(i + BATCH, rows.length)
    }

    adminOp.status = 'done'
    return { updated: adminOp.updated, total: rows.length }
  })

  // Поиск слова по написанию (для читалки)
  fastify.get('/api/words/lookup', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const q = (request.query.q || '').trim().toLowerCase()
    if (!q) return null
    const { rows } = await db.query(
      `SELECT word_de, translation_ru, example_sentence, example_sentence_ru, image_url
       FROM words
       WHERE LOWER(word_de) = $1
          OR LOWER(REPLACE(word_de, 'ä', 'ae')) = LOWER(REPLACE($1, 'ä', 'ae'))
       LIMIT 1`,
      [q]
    )
    return rows[0] || null
  })
}
