import { db } from '../db/index.js'
import { regenerateExercisesFromDb } from '../services/processor.js'

const HARD_SET_THEME = '🔥 Мои сложные слова'

// Сложные слова ученика: его же попытки, где много ошибок. Мин. 3 попытки, есть ошибки.
async function myHardWords(userId, limit = 40) {
  const { rows } = await db.query(`
    SELECT w.word_de, w.translation_ru,
           COUNT(ea.id)::int AS attempts,
           COUNT(*) FILTER (WHERE NOT ea.is_correct)::int AS wrong
    FROM exercise_attempts ea
    JOIN exercises e ON e.id = ea.exercise_id
    JOIN words w ON w.id = e.word_id
    WHERE ea.user_id = $1 AND e.word_id IS NOT NULL
    GROUP BY w.word_de, w.translation_ru
    HAVING COUNT(ea.id) >= 3 AND COUNT(*) FILTER (WHERE NOT ea.is_correct) > 0
    ORDER BY (COUNT(*) FILTER (WHERE NOT ea.is_correct))::float / NULLIF(COUNT(ea.id),0) DESC,
             wrong DESC
    LIMIT $2`, [userId, limit])
  return rows.map(w => ({ ...w, wrong_pct: Math.round(w.wrong / w.attempts * 100) }))
}

