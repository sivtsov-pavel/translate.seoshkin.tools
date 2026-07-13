import { db } from '../db/index.js'

// Супер-админ — только пользователь id=1 (Administrator).
// Здесь глобальные настройки платформы (реклама/монетизация/тарифы) и сводная статистика,
// недоступные обычным учителям. Admin-ОПЕРАЦИИ (картинки, переводы) живут в lessons.js.

const SUPER_ADMIN_ID = 1

function isSuperAdmin(request, reply) {
  if (request.user?.id !== SUPER_ADMIN_ID) {
    reply.status(403).send({ error: 'Только для супер-админа' })
    return false
  }
  return true
}

export async function adminRoutes(fastify) {
  // Сводка по платформе: пользователи, контент, активность
  fastify.get('/api/admin/overview', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return

    const [{ rows: users }, { rows: content }, { rows: activity }] = await Promise.all([
      db.query(`SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE role='owner')::int   AS owners,
          count(*) FILTER (WHERE role='student')::int AS students
        FROM users`),
      db.query(`SELECT
          (SELECT count(*) FROM lessons)::int   AS lessons,
          (SELECT count(*) FROM words)::int     AS words,
          (SELECT count(*) FROM exercises)::int AS exercises,
          (SELECT count(*) FROM courses)::int   AS courses,
          (SELECT count(*) FROM tutors)::int    AS tutors`),
      db.query(`SELECT
          (SELECT count(DISTINCT user_id) FROM exercise_attempts
             WHERE attempted_at > now() - interval '7 days')::int  AS active_7d,
          (SELECT count(DISTINCT user_id) FROM exercise_attempts
             WHERE attempted_at > now() - interval '30 days')::int AS active_30d,
          (SELECT count(*) FROM exercise_attempts
             WHERE attempted_at > now() - interval '24 hours')::int AS attempts_24h`),
    ])

    return { users: users[0], content: content[0], activity: activity[0] }
  })

  // Прочитать глобальные настройки
  fastify.get('/api/admin/platform-settings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const { rows } = await db.query('SELECT config FROM platform_settings WHERE id=1')
    return rows[0]?.config ?? {}
  })

  // Сохранить глобальные настройки (полная замена конфига)
  fastify.put('/api/admin/platform-settings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const config = request.body?.config
    if (!config || typeof config !== 'object') return reply.status(400).send({ error: 'Некорректный конфиг' })
    await db.query(
      `INSERT INTO platform_settings (id, config, updated_at) VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = now()`,
      [JSON.stringify(config)]
    )
    return { ok: true, config }
  })

  // Список всех пользователей с активностью и объёмом контента
  fastify.get('/api/admin/users', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const { rows } = await db.query(`
      SELECT u.id, u.email, u.role, u.full_name,
             (SELECT count(*) FROM lessons l WHERE l.owner_id = u.id)::int AS lessons,
             (SELECT count(*) FROM words w   WHERE w.user_id  = u.id)::int AS words,
             (SELECT max(attempted_at) FROM exercise_attempts a WHERE a.user_id = u.id) AS last_active
      FROM users u
      ORDER BY u.id`)
    return rows
  })
}
