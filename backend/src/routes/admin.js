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

  // Школы: список с лимитами и текущим использованием (супер-админ выставляет тарифы)
  fastify.get('/api/admin/schools', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const { rows } = await db.query(`
      SELECT s.id, s.name, s.plan, COALESCE(s.limits,'{}') AS limits,
             COALESCE(u.email, '') AS owner_email,
             (SELECT count(*) FROM users us WHERE us.school_id=s.id AND us.role='student')::int AS students,
             (SELECT count(*) FROM lessons l WHERE l.school_id=s.id)::int AS lessons,
             (SELECT count(*) FROM words w JOIN lessons l ON l.id=w.lesson_id
              WHERE l.school_id=s.id AND w.image_url IS NOT NULL
                AND w.created_at >= date_trunc('month', now()))::int AS images_this_month
      FROM schools s LEFT JOIN users u ON u.id=s.owner_id
      ORDER BY s.id`)
    return rows
  })

  // Обновить школу: имя / тариф / лимиты (картинки, OCR, ученики)
  fastify.patch('/api/admin/schools/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const { name, plan, limits } = request.body || {}
    const { rows } = await db.query(
      `UPDATE schools SET
         name   = COALESCE($2, name),
         plan   = COALESCE($3, plan),
         limits = COALESCE($4::jsonb, limits)
       WHERE id=$1 RETURNING id, name, plan, limits`,
      [request.params.id, name ?? null, plan ?? null, limits ? JSON.stringify(limits) : null])
    if (!rows[0]) return reply.status(404).send({ error: 'Школа не найдена' })
    return rows[0]
  })

  // Публичный конфиг для клиента (любой залогиненный): что показывать —
  // реклама по девайсам и статус лимитов. Без гейта супер-админа, но отдаём
  // только безопасные поля (без ключей/тарифов).
  fastify.get('/api/platform/public-config', { preHandler: [fastify.authenticate] }, async (request) => {
    const [{ rows: prows }, { rows: urows }] = await Promise.all([
      db.query('SELECT config FROM platform_settings WHERE id=1'),
      db.query('SELECT plan FROM users WHERE id=$1', [request.user.id]),
    ])
    const cfg = prows[0]?.config ?? {}
    const plan = urows[0]?.plan ?? 'free'
    const isPremium = plan === 'premium'
    const ads = cfg.ads ?? {}
    const mon = cfg.monetization ?? {}
    return {
      plan,
      ads: {
        showForMe: !!ads.enabled && !isPremium,
        mobile: !!ads.mobile, tablet: !!ads.tablet, desktop: !!ads.desktop,
        client: ads.adsense_client || '', slot: ads.adsense_slot || '',
      },
      limits: {
        enforced: !!mon.paid_enabled && !isPremium,
        dailyLimit: mon.free_daily_limit ?? 0,
      },
      // Тарифы для страницы подписки (можно показывать всем)
      paidEnabled: !!mon.paid_enabled,
      pricing: cfg.pricing ?? {},
    }
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
