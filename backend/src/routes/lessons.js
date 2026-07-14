import { db } from '../db/index.js'
import { generateLetterFill } from '../services/claude.js'
import { regenerateExercisesFromDb } from '../services/processor.js'

export async function lessonsRoutes(fastify) {
  // Создание урока (опционально с привязкой к курсу)
  fastify.post('/api/lessons', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          title:         { type: 'string' },
          description:   { type: ['string', 'null'] },
          date:          { type: 'string', format: 'date' },
          course_id:     { type: ['integer', 'null'] },
          lesson_number: { type: ['integer', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const { title, description, date, course_id, lesson_number } = request.body
    const ownerId = request.user.id

    // Автономер урока: следующий по порядку в курсе (или в общем пуле без курса)
    let number = lesson_number
    if (number == null) {
      const q = course_id
        ? await db.query('SELECT COALESCE(MAX(lesson_number), 0) + 1 AS n FROM lessons WHERE course_id = $1', [course_id])
        : await db.query('SELECT COALESCE(MAX(lesson_number), 0) + 1 AS n FROM lessons WHERE owner_id = $1 AND course_id IS NULL', [ownerId])
      number = q.rows[0].n
    }

    const targetLang = request.headers['x-target-lang'] || 'de'
    const { rows } = await db.query(
      'INSERT INTO lessons (owner_id, title, description, date, course_id, lesson_number, target_lang) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [ownerId, title || null, description || null, date || new Date().toISOString().slice(0, 10), course_id || null, number, targetLang]
    )
    return reply.status(201).send(rows[0])
  })

  // Список уроков: все owner видят общий пул; student видит готовые
  fastify.get('/api/lessons', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { role } = request.user
    const target = request.headers['x-target-lang'] || 'de'
    // Мульти-таргет: показываем только уроки активного изучаемого языка
    const filter = role === 'owner' ? 'WHERE l.target_lang = $1' : "WHERE l.status = 'done' AND l.target_lang = $1"

    const { rows } = await db.query(
      `SELECT l.*,
          COUNT(DISTINCT lm.id)::int AS media_count,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL)::int AS words_total,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL AND w.image_url IS NOT NULL)::int AS words_with_images,
          COUNT(DISTINCT e.id)::int AS exercises_total
       FROM lessons l
       LEFT JOIN lesson_media lm ON lm.lesson_id = l.id
       LEFT JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN words w ON w.id = e.word_id
       ${filter}
       GROUP BY l.id
       ORDER BY l.date DESC`,
      [target]
    )
    return rows
  })

  // Добавить letter_fill к уроку без сброса прогресса
  fastify.post('/api/lessons/:id/add-letter-fill', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1', [lessonId]
    )
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    // Берём слова урока (из существующих упражнений, дедупликация по word_de)
    const { rows: existing } = await db.query(
      `SELECT DISTINCT ON (e.payload->>'question')
         e.word_id,
         COALESCE(w.word_de, e.payload->>'question') AS word_de,
         COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
       FROM exercises e
       LEFT JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.type = 'flashcard'
       ORDER BY e.payload->>'question'`,
      [lessonId]
    )

    if (!existing.length) return reply.status(400).send({ error: 'Нет слов в уроке' })

    // Проверяем нет ли уже letter_fill у этого урока
    const { rows: already } = await db.query(
      `SELECT COUNT(*) cnt FROM exercises WHERE lesson_id = $1 AND type = 'letter_fill'`, [lessonId]
    )
    if (parseInt(already[0].cnt) > 0) {
      return reply.status(409).send({ error: 'Упражнения letter_fill уже есть в этом уроке' })
    }

    const words = existing.map(r => ({ word_de: r.word_de, translation_ru: r.translation_ru }))
    const exercises = await generateLetterFill(words)

    const wordMap = Object.fromEntries(existing.map(r => [r.word_de, r.word_id]))
    let added = 0
    for (const ex of exercises) {
      if (ex.type !== 'letter_fill') continue
      const wordId = wordMap[ex.word_de] ?? null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
      added++
    }

    return { added }
  })

  // Добавить диктант к уроку
  fastify.post('/api/lessons/:id/add-dictation', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows: lessonRows } = await db.query('SELECT id FROM lessons WHERE id = $1', [lessonId])
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: already } = await db.query(
      `SELECT COUNT(*) cnt FROM exercises WHERE lesson_id = $1 AND type = 'dictation'`, [lessonId]
    )
    if (parseInt(already[0].cnt) > 0) return reply.status(409).send({ error: 'Диктант уже добавлен' })

    const { rows: wordRows } = await db.query(
      `SELECT DISTINCT ON (e.payload->>'question')
         e.word_id,
         COALESCE(w.word_de, e.payload->>'question') AS word_de,
         COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
       FROM exercises e
       LEFT JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.type = 'flashcard'
       ORDER BY e.payload->>'question'`,
      [lessonId]
    )
    if (!wordRows.length) return reply.status(400).send({ error: 'Нет слов в уроке' })

    let added = 0
    for (const w of wordRows) {
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, w.word_id, 'dictation', JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })]
      )
      added++
    }
    return { added }
  })

  // Добавить упражнения на произношение (speech) к уроку без сброса прогресса
  fastify.post('/api/lessons/:id/add-speech', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows: lessonRows } = await db.query('SELECT id FROM lessons WHERE id = $1', [lessonId])
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: already } = await db.query(
      `SELECT COUNT(*) cnt FROM exercises WHERE lesson_id = $1 AND type = 'speech'`, [lessonId]
    )
    if (parseInt(already[0].cnt) > 0) return reply.status(409).send({ error: 'Упражнения на произношение уже добавлены' })

    const { rows: wordRows } = await db.query(
      `SELECT DISTINCT ON (e.payload->>'question')
         e.word_id,
         COALESCE(w.word_de, e.payload->>'question') AS word_de,
         COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
       FROM exercises e
       LEFT JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.type = 'flashcard'
       ORDER BY e.payload->>'question'`,
      [lessonId]
    )
    if (!wordRows.length) return reply.status(400).send({ error: 'Нет слов в уроке' })

    let added = 0
    for (const w of wordRows) {
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, w.word_id, 'speech', JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })]
      )
      added++
    }
    return { added }
  })

  // Слова урока — через упражнения (не через words.lesson_id, т.к. там дедупликация)
  fastify.get('/api/lessons/:id/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query(
      `SELECT DISTINCT ON (w.id) w.id, w.word_de, w.translation_ru,
              COALESCE(w.translations, '{}') AS translations, w.example_sentence,
              COALESCE(w.image_url, e.image_url) AS image_url
       FROM exercises e
       JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.word_id IS NOT NULL
       ORDER BY w.id`,
      [lessonId]
    )
    return rows
  })

  // Получить один урок
  fastify.get('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params
    // owner видит любой урок; student — только если урок принадлежит его owner
    const ownerFilter = request.user.role === 'owner' ? '' : 'AND l.owner_id = $2'
    const params = request.user.role === 'owner' ? [id] : [id, request.user.id]
    const { rows } = await db.query(
      `SELECT l.*,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL)::int AS words_total,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL AND w.image_url IS NOT NULL)::int AS words_with_images
       FROM lessons l
       LEFT JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN words w ON w.id = e.word_id
       WHERE l.id = $1 ${ownerFilter}
       GROUP BY l.id`,
      params
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: media } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1', [id]
    )
    return { ...rows[0], media }
  })

  // Редактировать урок (title, description, text_content) — любой owner
  fastify.patch('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          title:              { type: 'string' },
          description:        { type: 'string' },
          text_content:       { type: 'string' },
          text_content_extra: { type: 'string' },
          title_translations: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    const { title, description, text_content, text_content_extra, title_translations } = request.body

    const { rows } = await db.query(
      `UPDATE lessons SET
         title              = COALESCE($1, title),
         description        = COALESCE($2, description),
         text_content       = COALESCE($3, text_content),
         text_content_extra = COALESCE($4, text_content_extra),
         title_translations = CASE WHEN $5::jsonb IS NOT NULL
                                THEN COALESCE(title_translations, '{}'::jsonb) || $5::jsonb
                                ELSE title_translations END
       WHERE id = $6
       RETURNING *`,
      [title ?? null, description ?? null, text_content ?? null, text_content_extra ?? null,
       title_translations ? JSON.stringify(title_translations) : null,
       lessonId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return rows[0]
  })

  // Удалить урок (только owner, каскадно удаляет слова/упражнения через FK)
  fastify.delete('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { rows } = await db.query(
      'DELETE FROM lessons WHERE id = $1 AND owner_id = $2 RETURNING id',
      [parseInt(request.params.id), request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return reply.status(204).send()
  })

  // Загрузка медиафайлов к уроку
  fastify.post('/api/lessons/:id/media', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = request.params.id
    // Источник: учебник (по умолчанию) или тетрадь/доска (?source=extra)
    const source = request.query?.source === 'extra' ? 'extra' : 'textbook'

    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1', [lessonId]
    )
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const parts = request.parts()
    const savedFiles = []

    for await (const part of parts) {
      if (part.type !== 'file') continue

      const mimeType = part.mimetype || ''
      const mediaType = mimeType.startsWith('audio') ? 'audio' : 'photo'

      const { filename } = await fastify.saveUploadedFile(part)

      const { rows } = await db.query(
        'INSERT INTO lesson_media (lesson_id, type, file_path, source) VALUES ($1, $2, $3, $4) RETURNING id',
        [lessonId, mediaType, filename, source]
      )
      savedFiles.push({ mediaId: rows[0].id, filename, type: mediaType })
    }

    return reply.status(201).send(savedFiles)
  })

  // Пересоздать упражнения из существующих слов (без сканирования фото)
  fastify.post('/api/lessons/:id/regenerate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows } = await db.query(
      'SELECT id, title FROM lessons WHERE id = $1', [lessonId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    // Отвечаем немедленно — генерация идёт в фоне
    reply.code(202).send({ started: true, lessonId })

    try {
      await regenerateExercisesFromDb(lessonId)
    } catch (e) {
      console.error(`regenerate lesson ${lessonId}: ${e.message}`)
    }
  })

  // Пересоздать упражнения для ВСЕХ уроков со словами
  fastify.post('/api/admin/regenerate-all', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    // Уроки у которых есть слова но нет упражнений (или status pending)
    const { rows } = await db.query(`
      SELECT l.id, l.title, COUNT(DISTINCT w.id) AS words_count, COUNT(DISTINCT e.id) AS ex_count
      FROM lessons l
      LEFT JOIN words w ON w.lesson_id = l.id
      LEFT JOIN exercises e ON e.lesson_id = l.id
      GROUP BY l.id, l.title
      HAVING COUNT(DISTINCT w.id) > 0 AND COUNT(DISTINCT e.id) = 0
      ORDER BY l.id
    `)
    if (!rows.length) return { message: 'Все уроки уже имеют упражнения', count: 0 }

    reply.code(202).send({ started: true, lessons: rows.map(r => ({ id: r.id, title: r.title, words: r.words_count })) })

    for (const lesson of rows) {
      try {
        console.log(`regenerate-all: урок ${lesson.id} (${lesson.words_count} слов)`)
        await regenerateExercisesFromDb(lesson.id)
        console.log(`regenerate-all: урок ${lesson.id} готов`)
      } catch (e) {
        console.error(`regenerate-all: урок ${lesson.id} ошибка: ${e.message}`)
      }
    }
  })
}
