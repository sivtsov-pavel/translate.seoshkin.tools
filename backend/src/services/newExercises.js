// Новые упражнения в уже пройденных уроках.
//
// Поток «сегодня» намеренно не подаёт нетронутые упражнения пройденных уроков — иначе
// пройденный урок оживал бы целиком. Цена правила: упражнения, ДОБАВЛЕННЫЕ в уже пройденный
// урок позже (склонения, наборы фраз, догенерация), не попадали в поток никогда — увидеть
// их можно было, только зайдя в конкретный урок.
//
// Сравнивать с «последней попыткой в уроке» нельзя: стоит ученику ответить на любое старое
// упражнение — и метка уходит вперёд, а новое снова прячется. Поэтому ориентир другой:
// самое свежее упражнение, которое ученик В ЭТОМ УРОКЕ уже трогал. Всё, что создано позже
// него и ещё не тронуто, — новое, и его показываем.
import { db } from '../db/index.js'

// rows: [{ id, created_at, last_touched_at }]
export function pickNewExerciseIds(rows) {
  return (rows || [])
    .filter(r => r.created_at && r.last_touched_at && new Date(r.created_at) > new Date(r.last_touched_at))
    .map(r => r.id)
}

// Нетронутые упражнения пройденных уроков вместе с меткой «самое свежее из тронутых в уроке»
export async function fetchUntouchedInPassed(userId, passedLessonIds) {
  if (!passedLessonIds?.length) return []
  const { rows } = await db.query(
    `WITH touched AS (
       SELECT e.lesson_id, max(e.created_at) AS last_touched_at
       FROM exercises e
       JOIN user_exercise_progress u ON u.exercise_id = e.id AND u.user_id = $1
       WHERE e.lesson_id = ANY($2::int[])
       GROUP BY e.lesson_id
     )
     SELECT e.id, e.created_at, t.last_touched_at
     FROM exercises e
     JOIN touched t ON t.lesson_id = e.lesson_id
     LEFT JOIN user_exercise_progress u ON u.exercise_id = e.id AND u.user_id = $1
     WHERE u.exercise_id IS NULL`,
    [userId, passedLessonIds])
  return rows
}

// Итог: id упражнений, которые появились в пройденных уроках уже после работы ученика
// с этими уроками. Их поток «сегодня» показывает, несмотря на общий запрет.
export async function newExerciseIdsInPassedLessons(userId, passedLessonIds) {
  return pickNewExerciseIds(await fetchUntouchedInPassed(userId, passedLessonIds))
}
