// Правило «урок пройден» (LESSON_PASSED_HAVING) — то самое, по которому открывается
// следующий урок в дрипе, зеленеет узел на «Пути» и считается прогресс курса.
//
// Баг от 22.08.2026 (урок 19 → 20): Павел прошёл ВСЕ карточки и ВСЕ «выбери ответ»,
// а урок не закрылся. Виновата была запись «ich bin dreißig.» — у неё нет ни карточки,
// ни «выбери ответ», только диктант и речь. Старое правило требовало, чтобы КАЖДОЕ
// слово урока было отработано хоть чем-нибудь, и через эту запись втягивало диктант,
// который сам же комментарий правила из минимума исключает.
//
// Тесты работают на своих временных данных и убирают их за собой: clearTestData()
// здесь НЕ используем — он делает TRUNCATE и снёс бы локальное зеркало прода.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../src/db/index.js'
import { LESSON_PASSED_HAVING } from '../src/services/drip.js'

// Проверка ровно тем же SQL, каким пользуются дрип, «Путь» и дашборд
async function isPassed(userId, lessonId) {
  const { rows } = await db.query(
    `SELECT e.lesson_id FROM exercises e
     LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
     WHERE e.lesson_id = $2
     GROUP BY e.lesson_id HAVING ${LESSON_PASSED_HAVING}`,
    [userId, lessonId])
  return rows.length > 0
}

// Отметить упражнение пройденным
const markDone = (userId, exerciseId) =>
  db.query(`INSERT INTO user_exercise_progress (user_id, exercise_id) VALUES ($1, $2)
            ON CONFLICT DO NOTHING`, [userId, exerciseId])

describe('Правило «урок пройден»', () => {
  let userId, lessonId
  const ex = {} // ключ → id упражнения

  beforeAll(async () => {
    const { rows: [u] } = await db.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'student') RETURNING id`,
      [`test_lesson_passed_${Date.now()}@example.com`])
    userId = u.id

    const { rows: [l] } = await db.query(
      `INSERT INTO lessons (owner_id, title, status, target_lang)
       VALUES ($1, 'Тест правила закрытия урока', 'done', 'de') RETURNING id`, [userId])
    lessonId = l.id

    // Слово A — полный набор: карточка + «выбери ответ»
    const { rows: [wa] } = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
       VALUES ($1, $2, 'das Haus', 'дом') RETURNING id`, [lessonId, userId])
    // Слово B — как «ich bin dreißig.»: только диктант и речь, карточки нет
    const { rows: [wb] } = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
       VALUES ($1, $2, 'ich bin dreißig.', 'мне тридцать') RETURNING id`, [lessonId, userId])

    const add = async (key, wordId, type) => {
      const { rows: [e] } = await db.query(
        `INSERT INTO exercises (lesson_id, word_id, type, payload)
         VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id`, [lessonId, wordId, type])
      ex[key] = e.id
    }
    await add('a_flash', wa.id, 'flashcard')
    await add('a_mc', wa.id, 'multiple_choice')
    await add('b_dictation', wb.id, 'dictation')
    await add('b_speech', wb.id, 'speech')
  })

  afterAll(async () => {
    // Урок и пользователь тянут за собой слова, упражнения и прогресс (ON DELETE CASCADE)
    if (lessonId) await db.query('DELETE FROM lessons WHERE id = $1', [lessonId])
    if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId])
  })

  it('ничего не пройдено — урок не закрыт', async () => {
    expect(await isPassed(userId, lessonId)).toBe(false)
  })

  it('пройдена только карточка — урок не закрыт (нужен ещё «выбери ответ»)', async () => {
    await markDone(userId, ex.a_flash)
    expect(await isPassed(userId, lessonId)).toBe(false)
  })

  it('карточка и «выбери ответ» пройдены — урок закрыт, диктант не обязателен', async () => {
    await markDone(userId, ex.a_mc)
    expect(await isPassed(userId, lessonId)).toBe(true)
  })

  it('урок вообще без карточек и «выбери ответ» не закрывается сам собой', async () => {
    const { rows: [l2] } = await db.query(
      `INSERT INTO lessons (owner_id, title, status, target_lang)
       VALUES ($1, 'Тест: урок из одних диктантов', 'done', 'de') RETURNING id`, [userId])
    const { rows: [w] } = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
       VALUES ($1, $2, 'nur Diktat', 'только диктант') RETURNING id`, [l2.id, userId])
    const { rows: [e] } = await db.query(
      `INSERT INTO exercises (lesson_id, word_id, type, payload)
       VALUES ($1, $2, 'dictation', '{}'::jsonb) RETURNING id`, [l2.id, w.id])
    await markDone(userId, e.id)

    const passed = await isPassed(userId, l2.id)
    await db.query('DELETE FROM lessons WHERE id = $1', [l2.id])
    expect(passed).toBe(false)
  })
})
