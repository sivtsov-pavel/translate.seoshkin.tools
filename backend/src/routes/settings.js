import { db } from '../db/index.js'

export async function settingsRoutes(fastify) {
  fastify.get('/api/settings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const { rows } = await db.query(
      `SELECT daily_limit, openai_key, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from
       FROM user_settings WHERE user_id = $1`,
      [userId]
    )
    return rows[0] ?? { daily_limit: 50, openai_key: null }
  })

  fastify.patch('/api/settings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const {
      daily_limit = 50, openai_key = null,
      smtp_host = null, smtp_port = 587, smtp_secure = false,
      smtp_user = null, smtp_pass = null, smtp_from = null,
    } = request.body ?? {}
    const limit = Math.max(5, Math.min(500, parseInt(daily_limit) || 50))

    await db.query(
      `INSERT INTO user_settings (user_id, daily_limit, openai_key, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         daily_limit  = EXCLUDED.daily_limit,
         openai_key   = EXCLUDED.openai_key,
         smtp_host    = EXCLUDED.smtp_host,
         smtp_port    = EXCLUDED.smtp_port,
         smtp_secure  = EXCLUDED.smtp_secure,
         smtp_user    = EXCLUDED.smtp_user,
         smtp_pass    = EXCLUDED.smtp_pass,
         smtp_from    = EXCLUDED.smtp_from,
         updated_at   = NOW()`,
      [userId, limit, openai_key || null,
       smtp_host || null, parseInt(smtp_port) || 587, smtp_secure || false,
       smtp_user || null, smtp_pass || null, smtp_from || null]
    )
    return { daily_limit: limit, openai_key: openai_key || null }
  })
}
