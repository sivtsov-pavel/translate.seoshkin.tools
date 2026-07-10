import webpush from 'web-push'
import { db } from '../db/index.js'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_EMAIL   = process.env.ADMIN_EMAIL        || 'admin@translate.seoshkin.tools'

let initialized = false

function init() {
  if (initialized || !VAPID_PUBLIC || !VAPID_PRIVATE) return
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC, VAPID_PRIVATE)
  initialized = true
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC
}

export async function saveSubscription(userId, subscription) {
  const { endpoint, keys: { p256dh, auth } } = subscription
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$3, auth=$4`,
    [userId, endpoint, p256dh, auth]
  )
}

export async function deleteSubscription(userId, endpoint) {
  await db.query(
    `DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`,
    [userId, endpoint]
  )
}

export async function sendToUser(userId, payload) {
  init()
  if (!initialized) return

  const { rows } = await db.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1`,
    [userId]
  )
  const failed = []
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 86400 }
      )
    } catch (err) {
      // подписка устарела — удаляем
      if (err.statusCode === 410 || err.statusCode === 404) {
        failed.push(sub.id)
      }
    }
  }
  if (failed.length) {
    await db.query(`DELETE FROM push_subscriptions WHERE id = ANY($1)`, [failed])
  }
}

export async function sendToAll(payload) {
  init()
  if (!initialized) return

  const { rows } = await db.query(`SELECT DISTINCT user_id FROM push_subscriptions`)
  await Promise.all(rows.map(r => sendToUser(r.user_id, payload)))
}
