import nodemailer from 'nodemailer'
import { db } from '../db/index.js'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'sivtsov.pavel@gmail.com'

// Получаем SMTP-конфиг: сначала из БД (настройки owner), иначе env
async function getSmtpConfig() {
  try {
    const { rows } = await db.query(
      `SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from
       FROM user_settings
       WHERE smtp_host IS NOT NULL AND smtp_user IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`
    )
    if (rows.length && rows[0].smtp_host) return rows[0]
  } catch {}

  // Fallback на env vars
  const host = process.env.SMTP_HOST
  if (!host) return null
  return {
    smtp_host:   host,
    smtp_port:   parseInt(process.env.SMTP_PORT || '587'),
    smtp_secure: process.env.SMTP_SECURE === 'true',
    smtp_user:   process.env.SMTP_USER,
    smtp_pass:   process.env.SMTP_PASS,
    smtp_from:   process.env.SMTP_FROM || process.env.SMTP_USER,
  }
}

export async function sendEmail({ to, subject, html, text }) {
  const cfg = await getSmtpConfig()
  if (!cfg) return
  const transport = nodemailer.createTransport({
    host: cfg.smtp_host, port: cfg.smtp_port || 587,
    secure: cfg.smtp_secure || false,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
  })
  try {
    await transport.sendMail({ from: `"Deutsch.lernen" <${cfg.smtp_from || cfg.smtp_user}>`, to, subject, html, text })
  } catch (e) {
    console.error('[email] Ошибка отправки:', e.message)
  }
}

export async function sendNewMessageEmail({ senderName, chatType, body, conversationId }) {
  const cfg = await getSmtpConfig()
  if (!cfg) {
    console.log('[email] SMTP не настроен — настрой в Настройки → Интеграции или через env vars')
    return
  }

  const transport = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: cfg.smtp_port || 587,
    secure: cfg.smtp_secure || false,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
  })

  const typeLabel = chatType === 'teacher' ? 'учителю' : 'в поддержку'
  const from = cfg.smtp_from || cfg.smtp_user

  try {
    await transport.sendMail({
      from: `"Deutsch.lernen" <${from}>`,
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
            <a href="https://translate.seoshkin.tools/chat"
               style="background:#C9A54A;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">
              Ответить в приложении →
            </a>
          </p>
        </div>
      `,
    })
    console.log(`[email] Отправлено на ${ADMIN_EMAIL}`)
  } catch (e) {
    console.error('[email] Ошибка отправки:', e.message)
  }
}
