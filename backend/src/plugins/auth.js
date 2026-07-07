import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'

async function authPlugin(fastify) {
  fastify.register(jwt, { secret: config.jwtSecret })

  // Декоратор для защищённых маршрутов
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}

export default fp(authPlugin)
