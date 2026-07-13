import Stripe from 'stripe'
import { db } from '../db/index.js'
import { config } from '../config.js'

// Подписки Stripe (v2). Инертно без ключей: checkout вернёт 503, webhook — 503.
// Премиум ставится вебхуком по событиям подписки (customer.subscription.*).

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null

const PRICE = (plan) => plan === 'yearly' ? config.stripePriceYearly : config.stripePriceMonthly

// Проставить тариф по статусу подписки Stripe
async function applySubscription(customerId, status, currentPeriodEnd) {
  const premium = status === 'active' || status === 'trialing'
  await db.query(
    `UPDATE users SET plan = $1, subscription_status = $2,
            plan_until = $3
     WHERE stripe_customer_id = $4`,
    [premium ? 'premium' : 'free', status,
     currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null, customerId]
  )
}

export async function billingRoutes(fastify) {
  // Создать сессию оплаты и вернуть ссылку на Stripe Checkout
  fastify.post('/api/billing/checkout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!stripe) return reply.status(503).send({ error: 'Оплата ещё не настроена' })
    const plan = request.body?.plan === 'yearly' ? 'yearly' : 'monthly'
    const price = PRICE(plan)
    if (!price) return reply.status(503).send({ error: 'Тариф не настроен' })

    // Гарантируем клиента Stripe
    const { rows } = await db.query('SELECT email, stripe_customer_id FROM users WHERE id = $1', [request.user.id])
    let customer = rows[0]?.stripe_customer_id
    if (!customer) {
      const c = await stripe.customers.create({ email: rows[0]?.email, metadata: { userId: String(request.user.id) } })
      customer = c.id
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer, request.user.id])
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      success_url: `${config.publicUrl}/settings?upgraded=1`,
      cancel_url: `${config.publicUrl}/upgrade`,
      allow_promotion_codes: true,
    })
    return { url: session.url }
  })

  // Статус подписки текущего пользователя
  fastify.get('/api/billing/status', { preHandler: [fastify.authenticate] }, async (request) => {
    const { rows } = await db.query(
      'SELECT plan, subscription_status, plan_until FROM users WHERE id = $1', [request.user.id])
    return { configured: !!stripe, ...rows[0] }
  })

  // Портал управления подпиской (отмена/смена карты)
  fastify.post('/api/billing/portal', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!stripe) return reply.status(503).send({ error: 'Оплата ещё не настроена' })
    const { rows } = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [request.user.id])
    if (!rows[0]?.stripe_customer_id) return reply.status(400).send({ error: 'Нет подписки' })
    const portal = await stripe.billingPortal.sessions.create({
      customer: rows[0].stripe_customer_id,
      return_url: `${config.publicUrl}/settings`,
    })
    return { url: portal.url }
  })

  // Вебхук Stripe — в отдельном scope с raw-body (нужен для проверки подписи).
  // Парсер application/json как buffer инкапсулирован здесь и не влияет на другие роуты.
  fastify.register(async (webhook) => {
    webhook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => done(null, body))
    webhook.post('/api/billing/webhook', async (request, reply) => {
      if (!stripe || !config.stripeWebhookSecret) return reply.status(503).send({ error: 'not configured' })
      let event
      try {
        event = stripe.webhooks.constructEvent(request.body, request.headers['stripe-signature'], config.stripeWebhookSecret)
      } catch (err) {
        request.log.warn({ err: err.message }, 'Stripe webhook signature failed')
        return reply.status(400).send({ error: `Webhook Error: ${err.message}` })
      }

      try {
        const obj = event.data.object
        switch (event.type) {
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
            await applySubscription(obj.customer, obj.status, obj.current_period_end)
            break
          case 'customer.subscription.deleted':
            await applySubscription(obj.customer, 'canceled', obj.current_period_end)
            break
          case 'checkout.session.completed':
            if (obj.subscription) {
              const sub = await stripe.subscriptions.retrieve(obj.subscription)
              await applySubscription(obj.customer, sub.status, sub.current_period_end)
            }
            break
        }
      } catch (err) {
        request.log.error({ err: err.message, type: event.type }, 'Stripe webhook handling failed')
      }
      return { received: true }
    })
  })
}
