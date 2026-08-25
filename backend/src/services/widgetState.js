// Состояние для виджета на домашнем экране: «сколько осталось до открытия нового урока».
//
// Виджет — глупый экран: он ничего не вычисляет и не хранит прогресс, только рисует то,
// что отдал сервер. Любой собственный счётчик на телефоне рано или поздно разойдётся с
// приложением, и человек перестанет верить обоим.
//
// Считаем ровно тем же правилом, что открывает уроки (REQUIRED_TYPES в drip.js): карточка
// и «выбери ответ» по каждому слову урока. Остальные типы — диктант, речь, грамматика,
// фразы — в минимум не входят и живут в «хвостах», их показываем отдельным числом.
import { db } from '../db/index.js'
import {
  playableLessonIds,
  unlockDateForIndex,
  REQUIRED_TYPES,
  REQUIRED_PROGRESS_SELECT,
} from './drip.js'
import { localParts } from './timeutil.js'

// Состояния виджета. Их четыре, и виджет обязан уметь показать каждое: если рисовать
// только «идёт урок», то после прохождения виджет замрёт на «40 из 40» и будет выглядеть
// сломанным именно в тот момент, когда человек молодец.
export const WIDGET_STATES = {
  IN_PROGRESS: 'in_progress',                   // идёт урок, есть что делать
  WAITING_CALENDAR: 'passed_waiting_calendar',  // урок пройден, следующий откроется по расписанию
  NO_SCHEDULE: 'no_schedule',                   // курс есть, расписание не выбрано
  ALL_DONE: 'all_done',                         // уроки кончились
  NO_LESSONS: 'no_lessons',                     // материалов нет вовсе (новая школа/язык)
}

/**
 * Чистая часть: по готовым данным решает, что показать. Без базы — чтобы поведение
 * проверялось тестами, а не на живом ученике (как было с гейтом дрипа).
 *
 * @param {object} input
 * @param {Array}  input.lessons  уроки по порядку: { id, number, title, title_translations,
 *                                course_id, required: { flashcard: {done,total}, ... } }
 * @param {Set}    input.passed   id пройденных уроков
 * @param {Set|null} input.playable id доступных уроков (null — ограничений нет, это учитель)
 * @param {Array}  input.needsSchedule id курсов без расписания
 * @param {Map}    input.schedules course_id -> { start_date, weekdays }
 */
export function resolveWidgetState({ lessons, passed, playable, needsSchedule = [], schedules = new Map() }) {
  if (!lessons.length) return { state: WIDGET_STATES.NO_LESSONS, lesson: null }

  const isPlayable = id => playable === null || playable.has(id)
  const needsScheduleSet = new Set(needsSchedule)

  // Текущий урок — первый непройденный из доступных. Ровно как «зелёный узел» на карте пути,
  // чтобы виджет и карта показывали один и тот же урок.
  const current = lessons.find(l => !passed.has(l.id) && isPlayable(l.id))
  if (current) {
    return {
      state: WIDGET_STATES.IN_PROGRESS,
      lesson: current,
      required: sumRequired(current.required),
      byType: current.required,
      nextUnlockDate: null,
    }
  }

  // Доступного непройденного урока нет. Причин ровно три, и они означают для человека
  // совершенно разное — сваливать их в одно «всё сделано» нельзя.
  const nextLocked = lessons.find(l => !passed.has(l.id))
  if (!nextLocked) return { state: WIDGET_STATES.ALL_DONE, lesson: null }

  if (needsScheduleSet.has(nextLocked.course_id)) {
    return { state: WIDGET_STATES.NO_SCHEDULE, lesson: nextLocked, courseId: nextLocked.course_id }
  }

  // Урок закрыт календарём: считаем, когда наступит его учебный день.
  const sc = schedules.get(nextLocked.course_id)
  const indexInCourse = lessons.filter(l => l.course_id === nextLocked.course_id).indexOf(nextLocked)
  const unlockDate = sc && indexInCourse >= 0
    ? unlockDateForIndex(sc.start_date, sc.weekdays, indexInCourse)
    : null

  return {
    state: WIDGET_STATES.WAITING_CALENDAR,
    lesson: nextLocked,
    nextUnlockDate: unlockDate ? unlockDate.toISOString().slice(0, 10) : null,
  }
}

// Сумма по обязательным типам: «34 из 40» — одно число, понятное на маленьком виджете.
// Разбивка по типам едет рядом отдельным полем, для второй строки.
export function sumRequired(byType) {
  let done = 0, total = 0
  for (const type of REQUIRED_TYPES) {
    done  += byType?.[type]?.done  ?? 0
    total += byType?.[type]?.total ?? 0
  }
  return { done, total }
}

/**
 * Полное состояние виджета для пользователя. Лёгкий путь: только то, что рисуется на
 * виджете, без сборки всей карты пути (/api/path делает это десятком запросов и для
 * опроса раз в полчаса не годится).
 */
