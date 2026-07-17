import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'

// ── Офлайн-ядро ──────────────────────────────────────────────────────────────
// Словарь и базовые упражнения работают без интернета (PWA/TWA):
//   GET  /api/offline/bundle — всё для офлайна одним запросом (слова + упражнения
//        офлайн-типов с per-user SRS-прогрессом). Клиент кладёт в IndexedDB.
//   POST /api/offline/sync — очередь ответов, накопленных офлайн: применяем ту же
//        SM-2 логику, что и /exercises/:id/attempt, в порядке answered_at.
// ИИ-типы (sentence_write — проверка GPT, speech — Whisper) в офлайн не входят.

const OFFLINE_TYPES = ['flashcard', 'letter_fill', 'multiple_choice', 'fill_blank', 'dictation']

export async function offlineRoutes(fastify) {

  fastify.get('/api/offline/bundle', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const target = request.headers['x-target-lang'] || 'de'

    // Скоупы — те же, что в /api/words и /api/exercises/today (мультиарендность)
    let lessonFilter, params
    if (role === 'owner') {
      params = [userId, target]
      lessonFilter = 'l.owner_id = $1 AND l.target_lang = $2'
    } else {
      params = [userId, target, request.user.school_id ?? null]
      lessonFilter = "l.status = 'done' AND l.target_lang = $2 AND ($3::int IS NULL OR l.school_id = $3)"
    }

    // Слова — как /api/words (дедуп по слову, статус per-user)
    const { rows: words } = await db.query(
      `SELECT DISTINCT ON (w.word_de) w.id, w.word_de, w.translation_ru,
              COALESCE(w.translations, '{}') AS translations,
              w.example_sentence, w.example_sentence_ru,
              COALESCE(w.image_url, (
                SELECT e.image_url FROM exercises e
                WHERE e.word_id = w.id AND e.image_url IS NOT NULL LIMIT 1
              )) AS image_url,
              l.title AS lesson_title,
              COALESCE(l.title_translations, '{}') AS lesson_title_translations,
              COALESCE(uws.status, w.status, 'new') AS status
       FROM words w
       LEFT JOIN lessons l ON l.id = w.lesson_id
       LEFT JOIN user_word_status uws ON uws.word_id = w.id AND uws.user_id = $1
       WHERE ${lessonFilter}
       ORDER BY w.word_de, (w.image_url IS NOT NULL) DESC, w.created_at DESC`,
      params)

    // Упражнения офлайн-типов + SRS-прогресс пользователя — ВСЕ (без фильтра «на сегодня»):
    // очередь на день локальный SRS соберёт сам, в т.ч. завтра без сети
    const { rows: exercises } = await db.query(
      `SELECT e.id, e.lesson_id, e.word_id, e.type, e.payload,
              COALESCE(e.payload_translations, '{}') AS payload_translations,
              w.word_de, w.translation_ru, COALESCE(w.translations, '{}') AS translations,
              COALESCE(w.image_url, e.image_url) AS image_url,
              l.title AS lesson_title,
              COALESCE(l.title_translations, '{}') AS lesson_title_translations,
              COALESCE(uep.easiness_factor, 2.5)          AS easiness_factor,
              COALESCE(uep.interval_days, 0)              AS interval_days,
              COALESCE(uep.repetitions, 0)                AS repetitions,
              COALESCE(uep.next_review_date, CURRENT_DATE)::text AS next_review_date
       FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN words w ON w.id = e.word_id
       LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
       WHERE ${lessonFilter} AND e.type = ANY($${params.length + 1})
       ORDER BY e.lesson_id, e.id
       LIMIT 5000`,
      [...params, OFFLINE_TYPES])

    return { words, exercises, synced_at: new Date().toISOString() }
  })

  fastify.post('/api/offline/sync', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['answers'],
        properties: {
          answers: {
            type: 'array',
            maxItems: 2000,
            items: {
              type: 'object',
              required: ['exercise_id', 'quality'],
              properties: {
                exercise_id: { type: 'integer' },
                quality:     { type: 'integer', minimum: 0, maximum: 5 },
                user_answer: { type: 'string' },
                answered_at: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const userId = request.user.id
    // Применяем в порядке ответов (у двух устройств — последний побеждает по времени)
    const answers = [...request.body.answers]
      .sort((a, b) => String(a.answered_at || '').localeCompare(String(b.answered_at || '')))

    let applied = 0
    for (const a of answers) {
      try {
        const { rows: progRows } = await db.query(
          'SELECT * FROM user_exercise_progress WHERE user_id = $1 AND exercise_id = $2',
          [userId, a.exercise_id])
        const prog = progRows[0] ?? { easiness_factor: 2.5, interval_days: 0, repetitions: 0 }
        const { newEf, newInterval, newReps } = sm2(
          a.quality, parseFloat(prog.easiness_factor), prog.interval_days, prog.repetitions)

        const nextReview = new Date()
        nextReview.setDate(nextReview.getDate() + newInterval)
        const nextReviewDate = nextReview.toISOString().slice(0, 10)

        await db.query(
          `INSERT INTO user_exercise_progress
             (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, exercise_id) DO UPDATE
             SET easiness_factor = $3, interval_days = $4, repetitions = $5, next_review_date = $6`,
          [userId, a.exercise_id, newEf, newInterval, newReps, nextReviewDate])

        await db.query(
          `INSERT INTO exercise_attempts (exercise_id, user_id, user_answer, is_correct, quality, attempted_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
          [a.exercise_id, userId, String(a.user_answer || ''), a.quality >= 3, a.quality, a.answered_at || null])
        applied++
      } catch (e) {
        // Упражнение могли удалить, пока ученик был офлайн — пропускаем, не валим весь синк
        fastify.log.warn(`offline sync: ответ на упражнение ${a.exercise_id} не применён: ${e.message}`)
      }
    }
    return { applied, total: answers.length }
  })
}
