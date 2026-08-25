import cron from 'node-cron'
import { db } from '../db/index.js'
import { sendToUser } from './push.js'
import { localParts, hmToMinutes, sanitizeNotifyPrefs } from './timeutil.js'

// «Пройден» = по КАЖДОМУ слову урока сделаны карточка И «выбери ответ».
//
// Раньше хватало одного касания любым типом, и урок закрывался после одной сессии «выбери
// ответ»: Павел прошёл выбор ответа в пятом уроке — сразу открылся шестой, хотя слова он,
// по собственным словам, ещё не помнит. Одно узнавание ничего не закрепляет.
//
// Два типа — осознанный минимум, а не «побольше строгости»: карточка показывает слово с
// переводом (узнавание в лоб), «выбери ответ» требует отличить его от похожих. Письменные
// типы (диктант, «напиши предложение») в минимум НЕ входят — они тяжелее и догоняются
// повторениями, иначе урок станет непроходимым за один присест.
//
// Считаем ТОЛЬКО слова, у которых карточка или «выбери ответ» вообще есть. Прежняя версия
// дополнительно требовала, чтобы каждое слово урока было отработано хоть чем-нибудь, и через
// это втягивала в минимум как раз исключённые из него типы: в уроке 19 запись
// «ich bin dreißig.» имела только диктант и речь, поэтому урок не закрывался даже после всех
// 52 карточек и 63 «выбери ответ» — урок 20 не открывался (баг Павла от 22.08.2026).
// Такие записи (диктант/речь без карточки) теперь урок не держат: 37 слов в 5 уроках.
//
// Требует в запросе алиасы: exercises AS e и LEFT JOIN user_exercise_progress uep (по нужному user_id).
//
// Список типов — ОДИН на весь проект. Гейт урока (HAVING ниже) и счётчик «сколько осталось»
// для виджета (REQUIRED_PROGRESS_SELECT) собираются из него же: разъехавшиеся определения
// уже стоили нам порванной цепочки уроков (30.07.2026), второй раз наступать не будем.
export const REQUIRED_TYPES = ['flashcard', 'multiple_choice']

const requiredInList = REQUIRED_TYPES.map(t => `'${t}'`).join(', ')

export const LESSON_PASSED_HAVING = `count(DISTINCT e.word_id) FILTER (WHERE e.type IN (${requiredInList})) > 0
  ${REQUIRED_TYPES.map(t => `AND count(DISTINCT e.word_id) FILTER (WHERE e.type = '${t}' AND uep.exercise_id IS NOT NULL)
    = count(DISTINCT e.word_id) FILTER (WHERE e.type = '${t}')`).join('\n  ')}`

