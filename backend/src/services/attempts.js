// Запись ответа на упражнение — единственное место в проекте.
//
// Логика вынесена из POST /api/exercises/:id/attempt, чтобы виджет домашнего экрана
// засчитывал ответы ТОЧНО так же, как приложение: SM-2, статус слова, попытка, снятие
// из хвостов. Вторая копия этой цепочки означала бы, что упражнение, сделанное с виджета,
// считается не так, как то же упражнение в приложении — и прогресс разъедется.
import { db } from '../db/index.js'
import { sm2 } from './srs.js'

/**
 * @param {number} userId
 * @param {number} exerciseId
 * @param {string} userAnswer  что человек ответил (для разбора ошибок)
 * @param {number} quality     0..5 по SM-2: у «выбери ответ» это 5 (верно) или 1 (неверно)
 * @returns {{correct: boolean, nextReviewDate: string}}
 */
export async function recordAttempt(userId, exerciseId, userAnswer, quality) {
  // Текущий прогресс пользователя (или дефолт SM-2)
  const { rows: progRows } = await db.query(
    `SELECT * FROM user_exercise_progress WHERE user_id = $1 AND exercise_id = $2`,
    [userId, exerciseId]
  )
  const prog = progRows[0] ?? { easiness_factor: 2.5, interval_days: 0, repetitions: 0 }

  const { newEf, newInterval, newReps } = sm2(
    quality,
    parseFloat(prog.easiness_factor),
    prog.interval_days,
    prog.repetitions
  )

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + newInterval)
  const nextReviewDate = nextReview.toISOString().slice(0, 10)

  await db.query(
    `INSERT INTO user_exercise_progress
       (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, exercise_id) DO UPDATE
       SET easiness_factor = $3, interval_days = $4,
           repetitions = $5, next_review_date = $6`,
    [userId, exerciseId, newEf, newInterval, newReps, nextReviewDate]
  )

  // Per-user статус слова
  const { rows: exRows } = await db.query(
    'SELECT word_id FROM exercises WHERE id = $1', [exerciseId]
  )
  if (exRows[0]?.word_id) {
    const wordStatus = newReps >= 5 ? 'known' : newReps >= 1 ? 'learning' : 'new'
    await db.query(
      `INSERT INTO user_word_status (user_id, word_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, word_id) DO UPDATE SET status = $3`,
      [userId, exRows[0].word_id, wordStatus]
    )
  }

  await db.query(
    `INSERT INTO exercise_attempts (exercise_id, user_id, user_answer, is_correct, quality)
     VALUES ($1, $2, $3, $4, $5)`,
    [exerciseId, userId, userAnswer, quality >= 3, quality]
  )

  // Прошёл упражнение → снимаем его из «хвостов» (если было пропущено)
  await db.query('DELETE FROM exercise_deferrals WHERE user_id=$1 AND exercise_id=$2', [userId, exerciseId])

  return { correct: quality >= 3, nextReviewDate }
}
