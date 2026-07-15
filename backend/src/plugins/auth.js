import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'
import { db } from '../db/index.js'

// Обновляем last_seen_at не чаще раза в 10 минут
const seenCache = new Map()
const SEEN_TTL = 10 * 60 * 1000
// Контекст школы меняется редко — кешируем на 5 минут
const schoolCache = new Map()
const SCHOOL_TTL = 5 * 60 * 1000

async function authPlugin(fastify) {
  fastify.register(jwt, { secret: config.jwtSecret })

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
      const userId = request.user.id
      const now = Date.now()

      // Контекст мультиарендности: школа + роли (для scoping и прав)
      const cached = schoolCache.get(userId)
      if (cached && now - cached.at < SCHOOL_TTL) {
        request.user.school_id = cached.school_id
        request.user.is_school_admin = cached.is_school_admin
      } else {
        const { rows } = await db.query('SELECT school_id, is_school_admin FROM users WHERE id=$1', [userId])
        const school_id = rows[0]?.school_id ?? null
        const is_school_admin = rows[0]?.is_school_admin ?? false
        request.user.school_id = school_id
        request.user.is_school_admin = is_school_admin
        schoolCache.set(userId, { school_id, is_school_admin, at: now })
      }
      request.user.is_superadmin = userId === 1  // владелец платформы видит всё

      if (!seenCache.has(userId) || now - seenCache.get(userId) > SEEN_TTL) {
        seenCache.set(userId, now)
        db.query('UPDATE users SET last_seen_at=$1 WHERE id=$2', [new Date(), userId]).catch(() => {})
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}

export default fp(authPlugin)
