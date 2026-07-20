import cron from 'node-cron'
import { db } from '../db/index.js'
import { sendToUser } from './push.js'
import { sendEmail } from './email.js'
import { localParts, hmToMinutes, sanitizeNotifyPrefs } from './timeutil.js'

// Тик каждые 15 минут (UTC). Внутри — шлём каждому юзеру по его ЛОКАЛЬНОМУ утреннему
// времени (из notify_prefs.morning), один раз в день. Так «09:00» приходит в 9 утра
// именно у пользователя, а не в 09:00 UTC.
export function startReminderCron() {
  cron.schedule('*/15 * * * *', () => sendReminders().catch(e => console.error('reminders:', e.message)), { timezone: 'UTC' })
  console.log('Reminder cron запущен (тик 15 мин, по локальному утру юзера)')
}

export async function sendReminders() {
  const now = new Date()
  // «На повторение сегодня» = выученные упражнения юзера, у которых подошёл срок SRS
  // (user_exercise_progress.next_review_date <= сегодня). Только тем, кто давно не заходил.
  const { rows } = await db.query(`
    SELECT
      u.id           AS user_id,
      u.email,
      u.timezone,
      u.notify_prefs,
      u.motivation,
      COUNT(uep.exercise_id) AS due_count
    FROM users u
    JOIN user_exercise_progress uep ON uep.user_id = u.id
    WHERE
      uep.next_review_date <= CURRENT_DATE
      AND (u.last_seen_at IS NULL OR u.last_seen_at < NOW() - INTERVAL '20 hours')
    GROUP BY u.id, u.email, u.timezone, u.notify_prefs, u.motivation
    HAVING COUNT(uep.exercise_id) > 0
  `)

  let sent = 0
  for (const row of rows) {
    const prefs = sanitizeNotifyPrefs(row.notify_prefs)
    if (!prefs.morning.on) continue                                  // утренние выключены
    const local = localParts(row.timezone, now)
    if (local.minutes < hmToMinutes(prefs.morning.time)) continue    // ещё не наступило локальное утро
    if (row.motivation?.lastReminderPush === local.date) continue    // уже слали сегодня

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

    // Дедуп: помечаем, что сегодня уже напомнили (в локальной дате юзера)
    await db.query(
      `UPDATE users SET motivation = motivation || jsonb_build_object('lastReminderPush', $2::text) WHERE id = $1`,
      [row.user_id, local.date])
    sent++
  }

  if (sent) {
    console.log(`Напоминания отправлены: ${sent} пользователей`)
  }
}