// Учебная аналитика для учителя: прогресс учеников по ЕГО контенту (упражнения его уроков).
// Кто сколько прошёл, точность, где застревают, какие слова труднее всего. Данные — из
// exercise_attempts (is_correct/quality) и user_word_status. Только для роли owner.
export async function analyticsRoutes(fastify) {
  fastify.get('/api/analytics/overview', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const ownerId = request.user.id

    // Активность учеников по упражнениям моих уроков
    const { rows: attempts } = await db.query(`
      SELECT u.id, COALESCE(u.full_name, u.email) AS name,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE ea.is_correct)::int AS correct,
             MAX(ea.attempted_at) AS last_active,
             COUNT(*) FILTER (WHERE ea.attempted_at > now() - interval '7 days')::int AS attempts_7d
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN lessons l ON l.id = e.lesson_id
      JOIN users u ON u.id = ea.user_id
      WHERE l.owner_id = $1 AND u.role = 'student'
      GROUP BY u.id, name
      ORDER BY attempts DESC`, [ownerId])

    // Слова known/learning по ученику (среди моих слов)
    const { rows: wordStatus } = await db.query(`
      SELECT uws.user_id,
             COUNT(*) FILTER (WHERE uws.status='known')::int AS known,
             COUNT(*) FILTER (WHERE uws.status='learning')::int AS learning
      FROM user_word_status uws
      JOIN words w ON w.id = uws.word_id
      JOIN lessons l ON l.id = w.lesson_id
      WHERE l.owner_id = $1
      GROUP BY uws.user_id`, [ownerId])
    const wsMap = Object.fromEntries(wordStatus.map(r => [r.user_id, r]))

    const students = attempts.map(s => ({
      id: s.id, name: s.name, attempts: s.attempts, correct: s.correct,
      accuracy: s.attempts ? Math.round(s.correct / s.attempts * 100) : 0,
      last_active: s.last_active, attempts_7d: s.attempts_7d,
      known: wsMap[s.id]?.known || 0, learning: wsMap[s.id]?.learning || 0,
    }))

    // Самые трудные слова: низкий % верных, минимум 3 попытки
    const { rows: hardest } = await db.query(`
      SELECT w.word_de, w.translation_ru,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE NOT ea.is_correct)::int AS wrong
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN words w ON w.id = e.word_id
      JOIN lessons l ON l.id = e.lesson_id
      WHERE l.owner_id = $1
      GROUP BY w.id, w.word_de, w.translation_ru
      HAVING COUNT(ea.id) >= 3
      ORDER BY (COUNT(*) FILTER (WHERE NOT ea.is_correct))::float / NULLIF(COUNT(ea.id),0) DESC, wrong DESC
      LIMIT 20`, [ownerId])

    // Где застревают: разрез по типу упражнения
    const { rows: byType } = await db.query(`
      SELECT e.type,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE ea.is_correct)::int AS correct
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN lessons l ON l.id = e.lesson_id
      WHERE l.owner_id = $1
      GROUP BY e.type
      ORDER BY attempts DESC`, [ownerId])

    const totalAttempts = students.reduce((a, s) => a + s.attempts, 0)
    const totalCorrect = students.reduce((a, s) => a + s.correct, 0)

    return {
      totals: {
        students: students.length,
        active_7d: students.filter(s => s.attempts_7d > 0).length,
        attempts: totalAttempts,
        accuracy: totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0,
      },
      students,
      hardestWords: hardest.map(w => ({ ...w, wrong_pct: Math.round(w.wrong / w.attempts * 100) })),
      byType: byType.map(x => ({ type: x.type, attempts: x.attempts, accuracy: x.attempts ? Math.round(x.correct / x.attempts * 100) : 0 })),
    }
  })

  // ── Отчёт по одному уроку: где буксует группа + как идёт каждый ученик ──
  fastify.get('/api/analytics/lesson/:lessonId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const ownerId = request.user.id
    const lessonId = parseInt(request.params.lessonId, 10)
    if (!Number.isInteger(lessonId)) return reply.status(400).send({ error: 'Некорректный урок' })

    // Урок принадлежит этому учителю?
    const { rows: lrows } = await db.query(
      'SELECT id, title, school_id FROM lessons WHERE id = $1 AND owner_id = $2', [lessonId, ownerId])
    if (!lrows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    const lesson = lrows[0]

    // Блок А: трудные слова урока по классу (+ сколько учеников завязло на слове)
    const { rows: hardRows } = await db.query(`
      WITH per AS (
        SELECT e.word_id, ea.user_id,
               COUNT(*)::int AS att,
               COUNT(*) FILTER (WHERE NOT ea.is_correct)::int AS wrong
        FROM exercise_attempts ea
        JOIN exercises e ON e.id = ea.exercise_id
        WHERE e.lesson_id = $1 AND e.word_id IS NOT NULL
        GROUP BY e.word_id, ea.user_id
      )
      SELECT w.word_de, w.translation_ru AS translation,
             SUM(per.att)::int AS attempts,
             SUM(per.wrong)::int AS wrong,
             COUNT(*) FILTER (WHERE per.att >= 3 AND per.wrong::float / per.att >= 0.5)::int AS students_stuck
      FROM per JOIN words w ON w.id = per.word_id
      GROUP BY w.id, w.word_de, w.translation_ru
      HAVING SUM(per.att) >= 3
      ORDER BY SUM(per.wrong)::float / NULLIF(SUM(per.att),0) DESC, wrong DESC
      LIMIT 20`, [lessonId])
    const hardWords = hardRows.map(w => ({
      word_de: w.word_de, translation: w.translation,
      attempts: w.attempts, wrong_pct: Math.round(w.wrong / w.attempts * 100),
      students_stuck: w.students_stuck,
    }))

    // Блок А: разрез по типу упражнения этого урока
    const { rows: byTypeRows } = await db.query(`
      SELECT e.type,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE ea.is_correct)::int AS correct
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      WHERE e.lesson_id = $1
      GROUP BY e.type
      ORDER BY attempts DESC`, [lessonId])
    const byType = byTypeRows.map(x => ({
      type: x.type, attempts: x.attempts,
      accuracy: x.attempts ? Math.round(x.correct / x.attempts * 100) : 0,
    }))

    // Блок Б: агрегат по ученикам, трогавшим урок
    const { rows: agg } = await db.query(`
      SELECT ea.user_id AS id, COALESCE(u.full_name, u.email) AS name,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE ea.is_correct)::int AS correct,
             MAX(ea.attempted_at) AS last_active
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN users u ON u.id = ea.user_id
      WHERE e.lesson_id = $1 AND u.role = 'student'
      GROUP BY ea.user_id, name`, [lessonId])

    // known/learning по словам урока
    const { rows: wsRows } = await db.query(`
      SELECT uws.user_id,
             COUNT(*) FILTER (WHERE uws.status='known')::int AS known,
             COUNT(*) FILTER (WHERE uws.status='learning')::int AS learning
      FROM user_word_status uws
      JOIN words w ON w.id = uws.word_id
      WHERE w.lesson_id = $1
      GROUP BY uws.user_id`, [lessonId])
    const wsMap = Object.fromEntries(wsRows.map(r => [r.user_id, r]))

    // Завязшие слова по (ученик, слово): att>=3 и wrong/att>=0.5
    const { rows: pw } = await db.query(`
      SELECT ea.user_id, w.word_de, w.translation_ru AS translation,
             COUNT(*)::int AS att,
             COUNT(*) FILTER (WHERE NOT ea.is_correct)::int AS wrong
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN words w ON w.id = e.word_id
      WHERE e.lesson_id = $1 AND e.word_id IS NOT NULL
      GROUP BY ea.user_id, w.word_de, w.translation_ru`, [lessonId])
    const stuckByUser = {}
    for (const r of pw) {
      if (r.att >= 3 && r.wrong / r.att >= 0.5) {
        (stuckByUser[r.user_id] ||= []).push({
          word_de: r.word_de, translation: r.translation,
          wrong_pct: Math.round(r.wrong / r.att * 100),
        })
      }
    }

    const students = agg.map(s => {
      const stuck = stuckByUser[s.id] || []
      return {
        id: s.id, name: s.name, attempts: s.attempts, correct: s.correct,
        accuracy: s.attempts ? Math.round(s.correct / s.attempts * 100) : 0,
        known: wsMap[s.id]?.known || 0, learning: wsMap[s.id]?.learning || 0,
        stuck_words: stuck.length, stuck_list: stuck, last_active: s.last_active,
      }
    })

    // Не приступили: ученики школы владельца без попыток по этому уроку
    const { rows: notStarted } = await db.query(`
      SELECT u.id, COALESCE(u.full_name, u.email) AS name
      FROM users u
      WHERE u.role = 'student' AND u.school_id = $2
        AND u.id NOT IN (
          SELECT DISTINCT ea.user_id FROM exercise_attempts ea
          JOIN exercises e ON e.id = ea.exercise_id WHERE e.lesson_id = $1
        )
      ORDER BY name`, [lessonId, lesson.school_id])

    const totalAttempts = students.reduce((a, s) => a + s.attempts, 0)
    const totalCorrect = students.reduce((a, s) => a + s.correct, 0)

    return {
      lesson: { id: lesson.id, title: lesson.title },
      totals: {
        students_touched: students.length,
        students_total: students.length + notStarted.length,
        attempts: totalAttempts,
        accuracy: totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0,
      },
      group: { hardWords, byType },
      students,
      notStarted,
    }
  })

  // ── Личный кабинет ученика: мои сложные слова + сборка набора для тренировки ──

  // Список моих сложных слов + статус личного набора (если уже собран)
  fastify.get('/api/analytics/my-hard-words', { preHandler: [fastify.authenticate] }, async (request) => {
    const userId = request.user.id
    const words = await myHardWords(userId)
    const { rows: setRows } = await db.query(
      `SELECT id, status FROM lessons
       WHERE owner_id = $1 AND is_personal AND set_theme = $2 ORDER BY id DESC LIMIT 1`,
      [userId, HARD_SET_THEME])
    return { words, set: setRows[0] || null }
  })

  // Собрать (или пересобрать) личный набор «Мои сложные слова» и сгенерировать упражнения
  fastify.post('/api/analytics/my-hard-words/make-set', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const target = request.headers['x-target-lang'] || 'de'
    const hard = await myHardWords(userId)
    if (!hard.length) return reply.status(400).send({ error: 'Сложных слов пока нет — порешай упражнения побольше' })

    // Полные строки слов (с картинкой/переводами) по нужным словам — берём лучшую копию
    const wordsDe = hard.map(w => w.word_de)
    const { rows: full } = await db.query(
      `SELECT DISTINCT ON (lower(word_de)) word_de, translation_ru, example_sentence,
              example_sentence_ru, image_url, translations, source
       FROM words WHERE word_de = ANY($1::text[])
       ORDER BY lower(word_de), (image_url IS NOT NULL) DESC`, [wordsDe])
    if (!full.length) return reply.status(400).send({ error: 'Не удалось собрать слова' })

    // Переиспользуем существующий личный набор или создаём новый
    let lessonId
    const { rows: ex } = await db.query(
      `SELECT id FROM lessons WHERE owner_id = $1 AND is_personal AND set_theme = $2 ORDER BY id DESC LIMIT 1`,
      [userId, HARD_SET_THEME])
    if (ex[0]) {
      lessonId = ex[0].id
      await db.query('DELETE FROM words WHERE lesson_id = $1', [lessonId])
      await db.query('DELETE FROM exercises WHERE lesson_id = $1', [lessonId])
      await db.query('UPDATE lessons SET target_lang = $2, status = $3 WHERE id = $1',
        [lessonId, target, 'processing'])
    } else {
      const { rows: ins } = await db.query(
        `INSERT INTO lessons (owner_id, title, description, target_lang, status, is_personal, is_set, set_theme)
         VALUES ($1, $2, $3, $4, 'processing', true, true, $2) RETURNING id`,
        [userId, HARD_SET_THEME, 'Слова, в которых чаще всего ошибаюсь', target])
      lessonId = ins[0].id
    }

    // Заливаем слова (копии, без генерации картинок — переиспользуем готовые)
    for (const w of full) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence,
           example_sentence_ru, image_url, translations, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (lesson_id, word_de) DO NOTHING`,
        [lessonId, userId, w.word_de, w.translation_ru, w.example_sentence,
         w.example_sentence_ru, w.image_url, w.translations, w.source || 'personal'])
    }

    // Генерируем упражнения из слов (дешёвый gpt-4o-mini, без картинок)
    await regenerateExercisesFromDb(lessonId)
    return { lessonId, count: full.length }
  })
}
