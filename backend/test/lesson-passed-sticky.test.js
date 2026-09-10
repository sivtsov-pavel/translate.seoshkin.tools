// «Однажды пройден — пройден»: пополнение урока не отнимает пройденное.
//
// Баг от 10.09.2026. Догенерация недостающих упражнений добавила по паре карточек в девять
// УЖЕ ПРОЙДЕННЫХ уроков — и все девять разом стали непройденными: карта закрылась на
// четвёртом уроке, виджет показал «47 из 48». Причина в том, что «пройден» вычислялся
// каждый раз заново из ТЕКУЩЕГО набора упражнений, а набор пополнился.
//
// Это не частный случай: кнопка «Обслуживание → Догенерация» в админке делает ровно то же
// самое, и один её нажим схлопнул бы прогресс всему классу. Поэтому факт прохождения
// фиксируется в user_lesson_passed (миграция 074) и вниз не пересчитывается.
//
// Тесты работают на своих временных данных и убирают их за собой: clearTestData()
// здесь НЕ используем — он делает TRUNCATE и снёс бы локальное зеркало прода.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../src/db/index.js'
import { LESSON_PASSED_HAVING, markLessonPassed, fixedPassedLessons } from '../src/services/drip.js'

// Расчёт «в лоб», как его делают дрип, «Путь» и дашборд
async function passedByRule(userId, lessonId) {
  const { rows } = await db.query(
    `SELECT e.lesson_id FROM exercises e
     LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
     WHERE e.lesson_id = $2
     GROUP BY e.lesson_id HAVING ${LESSON_PASSED_HAVING}`,
    [userId, lessonId])
  return rows.length > 0
}

const markDone = (userId, exerciseId) =>
  db.query(`INSERT INTO user_exercise_progress (user_id, exercise_id) VALUES ($1, $2)
            ON CONFLICT DO NOTHING`, [userId, exerciseId])

const addExercise = async (lessonId, wordId, type) => {
  const { rows: [e] } = await db.query(
    `INSERT INTO exercises (lesson_id, word_id, type, payload)
     VALUES ($1, $2, $3, '{}'::jsonb) RETURNING id`, [lessonId, wordId, type])
  return e.id
}

describe('Пополнение урока не отнимает пройденное', () => {
  let userId, lessonId, wordA

  beforeAll(async () => {
    const { rows: [u] } = await db.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'student') RETURNING id`,
      [`test_sticky_${Date.now()}@example.com`])
    userId = u.id

    const { rows: [l] } = await db.query(
      `INSERT INTO lessons (owner_id, title, status, target_lang)
       VALUES ($1, 'Тест: однажды пройден', 'done', 'de') RETURNING id`, [userId])
    lessonId = l.id

    const { rows: [w] } = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
       VALUES ($1, $2, 'das Haus', 'дом') RETURNING id`, [lessonId, userId])
    wordA = w.id

    // Урок из одного слова с полным обязательным набором — и оба сделаны
    await markDone(userId, await addExercise(lessonId, wordA, 'flashcard'))
    await markDone(userId, await addExercise(lessonId, wordA, 'multiple_choice'))
  })

  afterAll(async () => {
    if (lessonId) await db.query('DELETE FROM lessons WHERE id = $1', [lessonId])
    if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId])
  })

  it('урок пройден по правилу и факт фиксируется', async () => {
    expect(await passedByRule(userId, lessonId)).toBe(true)
    expect(await markLessonPassed(userId, lessonId)).toBe(true)
    expect((await fixedPassedLessons(userId)).has(lessonId)).toBe(true)
  })

  it('в урок добавили новое слово с обязательными типами — правило перестаёт выполняться', async () => {
    const { rows: [w2] } = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
       VALUES ($1, $2, 'der Tisch', 'стол') RETURNING id`, [lessonId, userId])
    await addExercise(lessonId, w2.id, 'flashcard')
    await addExercise(lessonId, w2.id, 'multiple_choice')

    // Именно это и случилось 10.09.2026: расчёт «в лоб» откатывает урок в непройденные
    expect(await passedByRule(userId, lessonId)).toBe(false)
  })

  it('но зафиксированный факт остаётся — прогресс не отнят', async () => {
    expect((await fixedPassedLessons(userId)).has(lessonId)).toBe(true)
  })

  it('повторная фиксация не срабатывает, пока правило не выполнено снова', async () => {
    expect(await markLessonPassed(userId, lessonId)).toBe(false)
    // и отметку это не стирает — отнимать заслуженное нельзя ни при каких условиях
    expect((await fixedPassedLessons(userId)).has(lessonId)).toBe(true)
  })

  it('полный сброс курса снимает отметку — иначе урок был бы пройден вечно', async () => {
    await db.query('DELETE FROM user_lesson_passed WHERE user_id = $1', [userId])
    expect((await fixedPassedLessons(userId)).has(lessonId)).toBe(false)
  })
})
