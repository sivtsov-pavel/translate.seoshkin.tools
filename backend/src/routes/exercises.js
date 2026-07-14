import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'
import { checkSentence, translateSentences, enrichWords, translateWordsToAllLangs, translateExercisePayloads, translateLessonTitles, translateMcOptionsToGerman } from '../services/claude.js'
import { fetchImageUrl, fetchRandomImageUrl, downloadAndSave } from '../services/unsplash.js'
import { generateWordImage } from '../services/imageGen.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { config } from '../config.js'

async function getUserDailyLimit(userId) {
  const { rows } = await db.query(
    `SELECT us.daily_limit, u.plan,
            (SELECT config FROM platform_settings WHERE id = 1) AS pconfig
     FROM users u LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.id = $1`, [userId]
  )
  let limit = rows[0]?.daily_limit ?? 50
  // Платформенный лимит для бесплатных (v2): режет личную цель, но только когда
  // включена платная версия и пользователь не премиум. Иначе не трогаем.
  const mon = rows[0]?.pconfig?.monetization
  const plan = rows[0]?.plan ?? 'free'
  if (mon?.paid_enabled && plan !== 'premium' && mon.free_daily_limit > 0) {
    limit = Math.min(limit, mon.free_daily_limit)
  }
  return limit
}

export async function exercisesRoutes(fastify) {

  // Трекер прогресса admin-операций (одна за раз, in-memory)
  const adminOp = { name: null, done: 0, total: 0, status: 'idle', updated: 0, failed: 0 }
  let _resetTimer = null
  function finishAdminOp() {
    adminOp.status = 'done'
    if (_resetTimer) clearTimeout(_resetTimer)
    _resetTimer = setTimeout(() => {
      Object.assign(adminOp, { name: null, done: 0, total: 0, status: 'idle', updated: 0, failed: 0, error: null })
    }, 30_000)
  }

  fastify.get('/api/admin/operation-status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    return { ...adminOp }
  })

  fastify.get('/api/admin/report', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { rows } = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM words) AS words_total,
        (SELECT COUNT(*)::int FROM words WHERE image_url IS NOT NULL) AS words_with_images,
        (SELECT COUNT(*)::int FROM words WHERE translations IS NOT NULL AND translations != '{}') AS words_translated,
        (SELECT COUNT(*)::int FROM words WHERE translation_ru IS NOT NULL AND translation_ru != '') AS words_with_ru,
        (SELECT COUNT(*)::int FROM words WHERE example_sentence IS NOT NULL) AS words_with_example,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'multiple_choice') AS mc_total,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'multiple_choice' AND payload_translations IS NOT NULL AND payload_translations != '{}') AS mc_translated,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'fill_blank') AS fb_total,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'fill_blank' AND payload_translations IS NOT NULL AND payload_translations != '{}') AS fb_translated,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'sentence_write') AS sw_total,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'sentence_write' AND payload_translations IS NOT NULL AND payload_translations != '{}') AS sw_translated,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'dictation') AS dict_total,
        (SELECT COUNT(*)::int FROM exercises WHERE type = 'flashcard') AS fc_total,
        (SELECT COUNT(*)::int FROM lessons) AS lessons_total,
        (SELECT COUNT(*)::int FROM lessons WHERE status = 'done') AS lessons_done,
        (SELECT COUNT(*)::int FROM lessons WHERE status = 'processing') AS lessons_processing
    `)
    return { ...rows[0], op: { ...adminOp } }
  })

  // Упражнения на сегодня — прогресс берётся из user_exercise_progress для каждого юзера отдельно
  fastify.get('/api/exercises/today', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const today = new Date().toISOString().slice(0, 10)
    const { type, lesson_id } = request.query
    const dailyLimit = await getUserDailyLimit(userId)

    const SELECT = `
        SELECT e.*,
               w.word_de, w.translation_ru, COALESCE(w.translations, '{}') AS translations,
               COALESCE(e.payload_translations, '{}') AS payload_translations,
               COALESCE(w.image_url, e.image_url) AS image_url,
               l.title AS lesson_title,
               COALESCE(l.title_translations, '{}') AS lesson_title_translations,
               COALESCE(uep.easiness_factor,  2.5)         AS easiness_factor,
               COALESCE(uep.interval_days,    0)            AS interval_days,
               COALESCE(uep.repetitions,      0)            AS repetitions,
               COALESCE(uep.next_review_date, CURRENT_DATE) AS next_review_date
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN words w ON w.id = e.word_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1`

    // Когда фильтр по конкретному уроку — берём все упражнения урока (max 300),
    // иначе применяем дневной лимит пользователя
    const limit = lesson_id ? 300 : dailyLimit
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
        ORDER BY COALESCE(uep.next_review_date, CURRENT_DATE) ASC, RANDOM() LIMIT ${limit}`
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
        ORDER BY COALESCE(uep.next_review_date, CURRENT_DATE) ASC, RANDOM() LIMIT ${limit}`
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
               l.date AS lesson_date,
               COALESCE(l.title_translations, '{}') AS lesson_title_translations,
               e.type, COUNT(*)::int AS count
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
        GROUP BY l.id, l.title, l.description, l.date, l.title_translations, e.type
        ORDER BY l.id, e.type`
    } else {
      params = [userId, today]
      query = `
        SELECT l.id AS lesson_id, l.title AS lesson_title, l.description AS lesson_description,
               l.date AS lesson_date,
               COALESCE(l.title_translations, '{}') AS lesson_title_translations,
               e.type, COUNT(*)::int AS count
        FROM exercises e
        JOIN lessons l ON l.id = e.lesson_id
        LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
        WHERE l.status = 'done'
          AND COALESCE(uep.next_review_date, CURRENT_DATE) <= $2
        GROUP BY l.id, l.title, l.description, l.date, l.title_translations, e.type
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
        lessonsMap[r.lesson_id] = { lesson_id: r.lesson_id, lesson_title: r.lesson_title, lesson_title_translations: r.lesson_title_translations, lesson_description: r.lesson_description, lesson_date: r.lesson_date, total: 0, byType: {}, words_count: 0 }
      }
      lessonsMap[r.lesson_id].byType[r.type] = r.count
      lessonsMap[r.lesson_id].total += r.count
    }
    // Количество уникальных слов на урок + сколько уже изучено (next_review > today)
    const lessonIds = Object.keys(lessonsMap).map(Number)
    if (lessonIds.length > 0) {
      const { rows: wRows } = await db.query(
        `SELECT e.lesson_id, COUNT(DISTINCT e.word_id)::int AS words_count
         FROM exercises e WHERE e.lesson_id = ANY($1) AND e.word_id IS NOT NULL
         GROUP BY e.lesson_id`,
        [lessonIds]
      )
      for (const r of wRows) {
        if (lessonsMap[r.lesson_id]) lessonsMap[r.lesson_id].words_count = r.words_count
      }
      // Сколько упражнений по уроку уже "в будущем" (изучены, не требуют повторения сегодня)
      const { rows: doneByLesson } = await db.query(
        `SELECT e.lesson_id,
                COUNT(*)::int AS total_ex,
                COUNT(*) FILTER (WHERE uep.next_review_date > $2)::int AS done_ex
         FROM exercises e
         LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
         WHERE e.lesson_id = ANY($3)
         GROUP BY e.lesson_id`,
        [userId, today, lessonIds]
      )
      for (const r of doneByLesson) {
        if (lessonsMap[r.lesson_id]) {
          lessonsMap[r.lesson_id].total_ex = r.total_ex
          lessonsMap[r.lesson_id].done_ex  = r.done_ex
          lessonsMap[r.lesson_id].done_pct = r.total_ex > 0 ? Math.round(r.done_ex / r.total_ex * 100) : 0
        }
      }
    }
    // Последний урок сверху по дате; части/темы одного урока (одна дата) идут подряд по id возр.
    const lessons = Object.values(lessonsMap).sort((a, b) =>
      String(b.lesson_date).localeCompare(String(a.lesson_date)) || (a.lesson_id - b.lesson_id))
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

    // Владелец видит только СВОИ слова; ученик — слова из готовых уроков.
    // Дедуп по немецкому слову (DISTINCT ON): в общем пуле несколько учителей
    // могут иметь одно и то же слово — ученик не должен видеть дубли.
    const params = [userId]
    // Учитель видит слова СВОИХ уроков (по владельцу урока, а не по автору строки слова —
    // при загрузке/обработке слово могло получить чужой user_id). Ученик — из готовых уроков.
    const lessonFilter = role === 'owner' ? 'l.owner_id = $1' : "l.status = 'done'"

    let statusCond = ''
    if (status) {
      statusCond = ` AND COALESCE(uws.status, w.status, 'new') = $${params.length + 1}`
      params.push(status)
    }

    const inner = `
      SELECT DISTINCT ON (w.word_de) w.*,
             COALESCE(w.image_url, (
               SELECT e.image_url FROM exercises e
               WHERE e.word_id = w.id AND e.image_url IS NOT NULL LIMIT 1
             )) AS image_url,
             l.title AS lesson_title,
             l.course_id AS course_id,
             c.title AS course_title,
             COALESCE(l.title_translations, '{}') AS lesson_title_translations,
             COALESCE(uws.status, w.status, 'new') AS status
      FROM words w
      LEFT JOIN lessons l ON l.id = w.lesson_id
      LEFT JOIN courses c ON c.id = l.course_id
      LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = $1
      WHERE ${lessonFilter}${statusCond}
      ORDER BY w.word_de, (w.image_url IS NOT NULL) DESC, w.created_at DESC`

    const { rows } = await db.query(`SELECT * FROM (${inner}) t ORDER BY t.created_at DESC`, params)
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
          translation_ru: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const wordId = parseInt(request.params.id)
    const { status, translation_ru } = request.body
    const userId = request.user.id

    const { rows: wRows } = await db.query('SELECT id FROM words WHERE id = $1', [wordId])
    if (!wRows[0]) return reply.status(404).send({ error: 'Слово не найдено' })

    if (translation_ru !== undefined) {
      if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только учитель может редактировать перевод' })
      await db.query('UPDATE words SET translation_ru = $1 WHERE id = $2', [translation_ru.trim(), wordId])
      return { id: wordId, translation_ru: translation_ru.trim() }
    }

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
          lang: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const exerciseId = parseInt(request.params.id)
    const { sentence, lang } = request.body
    const userId = request.user.id

    const { rows: exRows } = await db.query(
      'SELECT * FROM exercises WHERE id = $1', [exerciseId]
    )
    if (!exRows[0]) return reply.status(404).send({ error: 'Упражнение не найдено' })

    const ex = exRows[0]
    const { word_de, translation_ru } = ex.payload

    const result = await checkSentence(word_de, translation_ru, sentence, lang || 'ru')

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

    const { rows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE id = $1', [wordId])
    if (!rows[0]) return reply.status(404).send({ error: 'Слово не найдено' })

    const { word_de, translation_ru } = rows[0]
    // Кнопка «обновить фото» теперь ГЕНЕРИРУЕТ новую детскую картинку (gpt-image-1),
    // а не ищет фото в Unsplash. По просьбе Павла — единый детский стиль.
    const imageUrl = await generateWordImage(word_de, translation_ru, wordId)
    if (!imageUrl) return reply.status(502).send({ error: 'Не удалось сгенерировать картинку' })

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

  // Загрузка картинок для слов без image_url
  fastify.post('/api/admin/fetch-images', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    const { rows: words } = await db.query(
      `SELECT id, word_de, translation_ru FROM words WHERE image_url IS NULL ORDER BY id`
    )

    Object.assign(adminOp, { name: 'fetch-images', done: 0, total: words.length, status: 'running', updated: 0, failed: 0 })

    for (const word of words) {
      try {
        // Сначала по-русски, если не нашли — по-немецки (Unsplash плохо знает кириллицу)
        const remoteUrl = (word.translation_ru ? await fetchImageUrl(word.translation_ru) : null)
          ?? await fetchImageUrl(word.word_de)
        if (remoteUrl) {
          const localUrl = await downloadAndSave(remoteUrl, word.id)
          await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [localUrl, word.id])
          adminOp.updated++
        } else { adminOp.failed++ }
        await new Promise(r => setTimeout(r, 250))
      } catch { adminOp.failed++ }
      adminOp.done++
    }

    finishAdminOp()
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

    finishAdminOp()
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

    finishAdminOp()
    return { updated: adminOp.updated, total: rows.length }
  })

  fastify.post('/api/admin/translate-words-all-langs', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (adminOp.status === 'running') return reply.status(409).send({ error: 'Операция уже выполняется' })

    const { rows } = await db.query(
      `SELECT id, word_de, translation_ru FROM words
       WHERE translations IS NULL OR translations = '{}' OR NOT (translations ? 'sq')
       ORDER BY id`
    )
    if (!rows.length) return { updated: 0, total: 0 }

    Object.assign(adminOp, { name: 'translate-words-all-langs', done: 0, total: rows.length, status: 'running', updated: 0, failed: 0 })
    // Отвечаем немедленно — операция продолжается в фоне
    reply.code(202).send({ started: true, total: rows.length })

    try {
      const results = await translateWordsToAllLangs(rows)
      for (const [id, t] of Object.entries(results)) {
        await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(t), parseInt(id)])
        adminOp.updated++
        adminOp.done++
      }
      finishAdminOp()
    } catch (e) {
      adminOp.status = 'error'
      adminOp.error = e.message
    }
  })

  fastify.post('/api/admin/translate-exercises', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (adminOp.status === 'running') return reply.status(409).send({ error: 'Операция уже выполняется' })

    const { rows } = await db.query(
      `SELECT id, type, payload FROM exercises
       WHERE type IN ('multiple_choice', 'fill_blank', 'sentence_write')
         AND (
           payload_translations IS NULL
           OR payload_translations = '{}'
           OR (type = 'fill_blank' AND (payload_translations->>'ru') IS NULL)
           OR (type = 'fill_blank' AND (payload_translations->>'ru') = '')
           OR NOT (payload_translations ? 'sq')
         )
       ORDER BY id`
    )
    if (!rows.length) return { updated: 0, total: 0 }

    Object.assign(adminOp, { name: 'translate-exercises', done: 0, total: rows.length, status: 'running', updated: 0, failed: 0 })
    // Отвечаем немедленно — операция продолжается в фоне (до 10 минут)
    reply.code(202).send({ started: true, total: rows.length })

    try {
      const BATCH = 15
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        try {
          const results = await translateExercisePayloads(batch)
          for (const [id, langs] of Object.entries(results)) {
            await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
            adminOp.updated++
          }
        } catch (e) {
          console.error(`translate-exercises батч ${i}: ${e.message}`)
          adminOp.failed += batch.length
        }
        adminOp.done = Math.min(i + BATCH, rows.length)
      }
      finishAdminOp()
    } catch (e) {
      adminOp.status = 'error'
      adminOp.error = e.message
    }
  })

  // Перевод заголовков уроков на все языки
  fastify.post('/api/admin/translate-lesson-titles', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (adminOp.status === 'running') return reply.status(409).send({ error: 'Операция уже выполняется' })

    const { rows } = await db.query(
      `SELECT id, title FROM lessons
       WHERE title_translations IS NULL OR title_translations = '{}' OR NOT (title_translations ? 'sq')
       ORDER BY id`
    )
    if (!rows.length) return { updated: 0, total: 0 }

    Object.assign(adminOp, { name: 'translate-lesson-titles', done: 0, total: rows.length, status: 'running', updated: 0, failed: 0 })
    reply.code(202).send({ started: true, total: rows.length })

    try {
      const results = await translateLessonTitles(rows)
      for (const [id, langs] of Object.entries(results)) {
        await db.query('UPDATE lessons SET title_translations = COALESCE(title_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
        adminOp.updated++
      }
      adminOp.done = rows.length
      finishAdminOp()
    } catch (e) {
      adminOp.status = 'error'
      adminOp.error = e.message
    }
  })

  // Перевод вариантов multiple_choice на немецкий (для проверки учителем)
  fastify.post('/api/admin/translate-mc-to-german', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (adminOp.status === 'running') return reply.status(409).send({ error: 'Операция уже выполняется' })

    const { rows } = await db.query(
      `SELECT id, payload FROM exercises
       WHERE type = 'multiple_choice'
         AND (payload_translations->>'de') IS NULL
       ORDER BY id`
    )
    if (!rows.length) return { updated: 0, total: 0 }

    Object.assign(adminOp, { name: 'translate-mc-to-german', done: 0, total: rows.length, status: 'running', updated: 0, failed: 0 })
    reply.code(202).send({ started: true, total: rows.length })

    try {
      const BATCH = 20
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        try {
          const results = await translateMcOptionsToGerman(batch)
          for (const [id, deOpts] of Object.entries(results)) {
            await db.query(
              `UPDATE exercises SET payload_translations = payload_translations || jsonb_build_object('de', $1::jsonb) WHERE id = $2`,
              [JSON.stringify(deOpts), parseInt(id)]
            )
            adminOp.updated++
          }
        } catch (e) {
          console.error(`translate-mc-to-german батч ${i}: ${e.message}`)
          adminOp.failed += batch.length
        }
        adminOp.done = Math.min(i + BATCH, rows.length)
      }
      finishAdminOp()
    } catch (e) {
      adminOp.status = 'error'
      adminOp.error = e.message
    }
  })

  // Батч: добавить упражнения на произношение ко всем урокам без них
  fastify.post('/api/admin/add-speech-all', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (adminOp.status === 'running') return reply.status(409).send({ error: 'Операция уже выполняется' })

    // Уроки без упражнений на произношение
    const { rows: lessons } = await db.query(
      `SELECT id FROM lessons
       WHERE status = 'done'
         AND NOT EXISTS (
           SELECT 1 FROM exercises e WHERE e.lesson_id = lessons.id AND e.type = 'speech'
         )
       ORDER BY id`
    )
    if (!lessons.length) return { added: 0, total: 0 }

    Object.assign(adminOp, { name: 'add-speech-all', done: 0, total: lessons.length, status: 'running', updated: 0, failed: 0 })
    reply.code(202).send({ started: true, total: lessons.length })

    try {
      for (const lesson of lessons) {
        try {
          const { rows: wordRows } = await db.query(
            `SELECT DISTINCT ON (e.payload->>'question')
               e.word_id,
               COALESCE(w.word_de, e.payload->>'question') AS word_de,
               COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
             FROM exercises e
             LEFT JOIN words w ON w.id = e.word_id
             WHERE e.lesson_id = $1 AND e.type = 'flashcard'
             ORDER BY e.payload->>'question'`,
            [lesson.id]
          )
          for (const w of wordRows) {
            await db.query(
              'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
              [lesson.id, w.word_id, 'speech', JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })]
            )
          }
          adminOp.updated += wordRows.length
        } catch (e) {
          console.error(`add-speech-all урок ${lesson.id}: ${e.message}`)
          adminOp.failed++
        }
        adminOp.done++
      }
      finishAdminOp()
    } catch (e) {
      adminOp.status = 'error'
      adminOp.error = e.message
    }
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
