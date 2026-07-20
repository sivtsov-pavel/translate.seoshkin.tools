// Фабрика OpenAI-клиента с учётом «своего ключа» учителя (мультиарендность оплаты).
// Дорогой путь генерации урока (vision-импорт, картинки, упражнения, переводы контента)
// идёт на ключе ВЛАДЕЛЬЦА урока — он платит за свою генерацию сам. Нет ключа → платформенный.
// Дешёвые студенческие вызовы (тренер, тап-перевод, ридер) остаются на платформенном ключе.
import OpenAI from 'openai'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { decryptSecret } from './secretBox.js'

// Платформенный клиент (общий ключ из .env) — дефолт и fallback.
export const platformClient = new OpenAI({ apiKey: config.openaiApiKey })

// Кэш клиентов по владельцу: { ownerId -> { key, client } }. Пересоздаём только при смене ключа.
const clientCache = new Map()

// Возвращает расшифрованный ключ владельца или null (нет строки / нет ключа / битый шифр).
async function getOwnerKey(ownerId) {
  if (!ownerId) return null
  const { rows } = await db.query('SELECT openai_key FROM user_settings WHERE user_id = $1', [ownerId])
  const stored = rows[0]?.openai_key
  if (!stored) return null
  try {
    const key = decryptSecret(stored)
    return key && key.trim() ? key.trim() : null
  } catch {
    // Битый шифр / сменённый секрет — не роняем генерацию, откатываемся на платформенный ключ.
    return null
  }
}

// Возвращает OpenAI-клиент для генерации от имени владельца урока.
// Есть валидный свой ключ → его клиент; иначе платформенный.
export async function getOwnerClient(ownerId) {
  const key = await getOwnerKey(ownerId)
  if (!key) return platformClient
  const cached = clientCache.get(ownerId)
  if (cached && cached.key === key) return cached.client
  const client = new OpenAI({ apiKey: key })
  clientCache.set(ownerId, { key, client })
  return client
}

// true, если у владельца задан собственный ключ (для гейтов/подсказок в UI).
export async function ownerHasOwnKey(ownerId) {
  return (await getOwnerKey(ownerId)) != null
}
