import { db } from '../db/index.js'

export async function phraseSetsRoutes(fastify) {
  // Список наборов текущего пользователя
  fastify.get('/api/phrase-sets', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { rows } = await db.query(
      'SELECT id, title, content, created_at FROM phrase_sets WHERE owner_id = $1 ORDER BY created_at DESC',
      [request.user.id]
    )
    return rows
  })

  // Создать набор
  fastify.post('/api/phrase-sets', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title:   { type: 'string', minLength: 1, maxLength: 255 },
          content: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { title, content } = request.body
    const { rows } = await db.query(
      'INSERT INTO phrase_sets (owner_id, title, content) VALUES ($1, $2, $3) RETURNING id, title, content, created_at',
      [request.user.id, title.trim(), content.trim()]
    )
    return reply.status(201).send(rows[0])
  })

  // Удалить набор
  fastify.delete('/api/phrase-sets/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { rows } = await db.query(
      'DELETE FROM phrase_sets WHERE id = $1 AND owner_id = $2 RETURNING id',
      [parseInt(request.params.id), request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Набор не найден' })
    return reply.status(204).send()
  })
}
