// Шифрование чувствительных секретов (ключ OpenAI учителя) для хранения в БД.
// AES-256-GCM: конфиденциальность + аутентификация (защита от подмены). Ключ шифрования —
// SHA-256 от секрета из .env (config.settingsEncKey). Формат хранения:
//   "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
// Секрет at-rest не хранится в открытом виде; сам ключ шифрования — только в .env, не в БД.
import crypto from 'crypto'
import { config } from '../config.js'

const PREFIX = 'enc:v1:'

// 32-байтный ключ AES из секрета .env (детерминированно, без хранения соли).
function keyBytes() {
  return crypto.createHash('sha256').update(config.settingsEncKey || '').digest()
}

// Шифрует строку → "enc:v1:...". Пустой вход → null (в БД NULL = «ключ не задан»).
export function encryptSecret(plain) {
  if (plain == null || plain === '') return null
  const iv = crypto.randomBytes(12) // рекомендованный размер IV для GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

// Дешифрует "enc:v1:...". Значение БЕЗ префикса считаем «легаси-открытым» ключом
// (совместимость со старыми записями до внедрения шифрования) и возвращаем как есть.
// При повреждении/неверном секрете бросает — вызывающий сам решает, что делать.
export function decryptSecret(stored) {
  if (stored == null || stored === '') return null
  const s = String(stored)
  if (!s.startsWith(PREFIX)) return s // легаси-открытый ключ
  const [ivB64, tagB64, ctB64] = s.slice(PREFIX.length).split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}

// Маска для UI: показываем начало и последние 4 символа, серединку скрываем.
// Сам ключ на клиент не отдаём — только маску. Пустой вход → null.
export function maskSecret(plain) {
  const s = String(plain || '')
  if (!s) return null
  if (s.length <= 8) return '••••'
  return s.slice(0, 3) + '…' + s.slice(-4)
}
