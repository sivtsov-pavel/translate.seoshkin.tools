import { db } from '../db/index.js'

export async function coursesRoutes(fastify) {

  // Список курсов владельца со статистикой уроков
  fastify.get('/api/courses', { preHandler: [fastify.authenticate] }, async (request) => {
    const ownerId = request.user.id
    const { rows } = await db.query(`
      SELECT
        c.id, c.title, c.description, c.sort_order, c.created_at,
        COUNT(l.id)::int                                                  AS lessons_total,
        COUNT(CASE WHEN l.status = 'done'       THEN 1 END)::int         AS lessons_done,
        COUNT(CASE WHEN l.status = 'processing' THEN 1 END)::int         AS lessons_processing
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      WHERE c.owner_id = $1
      GROUP BY c.id
      ORDER BY c.sort_order, c.created_at
    `, [ownerId])
    return rows
  })

  // Уроки внутри курса
  fastify.get('/api/courses/:id/lessons', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const courseId = parseInt(request.params.id)
    const { rows: course } = await db.query('SELECT * FROM courses WHERE id = $1', [courseId])
    if (!course[0]) return reply.status(404).send({ error: 'Курс не найден' })

    const { rows } = await db.query(`
      SELECT id, title, date, status, progress, lesson_number, created_at
      FROM lessons
      WHERE course_id = $1
      ORDER BY lesson_number NULLS LAST, created_at
    `, [courseId])

    return { course: course[0], lessons: rows }
  })

  // Создать курс
  fastify.post('/api/courses', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { title, description = '' } = request.body
    if (!title?.trim()) return reply.status(400).send({ error: 'Название обязательно' })

    const { rows: maxOrder } = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS mo FROM courses WHERE owner_id = $1',
      [request.user.id]
    )
    const { rows } = await db.query(
      'INSERT INTO courses (owner_id, title, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [request.user.id, title.trim(), description.trim(), maxOrder[0].mo + 1]
    )
    return reply.status(201).send(rows[0])
  })

  // Переименовать / изменить описание курса
  fastify.patch('/api/courses/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)
    const { title, description } = request.body

    const { rows } = await db.query(
      `UPDATE courses
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description)
       WHERE id = $3 AND owner_id = $4
       RETURNING *`,
      [title?.trim() || null, description?.trim() ?? null, courseId, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Курс не найден' })
    return rows[0]
  })

  // Удалить курс (уроки остаются, course_id → NULL)
  fastify.delete('/api/courses/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    await db.query('DELETE FROM courses WHERE id = $1 AND owner_id = $2', [parseInt(request.params.id), request.user.id])
    return reply.status(204).send()
  })

  // Привязать урок к курсу (или открепить: course_id = null)
  fastify.patch('/api/lessons/:id/course', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { course_id, lesson_number } = request.body
    const { rows } = await db.query(
      'UPDATE lessons SET course_id = $1, lesson_number = $2 WHERE id = $3 RETURNING id, course_id, lesson_number',
      [course_id || null, lesson_number || null, parseInt(request.params.id)]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return rows[0]
  })
}
