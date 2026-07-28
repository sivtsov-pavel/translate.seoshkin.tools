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

  // Журнал операций: что система делала, чем считала и во сколько обошлось.
  // Утренняя проверка ночного прогона — сюда. Фильтры: ?status=error&kind=image&days=1
  fastify.get('/api/admin/operations', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const { status, kind, provider, lesson_id: lessonId } = request.query
    const days = Math.min(parseInt(request.query.days || '7') || 7, 90)
    const limit = Math.min(parseInt(request.query.limit || '200') || 200, 1000)

    // Поля обязательно с префиксом o.: в ленте есть JOIN с lessons, где тоже есть
    // created_at/status/id — без префикса Postgres ругается на неоднозначность.
    const where = [`o.created_at > now() - ($1 || ' days')::interval`]
    const params = [String(days)]
    const add = (sql, val) => { params.push(val); where.push(sql.replace('$?', `$${params.length}`)) }
    if (status)   add('o.status = $?', status)
    if (kind)     add('o.kind = $?', kind)
    if (provider) add('o.provider = $?', provider)
    if (lessonId) add('o.lesson_id = $?::int', lessonId)
    const whereSql = where.join(' AND ')

    const [{ rows }, { rows: totals }, { rows: byKind }] = await Promise.all([
      db.query(
        `SELECT o.*, l.title AS lesson_title
         FROM operation_log o LEFT JOIN lessons l ON l.id = o.lesson_id
         WHERE ${whereSql} ORDER BY o.created_at DESC LIMIT ${limit}`, params),
      // Сводка за период: сколько операций, сколько ошибок и СКОЛЬКО ДЕНЕГ ушло
      db.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE o.status='error')::int AS errors,
                COALESCE(sum(o.cost_usd), 0)::float AS cost_usd,
                count(*) FILTER (WHERE o.provider='local')::int  AS local_calls,
                count(*) FILTER (WHERE o.provider='openai')::int AS openai_calls
         FROM operation_log o WHERE ${whereSql}`, params),
      db.query(
        `SELECT o.kind, o.provider, count(*)::int AS n,
                count(*) FILTER (WHERE o.status='error')::int AS errors,
                COALESCE(sum(o.cost_usd), 0)::float AS cost_usd,
                COALESCE(round(avg(o.duration_ms))::int, 0) AS avg_ms
         FROM operation_log o WHERE ${whereSql}
         GROUP BY o.kind, o.provider ORDER BY n DESC`, params),
    ])
    return { rows, totals: totals[0], byKind, days }
  })

  // «Трудные места»: где ученики массово ошибаются. Высокая доля ошибок у ОДНОГО
  // упражнения почти всегда означает не слабость учеников, а брак в самом упражнении —
  // неверный артикль, кривой вариант ответа, требование ввести слово через «/».
  // Поэтому вместе с процентом отдаём РЕАЛЬНЫЕ ответы учеников: по ним сразу видно,
  // что именно люди пишут и чем это отличается от «правильного» варианта.
  fastify.get('/api/admin/hard-spots', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const days = Math.min(parseInt(request.query.days || '30') || 30, 365)
    const minTries = Math.max(parseInt(request.query.min || '3') || 3, 2)
    const target = request.query.lang || null

    const [{ rows: byType }, { rows: spots }] = await Promise.all([
      db.query(
        `SELECT e.type, count(*)::int AS tries,
                count(*) FILTER (WHERE a.quality < 3)::int AS fails,
                round(100.0 * count(*) FILTER (WHERE a.quality < 3) / count(*))::int AS fail_pct
         FROM exercise_attempts a
         JOIN exercises e ON e.id = a.exercise_id
         JOIN lessons l ON l.id = e.lesson_id
         WHERE a.attempted_at > now() - ($1 || ' days')::interval
           AND ($2::text IS NULL OR l.target_lang = $2)
         GROUP BY e.type ORDER BY fail_pct DESC`, [String(days), target]),
      db.query(
        `SELECT e.id, e.type, e.lesson_id, l.title AS lesson_title,
                COALESCE(w.word_de, e.payload->>'word_de', e.payload->>'question') AS word,
                w.translation_ru,
                count(*)::int AS tries,
                count(*) FILTER (WHERE a.quality < 3)::int AS fails,
                round(100.0 * count(*) FILTER (WHERE a.quality < 3) / count(*))::int AS fail_pct,
                -- что ученики реально вводили в неудачных попытках
                (array_agg(DISTINCT a.user_answer) FILTER (WHERE a.quality < 3 AND a.user_answer <> ''))[1:5] AS wrong_answers,
                count(DISTINCT a.user_id)::int AS students
         FROM exercise_attempts a
         JOIN exercises e ON e.id = a.exercise_id
         JOIN lessons l ON l.id = e.lesson_id
         LEFT JOIN words w ON w.id = e.word_id
         WHERE a.attempted_at > now() - ($1 || ' days')::interval
           AND ($3::text IS NULL OR l.target_lang = $3)
         GROUP BY e.id, e.type, e.lesson_id, l.title, w.word_de, e.payload, w.translation_ru
         HAVING count(*) >= $2 AND count(*) FILTER (WHERE a.quality < 3) * 2 >= count(*)
         ORDER BY fail_pct DESC, tries DESC LIMIT 60`, [String(days), minTries, target]),
    ])
    return { days, minTries, byType, spots }
  })

  // Обслуживание: запуск проверок и догенерации прямо из админки, чтобы не лезть в терминал.
  // Всё, что можно сделать на сервере — здесь. Картинки рисуются на ноутбуке Павла и
  // запускаются командой (сервер физически не видит ноутбук).
  fastify.post('/api/admin/maintenance/:action', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const { action } = request.params
    const { auditLessonAndLog, enrichLesson } = await import('../services/processor.js')

    // Проверка материала: гоняем аудит по всем готовым урокам, отчёт каждого — в журнал.
    if (action === 'audit') {
      const { rows } = await db.query(`SELECT id FROM lessons WHERE status='done' ORDER BY id`)
      let blockers = 0, uncovered = 0, checked = 0
      for (const l of rows) {
        const r = await auditLessonAndLog(l.id, request.user.id)
        if (!r) continue
        checked++; blockers += r.blockers.length; uncovered += r.uncovered.length
      }
      return { ok: true, checked, blockers, uncovered }
    }

    // Догенерация недостающих упражнений. ТРАТИТ ДЕНЬГИ — фронт предупреждает и требует
    // подтверждения; сюда приходит уже осознанный запрос.
    if (action === 'topup') {
      const { rows } = await db.query(`
        WITH need AS (
          SELECT w.lesson_id, (SELECT count(DISTINCT e.type) FROM exercises e
            WHERE e.word_id = w.id AND e.type IN ('flashcard','fill_blank','multiple_choice','sentence_write','letter_fill')) have
          FROM words w JOIN lessons l ON l.id = w.lesson_id WHERE l.is_set = false)
        SELECT lesson_id, count(*) FILTER (WHERE have < 5)::int AS miss
        FROM need GROUP BY 1 HAVING count(*) FILTER (WHERE have < 5) > 0 ORDER BY 2 DESC`)
      // Запускаем в фоне: уроков бывает десятки, HTTP-запрос столько не живёт.
      ;(async () => {
        for (const r of rows) {
          try { await enrichLesson(r.lesson_id); await auditLessonAndLog(r.lesson_id, request.user.id) }
          catch (e) { console.error('maintenance topup:', r.lesson_id, e.message) }
        }
      })()
      return { ok: true, started: true, lessons: rows.length, words: rows.reduce((s, r) => s + r.miss, 0) }
    }

    return reply.status(400).send({ error: 'Неизвестное действие' })
  })

  // Что сейчас требует внимания — для карточек раздела «Обслуживание»
  fastify.get('/api/admin/maintenance-status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const [{ rows: cov }, { rows: img }, { rows: lastAudit }] = await Promise.all([
      db.query(`WITH need AS (
          SELECT w.id, l.target_lang, (SELECT count(DISTINCT e.type) FROM exercises e
            WHERE e.word_id = w.id AND e.type IN ('flashcard','fill_blank','multiple_choice','sentence_write','letter_fill')) have
          FROM words w JOIN lessons l ON l.id = w.lesson_id WHERE l.is_set = false)
        SELECT count(*) FILTER (WHERE have < 5)::int AS uncovered, count(*)::int AS total FROM need`),
      db.query(`SELECT count(*) FILTER (WHERE w.image_url IS NULL)::int AS no_image,
                       count(*) FILTER (WHERE w.image_url LIKE '%.jpg%')::int AS photos
                FROM words w JOIN lessons l ON l.id = w.lesson_id`),
      db.query(`SELECT created_at, message, status FROM operation_log
                WHERE kind='audit' ORDER BY id DESC LIMIT 1`),
    ])
    return { coverage: cov[0], images: img[0], lastAudit: lastAudit[0] || null }
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
      // Настройки меню (супер-админ управляет): что скрыть + свои пункты. Читает навигация.
      menu: {
        hidden: Array.isArray(cfg.menu?.hidden) ? cfg.menu.hidden : [],
        custom: Array.isArray(cfg.menu?.custom) ? cfg.menu.custom : [],
      },
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

  // Супер-админ: назначить/снять роль учителя.
  // Раньше учителем можно было стать ТОЛЬКО при регистрации с почтой из жёсткого
  // списка OWNER_EMAILS (auth.js) — новый учитель школы навсегда оставался
  // 'student' и не видел классы, словари и уроки. Теперь роль меняется здесь,
  // без правки кода и деплоя.
  fastify.patch('/api/admin/users/:userId/role', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const userId = parseInt(request.params.userId)
    const role = String(request.body?.role || '').trim()
    if (!['owner', 'student'].includes(role)) {
      return reply.status(400).send({ error: 'role должен быть owner или student' })
    }
    if (userId === SUPER_ADMIN_ID) {
      return reply.status(400).send({ error: 'Роль супер-админа менять нельзя' })
    }
    const { rows } = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, full_name',
      [role, userId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Пользователь не найден' })
    // Роль зашита в JWT — пользователю нужно перелогиниться.
    return { ...rows[0], note: 'Пользователю нужно выйти и войти заново — роль обновится в токене.' }
  })

  // Супер-админ: «Войти как» — получить токен любого пользователя БЕЗ его пароля.
  // Токен помечен impersonatedBy=1, чтобы показать баннер и дать вернуться к себе.
  fastify.post('/api/admin/impersonate/:userId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isSuperAdmin(request, reply)) return
    const userId = parseInt(request.params.userId)
    const { rows } = await db.query('SELECT id, email, role, full_name FROM users WHERE id = $1', [userId])
    if (!rows[0]) return reply.status(404).send({ error: 'Пользователь не найден' })
    const u = rows[0]
    // Подписываем токен целевого пользователя + метка, что это имперсонация супер-админом
    const token = fastify.jwt.sign({ id: u.id, email: u.email, role: u.role, impersonatedBy: request.user.id })
    return { token, user: { id: u.id, email: u.email, role: u.role, full_name: u.full_name } }
  })
}
