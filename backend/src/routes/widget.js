// API виджета на домашнем экране (Android).
//
// Два разных способа входа:
//  • настройки в приложении — обычный JWT (включить/выключить виджет, посмотреть устройства);
//  • сам виджет — узкий токен устройства, умеющий ровно одно: читать своё состояние.
// Основной JWT в нативную часть не отдаём: он даёт полный доступ ко всему аккаунту.
import { createHash, randomBytes } from 'crypto'
import { db } from '../db/index.js'
import { buildWidgetState, WIDGET_STATES } from '../services/widgetState.js'
import { widgetCards, CARD_KINDS } from '../services/widgetCards.js'
import { recordAttempt } from '../services/attempts.js'

const TOKEN_TTL_DAYS = 180
// Больше десяти живых виджетов у одного человека не бывает; лимит нужен, чтобы
// переустановки приложения не копили токены без конца.
const MAX_DEVICES = 10
// last_used_at пишем не чаще раза в час: виджет ходит часто, а точность до минуты здесь
// никому не нужна — это подпись «виджет ещё жив», а не аналитика.
const USED_WRITE_TTL = 60 * 60 * 1000
const usedCache = new Map()

const hashToken = token => createHash('sha256').update(token).digest('hex')

export async function widgetRoutes(fastify) {
  // ── Настройки: состояние тумблера и список устройств ──────────────────────
  fastify.get('/api/widget/status', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { rows } = await db.query(
      `SELECT id, device_label, created_at, last_used_at
       FROM widget_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`, [request.user.id])
    return {
      enabled: rows.length > 0,
      devices: rows.map(r => ({
        id: r.id,
        label: r.device_label,
        createdAt: r.created_at,
        lastUsedAt: r.last_used_at,
      })),
    }
  })

  // ── Включить виджет: выдать токен устройству ──────────────────────────────
  fastify.post('/api/widget/token', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const label = String(request.body?.label ?? '').slice(0, 60) || null

    // Самые старые токены сверх лимита гасим — иначе переустановки копятся вечно.
    await db.query(
      `UPDATE widget_tokens SET revoked_at = NOW()
       WHERE id IN (
         SELECT id FROM widget_tokens
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC OFFSET $2)`, [userId, MAX_DEVICES - 1])

    const token = randomBytes(32).toString('base64url')
    const { rows } = await db.query(
      `INSERT INTO widget_tokens (user_id, token_hash, device_label, target_lang, ui_lang, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)
       RETURNING id, expires_at`,
      [userId, hashToken(token), label,
       request.headers['x-target-lang'] || 'de',
       String(request.body?.uiLang || 'ru').slice(0, 8),
       String(TOKEN_TTL_DAYS)])

    // Открытый токен существует только в этом ответе: в базе лежит его хеш.
    return { token, id: rows[0].id, expiresAt: rows[0].expires_at }
  })

  // ── Выключить виджет: отозвать токены ─────────────────────────────────────
  // Без id — гасим все (тумблер выключен). С id — одно устройство.
  fastify.delete('/api/widget/token', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const id = request.query?.id ? parseInt(request.query.id) : null
    const { rowCount } = await db.query(
      `UPDATE widget_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL AND ($2::int IS NULL OR id = $2)`,
      [request.user.id, id])
    return { ok: true, revoked: rowCount }
  })

  // ── Сменился изучаемый язык ───────────────────────────────────────────────
  // Приложение зовёт это при заходе в настройки, если виджет включён. Без этого ученик,
  // перешедший с немецкого на испанский, продолжал бы видеть на домашнем экране немецкий:
  // нативная часть о смене языка узнать не может.
  fastify.patch('/api/widget/lang', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const lang   = String(request.body?.lang   || request.headers['x-target-lang'] || 'de').slice(0, 8)
    const uiLang = String(request.body?.uiLang || 'ru').slice(0, 8)
    const { rowCount } = await db.query(
      `UPDATE widget_tokens SET target_lang = $2, ui_lang = $3
       WHERE user_id = $1 AND revoked_at IS NULL AND (target_lang <> $2 OR ui_lang <> $3)`,
      [request.user.id, lang, uiLang])
    return { ok: true, updated: rowCount }
  })

  // ── Ответы с виджета ──────────────────────────────────────────────────────
  // Принимаем ПАЧКОЙ: виджет копит ответы в очереди и отправляет, когда есть сеть.
  // Иначе ответ, данный в метро, просто пропадал бы — а для человека он «засчитан».
  fastify.post('/api/widget/answer', async (request, reply) => {
    const user = await resolveUser(fastify, request)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    const list = Array.isArray(request.body?.answers) ? request.body.answers : [request.body]
    if (!list.length) return reply.status(400).send({ error: 'answers required' })

    const accepted = []
    for (const a of list.slice(0, 50)) {
      const id = parseInt(a?.id)
      if (!id) continue
      try {
        if (a.kind === CARD_KINDS.PHRASE) {
          // Фраза «на послушать»: закрываем шаг «слушаю». Шаг «собираю предложение»
          // требует ввода и остаётся в приложении.
          await db.query(
            `INSERT INTO user_phrase_progress (user_id, phrase_id, step_listen)
             VALUES ($1, $2, TRUE)
             ON CONFLICT (user_id, phrase_id) DO UPDATE SET step_listen = TRUE`,
            [user.id, id])
        } else {
          // Упражнение: та же цепочка, что в приложении (SM-2, статус слова, попытка,
          // снятие из хвостов) — services/attempts.js. Оценки те же: 5 верно, 1 неверно.
          await recordAttempt(user.id, id, String(a.answer ?? ''), a.correct ? 5 : 1)
        }
        accepted.push(id)
      } catch (e) {
        request.log.warn({ err: e, id }, 'ответ с виджета не записан')
      }
    }

    // Возвращаем свежее состояние: виджет сразу подвинет полосу, не дожидаясь
    // следующего планового опроса.
    const target = user.target_lang || request.headers['x-target-lang'] || 'de'
    const state = await buildWidgetState(user.id, user.school_id ?? null, user.role, target)
    state.cards = state.state === WIDGET_STATES.IN_PROGRESS && state.lesson
      ? await widgetCards(user.id, state.lesson.id, uiLang(request, user))
      : []
    return { accepted, state }
  })

  // ── Состояние для самого виджета ──────────────────────────────────────────
  // Пускаем и по токену устройства, и по обычному JWT: второе нужно, чтобы показать
  // предпросмотр виджета в настройках, не выдавая токен раньше времени.
  fastify.get('/api/widget/state', async (request, reply) => {
    const user = await resolveUser(fastify, request)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    // Виджету язык не откуда взять — используем сохранённый рядом с токеном.
    // Предпросмотр из настроек ходит с обычным JWT, там язык приходит заголовком.
    const target = user.target_lang || request.headers['x-target-lang'] || 'de'
    const state = await buildWidgetState(user.id, user.school_id ?? null, user.role, target)

    // Карточки едут вместе с прогрессом одним ответом: виджет опрашивает сервер редко,
    // и второй круг за вопросами означал бы «нажал, а карточки ещё нет».
    // Язык вариантов — язык интерфейса ученика, а не изучаемый.
    state.cards = state.state === WIDGET_STATES.IN_PROGRESS && state.lesson
      ? await widgetCards(user.id, state.lesson.id, uiLang(request, user))
      : []

    // ETag считаем БЕЗ updatedAt: иначе метка времени меняет ответ каждый раз и 304
    // не случается никогда — виджет качал бы полный ответ каждые полчаса зря.
    const { updatedAt, ...stable } = state
    const etag = `"${createHash('sha1').update(JSON.stringify(stable)).digest('hex')}"`
    reply.header('Cache-Control', 'no-store')
    if (request.headers['if-none-match'] === etag) return reply.status(304).send()
    reply.header('ETag', etag)
    return state
  })
}