export async function buildWidgetState(userId, schoolId, role, targetLang = 'de') {
  // Уроки в том же порядке и с той же областью видимости, что на карте пути.
  const params = [userId, targetLang]
  let scope
  if (role === 'owner') {
    scope = 'l.owner_id = $1 AND l.target_lang = $2 AND l.is_set = false'
  } else {
    params.push(schoolId ?? null)
    scope = "l.status = 'done' AND l.target_lang = $2 AND l.is_set = false AND ($3::int IS NULL OR l.school_id = $3)"
  }

  const { rows } = await db.query(
    `SELECT l.id, l.lesson_number, l.title, COALESCE(l.title_translations, '{}') AS title_translations,
            l.course_id,
            ${REQUIRED_PROGRESS_SELECT}
     FROM lessons l
     JOIN exercises e ON e.lesson_id = l.id
     LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
     WHERE ${scope}
     GROUP BY l.id
     ORDER BY l.lesson_number NULLS LAST, l.id`, params)

  const lessons = rows.map(r => ({
    id: r.id,
    number: r.lesson_number,
    title: r.title,
    title_translations: r.title_translations,
    course_id: r.course_id,
    required: Object.fromEntries(REQUIRED_TYPES.map(t => [t, {
      done:  r[`${t}_done`]  ?? 0,
      total: r[`${t}_total`] ?? 0,
    }])),
  }))

  // Пройденные — по сумме обязательных типов. Это та же формула, что LESSON_PASSED_HAVING,
  // просто применённая к уже посчитанным числам: лишний запрос в базу не нужен.
  const passed = new Set(lessons.filter(isLessonPassed).map(l => l.id))

  let playable = null, needsSchedule = []
  if (role !== 'owner') {
    const r = await playableLessonIds(userId, schoolId ?? null, targetLang)
    playable = r.playable
    needsSchedule = r.needsSchedule
  }

  const { rows: scRows } = await db.query(
    'SELECT course_id, weekdays, start_date FROM course_schedules WHERE user_id = $1', [userId])
  const schedules = new Map(scRows.map(s => [s.course_id, s]))

  const base = resolveWidgetState({ lessons, passed, playable, needsSchedule, schedules })

  const [tails, streak, tz] = await Promise.all([
    countTails(userId),
    countStreak(userId),
    db.query('SELECT timezone FROM users WHERE id = $1', [userId]).then(r => r.rows[0]?.timezone),
  ])

  const lesson = base.lesson
  return {
    date: localParts(tz, new Date()).date,     // локальная дата ученика, а не UTC сервера
    state: base.state,
    lesson: lesson ? {
      id: lesson.id,
      number: lesson.number,
      title: lesson.title,
      title_translations: lesson.title_translations,
    } : null,
    required: base.required ?? null,
    byType: base.byType ?? null,
    nextUnlockDate: base.nextUnlockDate ?? null,
    courseId: base.courseId ?? null,
    tails,
    streak,
    nextUrl: lesson && base.state === WIDGET_STATES.IN_PROGRESS ? `/lesson/${lesson.id}` : '/',
    updatedAt: new Date().toISOString(),
  }
}

// Урок пройден = по каждому обязательному типу отработаны все слова, и хотя бы один
// обязательный тип в уроке вообще есть (уроки из одних диктантов не держат цепочку —
// баг Павла от 22.08.2026).
export function isLessonPassed(lesson) {
  const types = REQUIRED_TYPES.map(t => lesson.required[t] ?? { done: 0, total: 0 })
  if (!types.some(x => x.total > 0)) return false
  return types.every(x => x.done >= x.total)
}

// Хвосты одним числом — отложенные упражнения плюс отложенные фразы (как на карте пути).
async function countTails(userId) {
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM exercise_deferrals d
         WHERE d.user_id = $1
           AND NOT EXISTS (SELECT 1 FROM exercise_attempts a
                            WHERE a.exercise_id = d.exercise_id AND a.user_id = $1)) AS exercises,
       (SELECT count(*)::int FROM phrase_deferrals pd
         LEFT JOIN user_phrase_progress up ON up.phrase_id = pd.phrase_id AND up.user_id = $1
         WHERE pd.user_id = $1
           AND NOT (COALESCE(up.step_listen, FALSE) AND COALESCE(up.step_build, FALSE))) AS phrases`,
    [userId])
  return (rows[0]?.exercises ?? 0) + (rows[0]?.phrases ?? 0)
}

// Серия дней подряд с активностью — та же логика, что на карте пути и в дашборде.
async function countStreak(userId) {
  const { rows } = await db.query(
    `SELECT DISTINCT (attempted_at AT TIME ZONE 'UTC')::date AS d
     FROM exercise_attempts WHERE user_id = $1 ORDER BY d DESC LIMIT 400`, [userId])
  if (!rows.length) return 0
  const oneDay = 86400000
  const todayUTC = new Date(new Date().toISOString().slice(0, 10)).getTime()
  const set = new Set(rows.map(r => new Date(r.d).getTime()))
  let cursor = set.has(todayUTC) ? todayUTC : todayUTC - oneDay
  let streak = 0
  while (set.has(cursor)) { streak++; cursor -= oneDay }
  return streak
}
