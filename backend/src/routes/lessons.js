import { db } from '../db/index.js'
import { generateLetterFill } from '../services/claude.js'

export async function lessonsRoutes(fastify) {
  // Создание урока (опционально с привязкой к курсу)
  fastify.post('/api/lessons', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          title:         { type: 'string' },
          date:          { type: 'string', format: 'date' },
          course_id:     { type: ['integer', 'null'] },
          lesson_number: { type: ['integer', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const { title, date, course_id, lesson_number } = request.body
    const ownerId = request.user.id

    const { rows } = await db.query(
      'INSERT INTO lessons (owner_id, title, date, course_id, lesson_number) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [ownerId, title || null, date || new Date().toISOString().slice(0, 10), course_id || null, lesson_number || null]
    )
    return reply.status(201).send(rows[0])
  })

  // Список уроков: все owner видят общий пул; student видит готовые
  fastify.get('/api/lessons', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { role } = request.user
    const filter = role === 'owner' ? '' : "WHERE l.status = 'done'"

    const { rows } = await db.query(
      `SELECT l.*, COUNT(lm.id)::int AS media_count
       FROM lessons l
       LEFT JOIN lesson_media lm ON lm.lesson_id = l.id
       ${filter}
       GROUP BY l.id
       ORDER BY l.date DESC`
    )
    return rows
  })

  // Добавить letter_fill к уроку без сброса прогресса
  fastify.post('/api/lessons/:id/add-letter-fill', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    // Проверяем что урок наш
    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1 AND owner_id = $2', [lessonId, request.user.id]
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

  // Слова урока — через упражнения (не через words.lesson_id, т.к. там дедупликация)
  fastify.get('/api/lessons/:id/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query(
      `SELECT DISTINCT ON (w.id) w.id, w.word_de, w.translation_ru, w.example_sentence
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
    const { rows } = await db.query(
      'SELECT * FROM lessons WHERE id = $1 AND owner_id = $2',
      [id, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    // Добавляем медиафайлы урока
    const { rows: media } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1',
      [id]
    )
    return { ...rows[0], media }
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

    // Проверяем принадлежность урока
    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1 AND owner_id = $2',
      [lessonId, request.user.id]
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
        'INSERT INTO lesson_media (lesson_id, type, file_path) VALUES ($1, $2, $3) RETURNING id',
        [lessonId, mediaType, filename]
      )
      savedFiles.push({ mediaId: rows[0].id, filename, type: mediaType })
    }

    return reply.status(201).send(savedFiles)
  })
}
