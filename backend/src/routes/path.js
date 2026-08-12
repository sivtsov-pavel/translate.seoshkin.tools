// API экрана «Путь» (режим новичка): одна дорога из узлов-уроков, активен ровно один.
//
// Ученику не нужно ничего выбирать — он видит, где находится, что дальше и сколько
// осталось до конца раздела. Поэтому эндпоинт отдаёт готовые узлы с состояниями,
// а не сырые списки, из которых клиенту пришлось бы это вычислять.
import { db } from '../db/index.js'
import { playableLessonIds, LESSON_PASSED_HAVING } from '../services/drip.js'

// Узлов в разделе: столько уроков показываем одной «дорогой», дальше — следующий раздел
const SECTION_SIZE = 6

export async function pathRoutes(fastify) {
  fastify.get('/api/path', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id: userId, role } = request.user
    const target = request.headers['x-target-lang'] || 'de'
    const schoolId = request.user.school_id ?? null

    // Уроки в естественном порядке. Учителю — свои, ученику — школьные готовые.
    const params = [userId, target]
    let scope
    if (role === 'owner') {
      scope = 'l.owner_id = $1 AND l.target_lang = $2 AND l.is_set = false'
    } else {
      params.push(schoolId)
      scope = "l.status = 'done' AND l.target_lang = $2 AND l.is_set = false AND ($3::int IS NULL OR l.school_id = $3)"
    }

    const { rows: lessons } = await db.query(
      `SELECT l.id, l.lesson_number, l.title, COALESCE(l.title_translations, '{}') AS title_translations,
              count(e.id)::int AS ex_total,
              count(uep.exercise_id)::int AS ex_done
       FROM lessons l
       JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
       WHERE ${scope}
       GROUP BY l.id
       ORDER BY l.lesson_number NULLS LAST, l.id`, params)

    // Пройденные — по тому же правилу, что и везде: каждое слово отработано
    const { rows: passedRows } = await db.query(
      `SELECT e.lesson_id FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
       WHERE ${scope}
       GROUP BY e.lesson_id HAVING ${LESSON_PASSED_HAVING}`, params)
    const passed = new Set(passedRows.map(r => r.lesson_id))

    // Дрип: ученику доступны только разблокированные уроки, учителю — все свои
    let playable = null
    if (role !== 'owner') {
      const r = await playableLessonIds(userId, schoolId, target)
      playable = new Set(r.playable)
    }

    // Состояния узлов: пройденный → зелёный, первый непройденный → текущий, дальше — закрытые
    let currentFound = false
    const nodes = lessons.map(l => {
      const done = passed.has(l.id)
      const available = playable ? playable.has(l.id) : true
      let state = 'locked'
      if (done) state = 'done'
      else if (!currentFound && available) { state = 'current'; currentFound = true }
      return {
        lesson_id: l.id,
        number: l.lesson_number,
        title: l.title,
        title_translations: l.title_translations,
        state,
        progress: l.ex_total ? Math.round((l.ex_done / l.ex_total) * 100) / 100 : 0,
        ex_total: l.ex_total,
        ex_done: l.ex_done,
      }
    })

    // Раздел — окно вокруг текущего узла, чтобы дорога не была бесконечной
    const currentIndex = Math.max(0, nodes.findIndex(n => n.state === 'current'))
    const sectionIndex = Math.floor(currentIndex / SECTION_SIZE)
    const from = sectionIndex * SECTION_SIZE
    const section = nodes.slice(from, from + SECTION_SIZE)

    // Метрики верхних плиток
    const { rows: streakRows } = await db.query(
      `SELECT DISTINCT (a.attempted_at AT TIME ZONE 'UTC')::date AS d
       FROM exercise_attempts a WHERE a.user_id = $1
       ORDER BY d DESC LIMIT 60`, [userId])
    let streak = 0
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    for (const row of streakRows) {
      const d = new Date(row.d); d.setUTCHours(0, 0, 0, 0)
      const diff = Math.round((today - d) / 86400000)
      if (diff === streak || (streak === 0 && diff === 1)) streak++
      else break
    }

    const { rows: todayRows } = await db.query(
      `SELECT count(*)::int AS n FROM exercise_attempts
       WHERE user_id = $1 AND attempted_at >= CURRENT_DATE`, [userId])

    return {
      section: {
        index: sectionIndex,
        done: section.filter(n => n.state === 'done').length,
        total: section.length,
      },
      nodes: section,
      total_lessons: nodes.length,
      done_lessons: nodes.filter(n => n.state === 'done').length,
      stats: {
        streak,
        xp_today: (todayRows[0]?.n || 0) * 10,   // 10 XP за упражнение — как в макете
        exercises_today: todayRows[0]?.n || 0,
      },
    }
  })
}
