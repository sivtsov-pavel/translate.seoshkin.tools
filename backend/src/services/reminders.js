import cron from 'node-cron'
import { db } from '../db/index.js'
import { sendToUser } from './push.js'
import { sendEmail } from './email.js'

// Каждый день в 09:00 UTC — проверяем кто не занимался и кому есть что повторить
export function startReminderCron() {
  cron.schedule('0 9 * * *', sendReminders, { timezone: 'UTC' })
  console.log('Reminder cron запущен (каждый день 09:00 UTC)')
}

export async function sendReminders() {
  const { rows } = await db.query(`
    SELECT
      u.id           AS user_id,
      u.email,
      COUNT(e.id)    AS due_count
    FROM users u
    JOIN exercises e ON e.user_id = u.id
    WHERE
      e.due_date <= CURRENT_DATE
      AND e.status  != 'mastered'
      AND (u.last_seen_at IS NULL OR u.last_seen_at < NOW() - INTERVAL '20 hours')
    GROUP BY u.id, u.email
    HAVING COUNT(e.id) > 0
  `)

  for (const row of rows) {
    const count = Number(row.due_count)
    const label = count === 1 ? 'упражнение' : count < 5 ? 'упражнения' : 'упражнений'

    const payload = {
      title: '📚 Deutsch lernen',
      body:  `Тебя ждут ${count} ${label} для повторения сегодня!`,
      icon:  '/icons/icon-192.png',
      url:   '/',
    }

    await sendToUser(row.user_id, payload)

    // Email — если SMTP настроен
    try {
      await sendEmail({
        to: row.email,
        subject: `📚 Deutsch lernen — ${count} ${label} ждут тебя`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="color:#C9A54A">📚 Nicht vergessen!</h2>
            <p>Привет! Сегодня тебя ждут <strong>${count} ${label}</strong> для повторения.</p>
            <p>Даже 10-15 минут в день дают отличный результат. Зайди и позанимайся!</p>
            <a href="https://translate.seoshkin.tools"
               style="display:inline-block;padding:12px 24px;background:#C9A54A;color:#1a1a1a;border-radius:10px;font-weight:700;text-decoration:none;margin-top:12px">
              Открыть приложение →
            </a>
            <p style="margin-top:24px;font-size:12px;color:#666">
              Чтобы отписаться от напоминаний — зайди в Настройки → Уведомления.
            </p>
          </div>
        `,
      })
    } catch {
      // email не настроен — тихо игнорируем
    }
  }

  if (rows.length) {
    console.log(`Напоминания отправлены: ${rows.length} пользователей`)
  }
}