// Кто спрашивает: сам виджет (узкий токен устройства) или приложение (обычный JWT —
// нужен для предпросмотра в настройках, где токен ещё не выдан).
async function resolveUser(fastify, request) {
  const auth = request.headers.authorization || ''
  const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!raw) return null

  const byWidget = await userByWidgetToken(raw)
  if (byWidget) return byWidget

  try {
    const payload = fastify.jwt.verify(raw)
    const { rows } = await db.query(
      'SELECT id, role, school_id FROM users WHERE id = $1', [payload.id])
    return rows[0] ?? null
  } catch {
    return null
  }
}

// Язык, на котором человек ЧИТАЕТ (варианты ответа, переводы) — не тот, который он учит.
// У виджета он записан рядом с токеном, приложение шлёт его заголовком.
function uiLang(request, user) {
  return user.ui_lang || request.headers['x-ui-lang'] || 'ru'
}

// Пользователь по токену виджета. Отозванный или просроченный токен — как несуществующий:
// виджет получит 401 и покажет «отключён в настройках», а не чужие числа.
async function userByWidgetToken(token) {
  const { rows } = await db.query(
    `SELECT u.id, u.role, u.school_id, t.id AS token_id, t.target_lang, t.ui_lang
     FROM widget_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > NOW()`,
    [hashToken(token)])
  const row = rows[0]
  if (!row) return null

  const now = Date.now()
  if (!usedCache.has(row.token_id) || now - usedCache.get(row.token_id) > USED_WRITE_TTL) {
    usedCache.set(row.token_id, now)
    db.query('UPDATE widget_tokens SET last_used_at = NOW() WHERE id = $1', [row.token_id])
      .catch(() => {})   // подпись «виджет жив» не стоит того, чтобы ронять ответ
  }
  return row
}
