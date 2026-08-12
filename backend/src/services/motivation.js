import cron from 'node-cron'
import { db } from '../db/index.js'
import { sendToUser } from './push.js'
import { localParts, hmToMinutes, sanitizeNotifyPrefs } from './timeutil.js'
import { LESSON_PASSED_HAVING } from './drip.js'
import { shouldNudge, pickNudge, firstName } from './nudges.js'

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

// 🔥 Серия + 🌙 вечернее: если сегодня не занимался — мягко напоминаем по локальному вечеру.
// Тик 15 мин: шлём, когда у юзера наступило его вечернее время (notify_prefs.evening).
export async function runEveningReminders() {
  const now = new Date()
  const { rows: users } = await db.query(
    `SELECT DISTINCT u.id, u.motivation, u.timezone, u.notify_prefs
     FROM users u JOIN push_subscriptions p ON p.user_id = u.id
     WHERE u.role = 'student'`)
  for (const u of users) {
    const prefs = sanitizeNotifyPrefs(u.notify_prefs)
    if (!prefs.evening.on) continue                                // вечерние выключены
    const local = localParts(u.timezone, now)
    if (local.minutes < hmToMinutes(prefs.evening.time)) continue  // ещё не наступил локальный вечер
    if (u.motivation?.lastEveningPush === local.date) continue     // уже слали сегодня
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
    await db.query(`UPDATE users SET motivation = motivation || jsonb_build_object('lastEveningPush', $2::text) WHERE id = $1`, [u.id, local.date])
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
  const now = new Date()
  const { rows: users } = await db.query(
    `SELECT u.id, u.motivation, u.timezone, u.notify_prefs,
       (SELECT count(*) FROM user_word_status s WHERE s.user_id = u.id AND s.status = 'known')::int AS known,
       -- ПРОЙДЕННЫЕ уроки: каждое слово урока отработано хотя бы в одном упражнении
       -- (единое определение LESSON_PASSED_HAVING — как дрип/дашборд/гейт курса)
       (SELECT count(*) FROM (
          SELECT l.id
          FROM lessons l JOIN exercises e ON e.lesson_id = l.id
          LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = u.id
          GROUP BY l.id
          HAVING ${LESSON_PASSED_HAVING}
        ) done_lessons)::int AS lessons
     FROM users u JOIN push_subscriptions p ON p.user_id = u.id
     WHERE u.role = 'student'`)
  for (const u of users) {
    const prefs = sanitizeNotifyPrefs(u.notify_prefs)
    if (!prefs.milestones.on) continue                              // поздравления с вехами выключены
    const local = localParts(u.timezone, now)
    // Вехи шлём в утреннем слоте, один раз в день (порог всё равно дедупится ниже)
    if (local.minutes < hmToMinutes(prefs.morning.time)) continue
    if (u.motivation?.lastMilestoneCheck === local.date) continue
    await db.query(`UPDATE users SET motivation = motivation || jsonb_build_object('lastMilestoneCheck', $2::text) WHERE id = $1`, [u.id, local.date])
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


// 📣 «Пульс»: пока ученик сегодня не занимался — раз в два часа мотивационное
// сообщение по имени. Позанимался — до вечера тишина, а вечером одно предложение
// закрепить пройденное со случайным уже пройденным уроком.
//
// Рамки (окно 9–21 локального времени, интервал 2 часа, максимум 4 в день) живут
// в nudges.js и покрыты тестами: без них это восемь пушей в день и отключённые
// уведомления. Тик общий, 15 минут.
export async function runNudges() {
  const now = new Date()
  const { rows: users } = await db.query(
    `SELECT DISTINCT u.id, u.full_name, u.motivation, u.timezone, u.notify_prefs
     FROM users u JOIN push_subscriptions p ON p.user_id = u.id
     WHERE u.role = 'student'`)

  for (const u of users) {
    const prefs = sanitizeNotifyPrefs(u.notify_prefs)
    if (!prefs.nudges?.on) continue

    const local = localParts(u.timezone, now)
    const m = u.motivation || {}
    const sameDay = m.nudgeDate === local.date
    const countToday = sameDay ? (m.nudgeCount || 0) : 0
    const lastNudgeMinutes = sameDay ? (m.nudgeMinutes ?? null) : null

    // Занимался ли сегодня — по попыткам, а не по «зашёл в приложение»
    const { rows: att } = await db.query(
      `SELECT count(*)::int AS n FROM exercise_attempts
       WHERE user_id = $1 AND attempted_at >= now() - interval '20 hours'
         AND (attempted_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date`, [u.id])
    const studiedToday = (att[0]?.n || 0) > 0

    if (!shouldNudge({ localMinutes: local.minutes, lastNudgeMinutes, countToday, studiedToday })) continue

    // Всё ли пройдено: если да — зовём закреплять и ведём на случайный пройденный урок
    const { rows: passed } = await db.query(
      `SELECT e.lesson_id FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
       WHERE l.status = 'done'
       GROUP BY e.lesson_id HAVING ${LESSON_PASSED_HAVING}`, [u.id])

    const { rows: pending } = await db.query(
      `SELECT count(*)::int AS n FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
       WHERE l.status = 'done' AND uep.exercise_id IS NULL`, [u.id])

    const allDone = (pending[0]?.n || 0) === 0 && passed.length > 0
    const name = firstName(u.full_name)
    const { title, body } = pickNudge(name, countToday, allDone)

    // Прошёл всё — предлагаем повторить случайный из пройденных, иначе ведём на главную
    let url = '/'
    if (allDone && passed.length) {
      const pick = passed[Math.floor(Math.random() * passed.length)]
      url = `/lesson/${pick.lesson_id}`
    }

    try { await sendToUser(u.id, { title, body, icon: '/icons/icon-192.png', url }) } catch {}

    await db.query(
      `UPDATE users SET motivation = motivation || jsonb_build_object(
         'nudgeDate', $2::text, 'nudgeCount', $3::int, 'nudgeMinutes', $4::int) WHERE id = $1`,
      [u.id, local.date, countToday + 1, local.minutes])
  }
}

export function startMotivationCron() {
  // Тик каждые 15 мин (UTC); внутри — по локальному времени юзера:
  // вечернее/серия — в его вечернее время, вехи — в утреннем слоте (раз в день).
  cron.schedule('*/15 * * * *', () => runEveningReminders().catch(e => console.error('evening reminder:', e.message)), { timezone: 'UTC' })
  cron.schedule('*/15 * * * *', () => runMilestones().catch(e => console.error('milestones:', e.message)), { timezone: 'UTC' })
  cron.schedule('*/15 * * * *', () => runNudges().catch(e => console.error('nudges:', e.message)), { timezone: 'UTC' })
  console.log('Motivation cron запущен (тик 15 мин, по локальному времени юзера)')
}
