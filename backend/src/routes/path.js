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
    // ?all=1 — показать все уроки одной дорогой, а не окно вокруг текущего
    const section = request.query.all === '1' ? nodes : nodes.slice(from, from + SECTION_SIZE)

    // ── Чекпойнты между уроками ───────────────────────────────────────────────
    // Идея Павла: урок разгружаем до ядра (слова и их узнавание), а речь, грамматику
    // и тематические наборы выносим на отдельные станции дороги. Станция стоит НА пути,
    // а не «где-то в разделе» — иначе её просто не делают.
    const lessonIds = section.map(n => n.lesson_id)
    const stationProgress = new Map()   // lesson_id -> {speech:{done,total}, grammar:{...}}
    if (lessonIds.length) {
      const { rows: st } = await db.query(
        `SELECT e.lesson_id, e.type,
                count(*)::int AS total,
                count(uep.exercise_id)::int AS done
         FROM exercises e
         LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
         WHERE e.lesson_id = ANY($2::int[])
           AND e.type IN ('dictation','speech','conjugation','declension')
         GROUP BY e.lesson_id, e.type`, [userId, lessonIds])
      for (const r of st) {
        const kind = (r.type === 'dictation' || r.type === 'speech') ? 'speech' : 'grammar'
        const cur = stationProgress.get(r.lesson_id) || { speech: { done: 0, total: 0 }, grammar: { done: 0, total: 0 } }
        cur[kind].done += r.done
        cur[kind].total += r.total
        stationProgress.set(r.lesson_id, cur)
      }
    }

    // Фразы урока — часть речевой станции
    const { rows: phraseRows } = lessonIds.length
      ? await db.query(
          `SELECT t.lesson_id,
                  count(p.id)::int AS total,
                  count(*) FILTER (WHERE up.step_listen AND up.step_build)::int AS done
           FROM phrase_topics t
           JOIN phrases p ON p.topic_id = t.id
           LEFT JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $1
           WHERE t.lesson_id = ANY($2::int[])
           GROUP BY t.lesson_id`, [userId, lessonIds])
      : { rows: [] }
    const phrasesByLesson = new Map(phraseRows.map(r => [r.lesson_id, r]))

    // Тематические наборы слов — уже существуют с названиями, ставим их станциями
    const { rows: wordSets } = await db.query(
      `SELECT l.id, l.title, COALESCE(l.title_translations, '{}') AS title_translations,
              count(e.id)::int AS total,
              count(uep.exercise_id)::int AS done
       FROM lessons l
       JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
       WHERE l.is_set = true AND l.target_lang = $2
       GROUP BY l.id
       -- Порядок стабильный (по id): каждый набор закреплён за своей позицией на
       -- дороге, иначе станции прыгали бы между заходами.
       ORDER BY l.id`, [userId, target])

    // Наборы фраз — такие же станции, как наборы слов, со своими названиями
    const { rows: phraseSets } = await db.query(
      `SELECT t.id, t.title, t.emoji,
              count(p.id)::int AS total,
              count(*) FILTER (WHERE up.step_listen AND up.step_build)::int AS done
       FROM phrase_topics t
       JOIN phrases p ON p.topic_id = t.id
       LEFT JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $1
       WHERE t.lang = $2
       GROUP BY t.id
       ORDER BY t.id`, [userId, target])

    // Собираем дорогу: урок → речевая станция → (каждые 3 урока) грамматика и набор слов
    const road = []
    section.forEach((node, i) => {
      road.push({ kind: 'lesson', ...node })

      const sp = stationProgress.get(node.lesson_id)?.speech || { done: 0, total: 0 }
      const ph = phrasesByLesson.get(node.lesson_id)
      const speechTotal = sp.total + (ph?.total || 0)
      if (speechTotal > 0) {
        const speechDone = sp.done + (ph?.done || 0)
        road.push({
          kind: 'checkpoint', type: 'speech', lesson_id: node.lesson_id,
          title: null, done: speechDone, total: speechTotal,
          state: speechDone >= speechTotal ? 'done' : (node.state === 'locked' ? 'locked' : 'open'),
        })
      }

      // Наборы — после каждого урока, но ЧЕРЕДУЯ слова и фразы: два одинаковых
      // набора подряд читаются как одна длинная станция. Индекс глобальный, а не
      // по разделу: так за курс встречается каждый набор, и порядок не прыгает.
      const globalIndex = from + i
      if (globalIndex % 2 === 0 && wordSets.length) {
        const ws = wordSets[Math.floor(globalIndex / 2) % wordSets.length]
        if (ws && ws.total > 0) {
          road.push({
            kind: 'checkpoint', type: 'wordset', lesson_id: ws.id,
            title: ws.title, title_translations: ws.title_translations,
            done: ws.done, total: ws.total,
            state: ws.done >= ws.total ? 'done' : 'open',
          })
        }
      } else if (phraseSets.length) {
        const ps = phraseSets[Math.floor(globalIndex / 2) % phraseSets.length]
        if (ps && ps.total > 0) {
          road.push({
            kind: 'checkpoint', type: 'phraseset', topic_id: ps.id,
            title: ps.title, emoji: ps.emoji,
            done: ps.done, total: ps.total,
            state: ps.done >= ps.total ? 'done' : 'open',
          })
        }
      }

      // Каждые три урока — грамматическая станция по этим трём
      if ((i + 1) % 3 === 0) {
        const group = section.slice(Math.max(0, i - 2), i + 1)
        const g = group.reduce((acc, n) => {
          const gp = stationProgress.get(n.lesson_id)?.grammar || { done: 0, total: 0 }
          return { done: acc.done + gp.done, total: acc.total + gp.total }
        }, { done: 0, total: 0 })
        if (g.total > 0) {
          road.push({
            kind: 'checkpoint', type: 'grammar', lesson_ids: group.map(n => n.lesson_id),
            done: g.done, total: g.total,
            state: g.done >= g.total ? 'done' : 'open',
          })
        }
      }
    })

    // Сундук в конце раздела — зачёт по последнему уроку раздела
    const lastLesson = section[section.length - 1]
    if (lastLesson) {
      road.push({
        kind: 'checkpoint', type: 'exam', lesson_id: lastLesson.lesson_id,
        done: section.filter(n => n.state === 'done').length, total: section.length,
        state: section.every(n => n.state === 'done') ? 'done' : 'open',
      })
    }

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

    // Хвосты одним числом: пропущенные упражнения плюс пропущенные фразы.
    // Раньше их было видно только внутри урока, и общая картина не собиралась.
    const { rows: tailRows } = await db.query(
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
      road,
      total_lessons: nodes.length,
      done_lessons: nodes.filter(n => n.state === 'done').length,
      stats: {
        streak,
        xp_today: (todayRows[0]?.n || 0) * 10,   // 10 XP за упражнение — как в макете
        exercises_today: todayRows[0]?.n || 0,
      },
      tails: {
        exercises: tailRows[0]?.exercises || 0,
        phrases: tailRows[0]?.phrases || 0,
        total: (tailRows[0]?.exercises || 0) + (tailRows[0]?.phrases || 0),
      },
    }
  })

  // Обзор урока для режима новичка (макет 2b): урок как список шагов, а не как
  // россыпь упражнений. Шаг = тип упражнения; отдельным шагом идёт набор фраз.
  fastify.get('/api/path/lesson/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const lessonId = parseInt(request.params.id)
    const userId = request.user.id

    const { rows: lessonRows } = await db.query(
      `SELECT l.id, l.title, COALESCE(l.title_translations, '{}') AS title_translations,
              l.lesson_number,
              (SELECT count(*)::int FROM words w WHERE w.lesson_id = l.id) AS words_count
       FROM lessons l WHERE l.id = $1`, [lessonId])
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: byType } = await db.query(
      `SELECT e.type,
              count(*)::int AS total,
              count(uep.exercise_id)::int AS done
       FROM exercises e
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $2
       WHERE e.lesson_id = $1
       GROUP BY e.type`, [lessonId, userId])

    // Набор фраз — отдельный шаг, в счёт упражнений урока не входит
    const { rows: topicRows } = await db.query(
      'SELECT id FROM phrase_topics WHERE lesson_id = $1', [lessonId])
    let phrases = null
    if (topicRows[0]) {
      const { rows: pr } = await db.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE up.step_listen AND up.step_build)::int AS done
         FROM phrases p
         LEFT JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $2
         WHERE p.topic_id = $1`, [topicRows[0].id, userId])
      phrases = { topic_id: topicRows[0].id, ...pr[0] }
    }

    const totalEx = byType.reduce((n, r) => n + r.total, 0)
    const doneEx = byType.reduce((n, r) => n + r.done, 0)
    return {
      lesson: lessonRows[0],
      steps: byType.sort((a, b) => a.type.localeCompare(b.type)),
      phrases,
      total: totalEx,
      done: doneEx,
      // ~8 секунд на упражнение — грубая, но честная оценка по нашим замерам сессий
      minutes: Math.max(3, Math.round(((totalEx - doneEx) * 8) / 60)),
    }
  })
}
