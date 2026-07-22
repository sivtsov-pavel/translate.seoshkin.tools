import { getVapidPublicKey, saveSubscription, deleteSubscription, sendToUser, sendToAll } from '../services/push.js'
import { db } from '../db/index.js'

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

  // Тест доставки на СВОИ устройства — мгновенно, минуя все гейты (утро/вечер/активность).
  fastify.post('/api/push/test', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1', [request.user.id])
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    await sendToUser(request.user.id, {
      title: '🔔 Тест уведомления',
      body: `Push работает на этом устройстве! (${time})`,
      icon: '/icons/icon-192.png',
      url: '/',
    })
    return { ok: true, devices: rows[0].n }
  })

  // Отправить пуш от учителя — только owner
  fastify.post('/api/push/send', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'forbidden' })
    const { title, body, userId } = request.body
    if (!body) return reply.status(400).send({ error: 'body required' })

    const payload = {
      title: title || '📚 Deutsch lernen',
      body,
      icon: '/icons/icon-192.png',
      url: '/',
    }

    if (userId) {
      await sendToUser(Number(userId), payload)
      return { ok: true, target: 'user', userId }
    }

    // Отправляем всем ученикам (не owner)
    const { rows } = await db.query(
      `SELECT DISTINCT user_id FROM push_subscriptions
       JOIN users ON users.id = push_subscriptions.user_id
       WHERE users.role != 'owner'`
    )
    let sent = 0
    for (const row of rows) {
      await sendToUser(row.user_id, payload)
      sent++
    }
    return { ok: true, target: 'all', sent }
  })
}
