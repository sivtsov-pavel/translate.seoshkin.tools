import OpenAI from 'openai'
import { db } from '../db/index.js'
import { encryptSecret, decryptSecret, maskSecret } from '../services/secretBox.js'

export async function settingsRoutes(fastify) {
  fastify.get('/api/settings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const { rows } = await db.query(
      `SELECT daily_limit, openai_key, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from, visual
       FROM user_settings WHERE user_id = $1`,
      [userId]
    )
    const s = rows[0] ?? { daily_limit: 50 }
    // Сам ключ OpenAI на клиент НЕ отдаём (секрет). Только факт наличия + маску для UI.
    let openai_key_set = false, openai_key_mask = null
    if (s.openai_key) {
      try { const k = decryptSecret(s.openai_key); openai_key_set = !!k; openai_key_mask = maskSecret(k) }
      catch { openai_key_set = true } // ключ есть, но расшифровать нельзя (сменён секрет)
    }
    delete s.openai_key
    return { ...s, openai_key_set, openai_key_mask }
  })

  // Визуальные настройки (шрифт/размер/раскладка) — отдельно, чтобы не трогать остальные поля
  fastify.patch('/api/settings/visual', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const visual = request.body?.visual ?? {}
    await db.query(
      `INSERT INTO user_settings (user_id, visual) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET visual = EXCLUDED.visual, updated_at = NOW()`,
      [userId, JSON.stringify(visual)]
    )
    return { ok: true }
  })

  // Общие настройки. ⚠️ Ключ OpenAI здесь НЕ трогаем — им управляют отдельные эндпоинты
  // ниже (шифрование + маскирование), чтобы не отдавать/не затирать секрет через общий PATCH.
  fastify.patch('/api/settings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId } = request.user
    const {
      daily_limit = 50,
      smtp_host = null, smtp_port = 587, smtp_secure = false,
      smtp_user = null, smtp_pass = null, smtp_from = null,
    } = request.body ?? {}
    const limit = Math.max(5, Math.min(500, parseInt(daily_limit) || 50))

    await db.query(
      `INSERT INTO user_settings (user_id, daily_limit, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         daily_limit  = EXCLUDED.daily_limit,
         smtp_host    = EXCLUDED.smtp_host,
         smtp_port    = EXCLUDED.smtp_port,
         smtp_secure  = EXCLUDED.smtp_secure,
         smtp_user    = EXCLUDED.smtp_user,
         smtp_pass    = EXCLUDED.smtp_pass,
         smtp_from    = EXCLUDED.smtp_from,
         updated_at   = NOW()`,
      [userId, limit,
       smtp_host || null, parseInt(smtp_port) || 587, smtp_secure || false,
       smtp_user || null, smtp_pass || null, smtp_from || null]
    )
    return { daily_limit: limit }
  })

  // Сохранить/очистить свой ключ OpenAI. Шифруется at-rest (AES-256-GCM). Пустое значение — очистка.
  // Ключ не логируем и не возвращаем — только факт наличия + маску.
  fastify.put('/api/settings/openai-key', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id: userId } = request.user
    const raw = (request.body?.key ?? '').toString().trim()
    if (raw && !raw.startsWith('sk-')) {
      return reply.status(400).send({ error: 'Ключ OpenAI должен начинаться с «sk-»' })
    }
    const enc = raw ? encryptSecret(raw) : null // null = очистить ключ
    await db.query(
      `INSERT INTO user_settings (user_id, openai_key) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET openai_key = EXCLUDED.openai_key, updated_at = NOW()`,
      [userId, enc]
    )
    return { ok: true, openai_key_set: !!raw, openai_key_mask: raw ? maskSecret(raw) : null }
  })

  // Проверить ключ OpenAI: лёгкий запрос к API. Тестируем переданный ключ (перед сохранением)
  // либо уже сохранённый. Ключ в ответ/лог не попадает.
  fastify.post('/api/settings/openai-key/test', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id: userId } = request.user
    let key = (request.body?.key ?? '').toString().trim()
    // Ключ не передан — берём сохранённый из профиля
    if (!key) {
      const { rows } = await db.query('SELECT openai_key FROM user_settings WHERE user_id = $1', [userId])
      if (rows[0]?.openai_key) {
        try { key = decryptSecret(rows[0].openai_key) || '' } catch { key = '' }
      }
    }
    if (!key) return reply.status(400).send({ ok: false, error: 'Ключ не задан' })
    try {
      const client = new OpenAI({ apiKey: key })
      await client.models.list() // лёгкий валидирующий запрос
      return { ok: true }
    } catch (e) {
      // Наружу — короткое человеческое сообщение, без утечки деталей ключа
      const msg = e?.status === 401 ? 'Ключ недействителен (401)' : (e?.message || 'Ошибка проверки ключа')
      return { ok: false, error: String(msg).slice(0, 160) }
    }
  })
}
