import { db } from '../db/index.js'

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

  // Список уроков владельца
  fastify.get('/api/lessons', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const { rows } = await db.query(
      `SELECT l.*, COUNT(lm.id)::int AS media_count
       FROM lessons l
       LEFT JOIN lesson_media lm ON lm.lesson_id = l.id
       WHERE l.owner_id = $1
       GROUP BY l.id
       ORDER BY l.date DESC`,
      [userId]
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
