import cron from 'node-cron'
import { db } from '../db/index.js'
import { sendToUser } from './push.js'

// Русская форма слова по числу: 1 день / 2 дня / 5 дней
function plural(n, one, few, many) {
  const m = n % 10, h = n % 100
  if (m === 1 && h !== 11) return one
  if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return few
  return many
}

// Серия подряд (по датам активности), заканчивая сегодня или вчера
function streakFromDates(dates) {
  const set = new Set(dates)
  const iso = d => d.toISOString().slice(0, 10)
  const today = new Date()
  const todayHas = set.has(iso(today))
  const cur = new Date(today)
  if (!set.has(iso(cur))) {
    cur.setUTCDate(cur.getUTCDate() - 1)
    if (!set.has(iso(cur))) return { streak: 0, today: todayHas }
  }
  let streak = 0
  while (set.has(iso(cur))) { streak++; cur.setUTCDate(cur.getUTCDate() - 1) }
  return { streak, today: todayHas }
}

// 🔥 Серия + 🌙 вечернее: если сегодня не занимался — мягко напоминаем вечером
export async function runEveningReminders() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const { rows: users } = await db.query(
    `SELECT DISTINCT u.id, u.motivation
     FROM users u JOIN push_subscriptions p ON p.user_id = u.id
     WHERE u.role = 'student'`)
  for (const u of users) {
    if (u.motivation?.lastEveningPush === todayStr) continue // уже слали сегодня
    const { rows: dr } = await db.query(
      `SELECT DISTINCT attempted_at::date AS d FROM exercise_attempts
       WHERE user_id = $1 AND attempted_at > now() - interval '40 days'`, [u.id])
    const { streak, today } = streakFromDates(dr.map(r => r.d))
    if (today) continue // уже занимался сегодня — не пинаем
    let body
    if (streak >= 2) body = `🔥 У тебя серия ${streak} ${plural(streak, 'день', 'дня', 'дней')}! Позанимайся сегодня, чтобы её не потерять.`
    else if (dr.length) body = '🌙 Не забудь позаниматься сегодня — пара минут, и слова закрепятся!'
    else continue // совсем нет активности — вечерним не грузим
    try { await sendToUser(u.id, { title: '📚 Время учиться', body, icon: '/icons/icon-192.png', url: '/' }) } catch {}
    await db.query(`UPDATE users SET motivation = motivation || jsonb_build_object('lastEveningPush', $2::text) WHERE id = $1`, [u.id, todayStr])
  }
}

// 🏆 Вехи: поздравляем при переходе через порог (один раз на порог)
const WORD_MILES = [10, 25, 50, 100, 200, 300, 500, 1000]
const LESSON_MILES = [3, 5, 10, 20, 30, 50, 100]
function reached(miles, val, last) {
  let hit = null
  for (const m of miles) if (val >= m && m > (last || 0)) hit = m
  return hit
}

export async function runMilestones() {
  const { rows: users } = await db.query(
    `SELECT u.id, u.motivation,
       (SELECT count(*) FROM user_word_status s WHERE s.user_id = u.id AND s.status = 'known')::int AS known,
       (SELECT count(DISTINCT e.lesson_id) FROM exercise_attempts a JOIN exercises e ON e.id = a.exercise_id WHERE a.user_id = u.id)::int AS lessons
     FROM users u JOIN push_subscriptions p ON p.user_id = u.id
     WHERE u.role = 'student'`)
  for (const u of users) {
    const wHit = reached(WORD_MILES, u.known, u.motivation?.lastWordsMilestone)
    if (wHit) {
      try { await sendToUser(u.id, { title: '🏆 Отличная работа!', body: `Ты выучил ${wHit} ${plural(wHit, 'слово', 'слова', 'слов')}! Так держать 💪`, icon: '/icons/icon-192.png', url: '/vocabulary' }) } catch {}
      await db.query(`UPDATE users SET motivation = motivation || jsonb_build_object('lastWordsMilestone', $2::int) WHERE id = $1`, [u.id, wHit])
    }
    const lHit = reached(LESSON_MILES, u.lessons, u.motivation?.lastLessonsMilestone)
    if (lHit) {
      try { await sendToUser(u.id, { title: '🏆 Молодец!', body: `Ты прошёл ${lHit} ${plural(lHit, 'урок', 'урока', 'уроков')}! Продолжай в том же духе 🚀`, icon: '/icons/icon-192.png', url: '/' }) } catch {}
      await db.query(`UPDATE users SET motivation = motivation || jsonb_build_object('lastLessonsMilestone', $2::int) WHERE id = $1`, [u.id, lHit])
    }
  }
}

export function startMotivationCron() {
  // Вечернее напоминание/серия — 18:00 UTC (~20:00 в Германии)
  cron.schedule('0 18 * * *', () => runEveningReminders().catch(e => console.error('evening reminder:', e.message)), { timezone: 'UTC' })
  // Вехи — 10:00 UTC (после утренних упражнений)
  cron.schedule('0 10 * * *', () => runMilestones().catch(e => console.error('milestones:', e.message)), { timezone: 'UTC' })
  console.log('Motivation cron запущен (серия+вечернее 18:00, вехи 10:00 UTC)')
}
