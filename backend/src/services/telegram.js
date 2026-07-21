// Отправка уведомлений в Telegram через Bot API (без сторонних библиотек)
import { config } from '../config.js'

const BOTS = [
  { token: process.env.TELEGRAM_SUPPORT_BOT_TOKEN, chatId: process.env.TELEGRAM_SUPPORT_CHAT_ID },
  { token: process.env.TELEGRAM_TEACHER_BOT_TOKEN, chatId: process.env.TELEGRAM_TEACHER_CHAT_ID },
]

export async function sendTelegramNotification({ senderName, chatType, body }) {
  const typeLabel = chatType === 'teacher' ? 'учителю' : 'в поддержку'
  const text = `💬 *Новое сообщение* ${typeLabel}\n\nОт: *${senderName}*\n\n${body}\n\n${config.publicUrl}`

  for (const bot of BOTS) {
    if (!bot.token || !bot.chatId) continue
    try {
      const res = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: bot.chatId, text, parse_mode: 'Markdown' }),
      })
      const data = await res.json()
      if (!data.ok) console.error('[telegram] Ошибка:', data.description)
      else console.log('[telegram] Уведомление отправлено в чат', bot.chatId)
    } catch (e) {
      console.error('[telegram] fetch error:', e.message)
    }
  }
}
