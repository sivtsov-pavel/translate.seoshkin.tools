// Новые упражнения в уже пройденных уроках.
//
// Поток «сегодня» намеренно не подаёт нетронутые упражнения пройденных уроков — иначе
// пройденный урок оживал бы целиком. Но у этого правила есть цена: упражнения, добавленные
// В УЖЕ ПРОЙДЕННЫЙ урок позже (склонения, наборы фраз, догенерация), не попадали в поток
// НИКОГДА — увидеть их можно было только зайдя в конкретный урок.
//
// Различаем два случая по времени: урок прячем целиком, только если в нём после последней
// попытки ученика ничего не появилось. Появилось — урок снова подаётся, и новое всплывает
// в общем потоке само.
import { db } from '../db/index.js'

// rows: [{ lesson_id, last_attempt_at, newest_exercise_at }]
export function lessonsToHideUntouched(rows) {
  return (rows || [])
    .filter(r => {
      if (!r.last_attempt_at) return false            // урок не тронут — там всё новое
      if (!r.newest_exercise_at) return true          // упражнений нет — показывать нечего
      return new Date(r.newest_exercise_at) <= new Date(r.last_attempt_at)
    })
    .map(r => r.lesson_id)
}

// Для списка пройденных уроков: когда ученик отвечал последний раз и когда в уроке
// появилось самое свежее упражнение.
export async function fetchLessonFreshness(userId, lessonIds) {
  if (!lessonIds?.length) return []
  const { rows } = await db.query(
    `SELECT l.id AS lesson_id,
            (SELECT max(a.attempted_at) FROM exercise_attempts a
               JOIN exercises e2 ON e2.id = a.exercise_id
              WHERE e2.lesson_id = l.id AND a.user_id = $1) AS last_attempt_at,
            (SELECT max(e3.created_at) FROM exercises e3 WHERE e3.lesson_id = l.id) AS newest_exercise_at
     FROM lessons l WHERE l.id = ANY($2::int[])`,
    [userId, lessonIds])
  return rows
}

// Итог: какие из пройденных уроков прятать в потоке «сегодня».
export async function passedLessonsToHide(userId, passedLessonIds) {
  return lessonsToHideUntouched(await fetchLessonFreshness(userId, passedLessonIds))
}
