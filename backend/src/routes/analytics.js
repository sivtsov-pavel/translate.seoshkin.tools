import { db } from '../db/index.js'

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
}
