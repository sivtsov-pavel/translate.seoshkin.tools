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
}
