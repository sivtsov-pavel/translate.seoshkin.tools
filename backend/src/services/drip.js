import cron from 'node-cron'
import { db } from '../db/index.js'
import { sendToUser } from './push.js'
import { localParts, hmToMinutes, sanitizeNotifyPrefs } from './timeutil.js'

// «Пройден» = каждое СЛОВО урока отработано хотя бы в одном упражнении (любого типа),
// а не все 7 упражнений каждого слова. Единое определение для дрипа, дашборда, вех и гейта курса.
// Требует в запросе алиасы: exercises AS e и LEFT JOIN user_exercise_progress uep (по нужному user_id).
export const LESSON_PASSED_HAVING = `count(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL) > 0
  AND count(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL AND uep.exercise_id IS NOT NULL)
    = count(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL)`

// ISO-день недели (1=Пн … 7=Вс) для даты (UTC)
function isoWeekday(date) {
  const d = date.getUTCDay() // 0=Вс … 6=Сб
  return d === 0 ? 7 : d
}

// Сколько уроков открыто к дате `today` при старте `startDate` и учебных днях `weekdays`.
// Урок открывается по одному в каждый учебный день, начиная со start_date включительно.
export function unlockedCount(startDate, weekdays, today = new Date()) {
  const start = new Date(startDate)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(today)
  end.setUTCHours(0, 0, 0, 0)
  if (end < start) return 0
  const set = new Set(weekdays)
  let count = 0
  const d = new Date(start)
  // Кап на 5 лет — защита от бесконечного цикла
  for (let i = 0; i < 1830 && d <= end; i++) {
    if (set.has(isoWeekday(d))) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

// Дата открытия урока с 0-базовым индексом `index` (т.е. (index+1)-й учебный день).
export function unlockDateForIndex(startDate, weekdays, index) {
  const start = new Date(startDate)
  start.setUTCHours(0, 0, 0, 0)
  const set = new Set(weekdays)
  let count = 0
  const d = new Date(start)
  for (let i = 0; i < 1830; i++) {
    if (set.has(isoWeekday(d))) {
      count++
      if (count === index + 1) return new Date(d)
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return null
}

// Какие уроки ученик РЕАЛЬНО может проходить сейчас (строгий дрип, для всех курсов сразу).
// Возвращает { playable:Set<lessonId>, needsSchedule:[course_id...] }.
// Правила: внекурсовые уроки/наборы (course_id NULL) — всегда доступны. Курсовые:
//  • нет расписания по курсу → все закрыты, курс в needsSchedule (заставляем выбрать календарь);
//  • есть расписание → открыт урок, если наступил учебный день И предыдущий пройден (цепочка).
export async function playableLessonIds(userId, schoolId) {
  const { rows } = await db.query(
    `SELECT l.id, l.course_id, l.is_set
     FROM lessons l
     WHERE l.status = 'done' AND ($2::int IS NULL OR l.school_id = $2)
     ORDER BY l.course_id NULLS FIRST, l.lesson_number NULLS LAST, l.created_at`,
    [userId, schoolId ?? null])
  const playable = new Set()
  const needsSchedule = []
  const byCourse = new Map()
  for (const l of rows) {
    // Наборы (is_set) и внекурсовые/личные — всегда открыты, вне дрип-очереди
    if (!l.course_id || l.is_set) { playable.add(l.id); continue }
    if (!byCourse.has(l.course_id)) byCourse.set(l.course_id, [])
    byCourse.get(l.course_id).push(l)
  }
  if (byCourse.size === 0) return { playable, needsSchedule }

  const { rows: scRows } = await db.query(
    'SELECT course_id, weekdays, start_date FROM course_schedules WHERE user_id = $1', [userId])
  const scMap = new Map(scRows.map(s => [s.course_id, s]))

  const courseLessonIds = rows.filter(l => l.course_id && !l.is_set).map(l => l.id)
  // «Пройден» = каждое слово урока отработано хотя бы в одном упражнении (см. LESSON_PASSED_HAVING).
  const { rows: passedRows } = await db.query(
    `SELECT e.lesson_id
     FROM exercises e
     LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
     WHERE e.lesson_id = ANY($2)
     GROUP BY e.lesson_id
     HAVING ${LESSON_PASSED_HAVING}`,
    [userId, courseLessonIds])
  const passedSet = new Set(passedRows.map(r => r.lesson_id))

  for (const [cid, lessons] of byCourse) {
    const sc = scMap.get(cid)
    if (!sc) { needsSchedule.push(cid); continue }
    const opened = unlockedCount(sc.start_date, sc.weekdays)
    let doneIdx = 0, prevPassed = true
    for (const l of lessons) {
      const calendarOpen = doneIdx < opened
      const gateOpen = doneIdx === 0 || prevPassed
      if (calendarOpen && gateOpen) playable.add(l.id)
      prevPassed = passedSet.has(l.id)
      doneIdx++
    }
  }
  return { playable, needsSchedule }
}

// Тик каждые 15 мин: если у юзера открылся новый урок — push по его локальному утру (один раз на урок).
export async function runDripPush() {
  const now = new Date()
  const { rows: schedules } = await db.query(
    `SELECT cs.id, cs.user_id, cs.course_id, cs.weekdays, cs.start_date, cs.last_push_index,
            c.title AS course_title,
            u.timezone, u.notify_prefs,
            (SELECT count(*) FROM lessons l WHERE l.course_id = cs.course_id AND l.status = 'done')::int AS total_done
     FROM course_schedules cs
     JOIN courses c ON c.id = cs.course_id
     JOIN users u ON u.id = cs.user_id`)

  for (const s of schedules) {
    const prefs = sanitizeNotifyPrefs(s.notify_prefs)
    if (!prefs.morning.on) continue                                 // утренние выключены
    const local = localParts(s.timezone, now)
    if (local.minutes < hmToMinutes(prefs.morning.time)) continue   // ещё не наступило локальное утро юзера
    // «Открыто» считаем по ЛОКАЛЬНОЙ дате юзера (иначе у полуночников урок «откроется» не в тот день)
    const localToday = new Date(local.date + 'T00:00:00Z')
    const opened = unlockedCount(s.start_date, s.weekdays, localToday)
    // Открыто не больше, чем есть готовых уроков
    const effective = Math.min(opened, s.total_done)
    if (effective > s.last_push_index && effective > 0) {
      // Открылся новый урок (или несколько) — шлём одно уведомление про свежайший
      try {
        await sendToUser(s.user_id, {
          title: '📚 Новый урок доступен!',
          body: `Курс «${s.course_title}»: открылся урок ${effective}. Пора заниматься!`,
          icon: '/icons/icon-192.png',
          url: `/courses/${s.course_id}`,
        })
      } catch { /* push не критичен */ }
      await db.query('UPDATE course_schedules SET last_push_index = $1 WHERE id = $2', [effective, s.id])
    }
  }
}

export function startDripCron() {
  // Тик каждые 15 мин (UTC); пуш — по локальному утреннему времени каждого юзера
  cron.schedule('*/15 * * * *', () => { runDripPush().catch(e => console.error('drip push:', e.message)) }, { timezone: 'UTC' })
  console.log('Drip cron запущен (тик 15 мин, по локальному утру юзера)')
}