// Тот же минимум, но числами: сколько слов урока требует каждый обязательный тип и сколько
// уже отработано. Считаем по DISTINCT word_id и по user_exercise_progress — ровно как гейт,
// иначе виджет покажет «40 из 40» там, где урок ещё не открылся.
// Требует те же алиасы (e, uep) и GROUP BY e.lesson_id.
export const REQUIRED_PROGRESS_SELECT = REQUIRED_TYPES.map(t => `
  count(DISTINCT e.word_id) FILTER (WHERE e.type = '${t}')::int AS ${t}_total,
  count(DISTINCT e.word_id) FILTER (WHERE e.type = '${t}' AND uep.exercise_id IS NOT NULL)::int AS ${t}_done`
).join(',')

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
export async function playableLessonIds(userId, schoolId, targetLang = null) {
  const { rows } = await db.query(
    `SELECT l.id, l.course_id, l.is_set
     FROM lessons l
     WHERE l.status = 'done' AND ($1::int IS NULL OR l.school_id = $1)
       AND ($2::text IS NULL OR l.target_lang = $2)
     ORDER BY l.course_id NULLS FIRST, l.lesson_number NULLS LAST, l.created_at`,
    [schoolId ?? null, targetLang])
  const playable = new Set()
  const needsSchedule = []
  const byCourse = new Map()
  for (const l of rows) {
    // Наборы (is_set) и внекурсовые/личные — всегда открыты, вне дрип-очереди
    if (!l.course_id || l.is_set) { playable.add(l.id); continue }
    if (!byCourse.has(l.course_id)) byCourse.set(l.course_id, [])
    byCourse.get(l.course_id).push(l)
  }
  if (byCourse.size === 0) return { playable, needsSchedule, passed: new Set() }

  const { rows: scRows } = await db.query(
    'SELECT course_id, weekdays, start_date FROM course_schedules WHERE user_id = $1', [userId])
  const scMap = new Map(scRows.map(s => [s.course_id, s]))

  // Локальная дата ученика — та же система отсчёта, что у push-уведомлений (runDripPush).
  // Без этого для UTC+2 после 22:00 пуш «открылся новый урок» уходил, а API урок ещё не отдавал.
  const { rows: tzRows } = await db.query('SELECT timezone FROM users WHERE id = $1', [userId])
  const localToday = new Date(localParts(tzRows[0]?.timezone, new Date()).date + 'T00:00:00Z')

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

  // Уроки, в которых ученик УЖЕ занимался (есть хотя бы одно выполненное упражнение).
  // Нужны гейту: правила прохождения со временем ужесточаются, и без этого набора любое
  // ужесточение отнимает доступ у того, кто честно занимался. Живой случай 30.07.2026:
  // после введения правила «карточка И выбери-ответ по каждому слову» у трёх учеников с
  // расписанием первый урок перестал считаться пройденным, цепочка порвалась на первом
  // звене — и вместо пятнадцати уроков остался доступен один. Занимался — урок твой.
  const { rows: touchedRows } = await db.query(
    `SELECT DISTINCT e.lesson_id
     FROM exercises e
     JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
     WHERE e.lesson_id = ANY($2)
     UNION
     SELECT lesson_id FROM user_lesson_unlocked WHERE user_id = $1 AND lesson_id = ANY($2)`,
    [userId, courseLessonIds])
  const touchedSet = new Set(touchedRows.map(r => r.lesson_id))

  for (const [cid, lessons] of byCourse) {
    const sc = scMap.get(cid)
    if (!sc) { needsSchedule.push(cid); continue }
    // Открыто уроков = max(календарь, пройдено+1). Пройденные уроки и ТЕКУЩИЙ (следующий за
    // ними) всегда доступны — их у ученика не отнять; календарь лишь ограничивает забег ВПЕРЁД
    // (нельзя перескочить дальше текущего быстрее расписания). Защищает от рассинхрона, когда
    // прогресс обогнал календарь (напр. расписание пересоздали позже прохождения).
    // Календарь считаем от той же даты, что и push-уведомления (runDripPush) — по ЛОКАЛЬНОЙ
    // дате ученика. Иначе для UTC+2 после 22:00 пуш «открылся новый урок» уже ушёл, а API
    // этот урок ещё не отдаёт.
    const passedCount = lessons.filter(l => passedSet.has(l.id)).length
    const openedByCalendar = unlockedCount(sc.start_date, sc.weekdays, localToday)
    // Начатые уроки тоже поднимают потолок календаря: иначе занимавшийся дальше ученик
    // упрётся в календарь и не увидит урок, который сам же начал.
    const reachedIdx = lessons.reduce((max, l, i) =>
      (passedSet.has(l.id) || touchedSet.has(l.id)) ? i : max, -1)
    const opened = Math.max(openedByCalendar, passedCount + 1, reachedIdx + 1)
    let doneIdx = 0, prevPassed = true
    for (const l of lessons) {
      const calendarOpen = doneIdx < opened
      // Урок остаётся доступным, если он пройден или начат — доступ, однажды полученный,
      // не отнимаем (см. комментарий к touchedSet).
      const earned = passedSet.has(l.id) || touchedSet.has(l.id)
      const gateOpen = doneIdx === 0 || prevPassed || earned
      if ((calendarOpen && gateOpen) || earned) playable.add(l.id)
      prevPassed = passedSet.has(l.id)
      doneIdx++
    }
  }

  // Фиксируем факт открытия: то, что человеку однажды показали как доступное, закрывать
  // нельзя, даже если правила прохождения потом изменятся. Пишем в фоне и молча — это
  // журнал доступа, а не часть ответа; упавшая запись не должна ломать выдачу уроков.
  const toRecord = [...playable].filter(id => courseLessonIds.includes(id) && !touchedSet.has(id))
  if (toRecord.length) {
    db.query(
      `INSERT INTO user_lesson_unlocked (user_id, lesson_id)
       SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [userId, toRecord]).catch(() => {})
  }

  return { playable, needsSchedule, passed: passedSet }
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
