import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'
import { db } from '../db/index.js'

// Обновляем last_seen_at не чаще раза в 10 минут
const seenCache = new Map()
const SEEN_TTL = 10 * 60 * 1000

async function authPlugin(fastify) {
  fastify.register(jwt, { secret: config.jwtSecret })

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
      const userId = request.user.id
      const now = Date.now()
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
