import { getVapidPublicKey, saveSubscription, deleteSubscription } from '../services/push.js'

export async function pushRoutes(fastify) {
  // Публичный ключ VAPID — нужен фронту для создания подписки
  fastify.get('/api/push/vapid-key', async () => {
    return { key: getVapidPublicKey() }
  })

  // Сохранить push-подписку
  fastify.post('/api/push/subscribe', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { subscription } = request.body
    if (!subscription?.endpoint) return reply.status(400).send({ error: 'invalid subscription' })
    await saveSubscription(request.user.id, subscription)
    return { ok: true }
  })

  // Удалить push-подписку
  fastify.post('/api/push/unsubscribe', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { endpoint } = request.body
    if (!endpoint) return reply.status(400).send({ error: 'endpoint required' })
    await deleteSubscription(request.user.id, endpoint)
    return { ok: true }
  })
}
