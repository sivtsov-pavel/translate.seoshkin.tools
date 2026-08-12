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

// Нетронутые упражнения тех уроков, где ученик уже работал, с меткой «самое свежее
// из тронутых в этом уроке». Берём по всем урокам целевого языка, а не только по
// пройденным: новое должно всплывать и в уроке, начатом наполовину.
export async function fetchUntouchedWithTouchMark(userId, targetLang = 'de') {
  const { rows } = await db.query(
    `WITH touched AS (
       SELECT e.lesson_id, max(e.created_at) AS last_touched_at
       FROM exercises e
       JOIN user_exercise_progress u ON u.exercise_id = e.id AND u.user_id = $1
       JOIN lessons l ON l.id = e.lesson_id
       WHERE l.target_lang = $2
       GROUP BY e.lesson_id
     )
     SELECT e.id, e.created_at, t.last_touched_at
     FROM exercises e
     JOIN touched t ON t.lesson_id = e.lesson_id
     LEFT JOIN user_exercise_progress u ON u.exercise_id = e.id AND u.user_id = $1
     WHERE u.exercise_id IS NULL`,
    [userId, targetLang])
  return rows
}

// Итог: id упражнений, появившихся в уроках уже после того, как ученик с ними работал.
// Поток «сегодня» показывает их вопреки общему запрету и ставит В НАЧАЛО очереди —
// иначе пять склонений тонут среди сотен упражнений урока и при дневном лимите
// ученик до них просто не доходит.
export async function newExerciseIds(userId, targetLang = 'de') {
  return pickNewExerciseIds(await fetchUntouchedWithTouchMark(userId, targetLang))
}
