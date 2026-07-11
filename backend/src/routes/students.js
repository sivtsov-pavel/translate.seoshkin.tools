import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'

export async function studentsRoutes(fastify) {
  // Список учеников со статистикой — только для owner
  fastify.get('/api/students', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') {
      return reply.status(403).send({ error: 'Только для учителя' })
    }

    const { rows } = await db.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.avatar,
        u.phone,
        u.telegram,
        u.whatsapp,
        u.profession,
        u.created_at,
        COUNT(DISTINCT w.id)::int                                              AS words_total,
        COUNT(DISTINCT CASE WHEN w.status = 'known'    THEN w.id END)::int    AS words_known,
        COUNT(DISTINCT CASE WHEN w.status = 'learning' THEN w.id END)::int    AS words_learning,
        COUNT(DISTINCT ea.id)::int                                             AS attempts_total,
        COUNT(DISTINCT CASE WHEN ea.attempted_at::date = CURRENT_DATE THEN ea.id END)::int AS attempts_today
      FROM users u
      LEFT JOIN words w           ON w.user_id  = u.id
      LEFT JOIN exercise_attempts ea ON ea.user_id = u.id
      WHERE u.role = 'student'
      GROUP BY u.id, u.email, u.created_at
      ORDER BY u.email
    `)

    return rows
  })

  // Получить одного студента (учитель)
  fastify.get('/api/students/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { rows } = await db.query(
      'SELECT id, email, role, avatar, phone, telegram, whatsapp, profession, full_name, created_at FROM users WHERE id = $1 AND role = $2',
      [request.params.id, 'student']
    )
    if (!rows.length) return reply.status(404).send({ error: 'Студент не найден' })
    return rows[0]
  })

  // Обновить профиль студента (учитель)
  fastify.patch('/api/students/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          full_name:  { type: 'string', maxLength: 100 },
          avatar:     { type: 'string', maxLength: 10 },
          phone:      { type: 'string', maxLength: 30 },
          telegram:   { type: 'string', maxLength: 60 },
          whatsapp:   { type: 'string', maxLength: 30 },
          profession: { type: 'string', maxLength: 100 },
          password:   { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { password, ...fields } = request.body
    const allowed = ['full_name', 'avatar', 'phone', 'telegram', 'whatsapp', 'profession']
    const keys = Object.keys(fields).filter(k => allowed.includes(k))

    if (keys.length > 0) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
      await db.query(
        `UPDATE users SET ${sets} WHERE id = $1 AND role = 'student'`,
        [request.params.id, ...keys.map(k => fields[k])]
      )
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10)
      await db.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2 AND role = 'student'",
        [hash, request.params.id]
      )
    }

    const { rows } = await db.query(
      'SELECT id, email, role, avatar, phone, telegram, whatsapp, profession, full_name FROM users WHERE id = $1',
      [request.params.id]
    )
    return rows[0] ?? {}
  })
}
