import { db } from '../db/client.js'

export async function settingsRoutes(fastify) {
  fastify.get('/api/settings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const { rows } = await db.query(
      `SELECT daily_limit, openai_key FROM user_settings WHERE user_id = $1`,
      [userId]
    )
    return rows[0] ?? { daily_limit: 50, openai_key: null }
  })

  fastify.patch('/api/settings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const { daily_limit = 50, openai_key = null } = request.body ?? {}
    const limit = Math.max(5, Math.min(500, parseInt(daily_limit) || 50))

    await db.query(
      `INSERT INTO user_settings (user_id, daily_limit, openai_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         daily_limit = EXCLUDED.daily_limit,
         openai_key  = EXCLUDED.openai_key,
         updated_at  = NOW()`,
      [userId, limit, openai_key || null]
    )
    return { daily_limit: limit, openai_key: openai_key || null }
  })
}
