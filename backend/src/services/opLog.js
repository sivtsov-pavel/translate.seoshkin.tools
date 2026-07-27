// Журнал операций — что система делала, чем считала и во сколько обошлось.
//
// Правило: журнал НИКОГДА не роняет основную работу. Любая ошибка записи глотается —
// потерять строчку лога не страшно, потерять генерацию урока страшно.
//
// Ключевое поле — provider: 'openai' (потратили деньги), 'local' (бесплатно, ноутбук),
// 'none' (детерминированный код без ИИ). По нему видно, куда уходит баланс.
import { db } from '../db/index.js'
import { config } from '../config.js'

// Провайдер текущего режима — чтобы не дублировать проверку по всему коду.
export const textProvider = () => (config.aiTextProvider === 'local' ? 'local' : 'openai')
export const imageProvider = () => (config.aiImageProvider === 'local' ? 'local' : 'openai')

export async function logOperation({
  userId = null, lessonId = null, kind, provider = 'none', model = null,
  status = 'ok', message = null, items = null, durationMs = null, costUsd = 0, meta = {},
} = {}) {
  try {
    await db.query(
      `INSERT INTO operation_log
         (user_id, lesson_id, kind, provider, model, status, message, items, duration_ms, cost_usd, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [userId, lessonId, kind, provider, model, status,
        message == null ? null : String(message).slice(0, 2000),
        items, durationMs, costUsd, JSON.stringify(meta)])
  } catch (e) {
    // Журнал не должен ронять генерацию — только сообщаем в stdout.
    console.error('opLog:', e.message)
  }
}

// Обёртка «замерь и запиши»: считает время, ловит ошибку, пишет строку и пробрасывает
// исключение дальше. Возвращает то же, что и обёрнутая функция.
export async function tracked(meta, fn) {
  const t0 = Date.now()
  try {
    const result = await fn()
    await logOperation({ ...meta, status: 'ok', durationMs: Date.now() - t0, ...(meta.after ? meta.after(result) : {}) })
    return result
  } catch (e) {
    await logOperation({ ...meta, status: 'error', message: e.message, durationMs: Date.now() - t0 })
    throw e
  }
}
