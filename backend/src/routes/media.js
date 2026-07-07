import { join } from 'path'
import { existsSync } from 'fs'
import { createReadStream } from 'fs'
import { config } from '../config.js'

export async function mediaRoutes(fastify) {
  fastify.get('/api/media/:filename', async (request, reply) => {
    const { filename } = request.params

    // Защита от path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid filename' })
    }

    const filepath = join(config.uploadDir, filename)
    if (!existsSync(filepath)) {
      return reply.status(404).send({ error: 'Файл не найден' })
    }

    return reply.send(createReadStream(filepath))
  })
}
