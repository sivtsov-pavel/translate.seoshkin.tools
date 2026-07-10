import nodemailer from 'nodemailer'

// Транспорт создаётся один раз при загрузке модуля
function createTransport() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

const transport = createTransport()
const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@translate.seoshkin.tools'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sivtsov.pavel@gmail.com'

export async function sendNewMessageEmail({ senderName, chatType, body, conversationId }) {
  if (!transport) {
    console.log('[email] SMTP не настроен — пропускаем отправку письма')
    return
  }
  const typeLabel = chatType === 'teacher' ? 'учителю' : 'в поддержку'
  try {
    await transport.sendMail({
      from: `"Deutsch.lernen" <${FROM}>`,
      to: ADMIN_EMAIL,
      subject: `💬 Новое сообщение ${typeLabel} от ${senderName}`,
      text: `${senderName} написал ${typeLabel}:\n\n${body}\n\nhttps://translate.seoshkin.tools (чат #${conversationId})`,
      html: `
        <div style="font-family:sans-serif;max-width:520px">
          <h2 style="color:#C9A54A">💬 Новое сообщение</h2>
          <p><b>${senderName}</b> написал ${typeLabel}:</p>
          <blockquote style="border-left:3px solid #C9A54A;padding:8px 16px;background:#f9f5e8;margin:0">
            ${body.replace(/\n/g, '<br>')}
          </blockquote>
          <p style="margin-top:20px">
            <a href="https://translate.seoshkin.tools" style="background:#C9A54A;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
              Ответить в приложении →
            </a>
          </p>
        </div>
      `,
    })
    console.log(`[email] Отправлено уведомление на ${ADMIN_EMAIL}`)
  } catch (e) {
    console.error('[email] Ошибка отправки:', e.message)
  }
}
