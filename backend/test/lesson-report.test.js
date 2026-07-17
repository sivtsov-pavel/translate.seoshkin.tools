import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'
import { db } from '../src/db/index.js'

let app, ownerToken, ownerId, lessonId, stuckStudentId, freshStudentId

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })

beforeEach(async () => {
  await clearTestData()

  // Учитель
  const owner = await registerAndLogin(app, 'owner')
  ownerToken = owner.token
  ownerId = owner.user.id

  // Школа + привязка учителя и двух учеников к ней (детерминированно, без опоры на авто-создание)
  const { rows: sch } = await db.query(
    `INSERT INTO schools (name) VALUES ('Test School') RETURNING id`)
  const schoolId = sch[0].id
  await db.query('UPDATE users SET school_id = $1 WHERE id = $2', [schoolId, ownerId])

  const stuck = await registerAndLogin(app, 'student')
  stuckStudentId = stuck.user.id
  const fresh = await registerAndLogin(app, 'student')
  freshStudentId = fresh.user.id
  await db.query('UPDATE users SET school_id = $1 WHERE id = ANY($2::int[])',
    [schoolId, [stuckStudentId, freshStudentId]])

  // Урок учителя (school_id явно) + слово + упражнение
  const { rows: les } = await db.query(
    `INSERT INTO lessons (owner_id, school_id, title, status, target_lang)
     VALUES ($1, $2, 'Урок 1: Тест', 'done', 'de') RETURNING id`, [ownerId, schoolId])
  lessonId = les[0].id
  const { rows: wrd } = await db.query(
    `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
     VALUES ($1, $2, 'der Tisch', 'стол') RETURNING id`, [lessonId, ownerId])
  const wordId = wrd[0].id
  const { rows: ex } = await db.query(
    `INSERT INTO exercises (lesson_id, word_id, type, payload)
     VALUES ($1, $2, 'flashcard', '{}'::jsonb) RETURNING id`, [lessonId, wordId])
  const exId = ex[0].id

  // Завязший ученик: 4 попытки, 3 неверных (att>=3, wrong/att=0.75 -> stuck)
  for (const ok of [false, false, false, true]) {
    await db.query(
      `INSERT INTO exercise_attempts (exercise_id, user_id, is_correct) VALUES ($1, $2, $3)`,
      [exId, stuckStudentId, ok])
  }
  // freshStudent — без попыток (должен попасть в notStarted)
})

describe('GET /api/analytics/lesson/:lessonId', () => {
  it('owner получает отчёт: группа буксует на слове, ученик завис, второй — не приступил', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/${lessonId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const r = JSON.parse(res.body)

    expect(r.lesson.id).toBe(lessonId)
    expect(r.totals.students_touched).toBe(1)
    expect(r.totals.students_total).toBe(2)

    // Блок А
    const hw = r.group.hardWords.find(w => w.word_de === 'der Tisch')
    expect(hw).toBeTruthy()
    expect(hw.wrong_pct).toBe(75)
    expect(hw.students_stuck).toBe(1)
    expect(r.group.byType.find(t => t.type === 'flashcard').attempts).toBe(4)

    // Блок Б
    const st = r.students.find(s => s.id === stuckStudentId)
    expect(st.attempts).toBe(4)
    expect(st.accuracy).toBe(25)
    expect(st.stuck_words).toBe(1)
    expect(st.stuck_list[0].word_de).toBe('der Tisch')

    // Не приступил
    expect(r.notStarted.map(s => s.id)).toContain(freshStudentId)
    expect(r.notStarted.map(s => s.id)).not.toContain(stuckStudentId)
  })

  it('ученику — 403', async () => {
    const student = await registerAndLogin(app, 'student')
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/${lessonId}`,
      headers: { authorization: `Bearer ${student.token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('чужой/несуществующий урок — 404', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/999999`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('урок ДРУГОГО владельца (не 999999, реально существующий) — 404, не утечка между арендаторами', async () => {
    const otherOwner = await registerAndLogin(app, 'owner')
    const { rows: otherSch } = await db.query(
      `INSERT INTO schools (name) VALUES ('Other School') RETURNING id`)
    const otherSchoolId = otherSch[0].id
    await db.query('UPDATE users SET school_id = $1 WHERE id = $2', [otherSchoolId, otherOwner.user.id])
    const { rows: otherLes } = await db.query(
      `INSERT INTO lessons (owner_id, school_id, title, status, target_lang)
       VALUES ($1, $2, 'Чужой урок', 'done', 'de') RETURNING id`, [otherOwner.user.id, otherSchoolId])
    const otherLessonId = otherLes[0].id

    // Первый owner запрашивает урок второго owner-а своим токеном
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/${otherLessonId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('граница формулы «завис»: attempts<3 не считается, ровно 0.5 считается, чуть ниже 0.5 — нет', async () => {
    // Три доп. слова + три доп. ученика, каждый со своим граничным случаем
    const belowThreshold = await registerAndLogin(app, 'student') // 2 попытки, 2 неверных -> att<3 -> НЕ завис
    const almostStuck = await registerAndLogin(app, 'student')    // 5 попыток, 2 неверных (0.4) -> НЕ завис
    const exactlyStuck = await registerAndLogin(app, 'student')   // 4 попытки, 2 неверных (0.5) -> ЗАВИС (граница)

    async function makeWordWithAttempts(wordDe, userId, results) {
      const { rows: w } = await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
         VALUES ($1, $2, $3, 'тест') RETURNING id`, [lessonId, ownerId, wordDe])
      const { rows: e } = await db.query(
        `INSERT INTO exercises (lesson_id, word_id, type, payload)
         VALUES ($1, $2, 'flashcard', '{}'::jsonb) RETURNING id`, [lessonId, w[0].id])
      for (const ok of results) {
        await db.query(
          `INSERT INTO exercise_attempts (exercise_id, user_id, is_correct) VALUES ($1, $2, $3)`,
          [e[0].id, userId, ok])
      }
    }

    await makeWordWithAttempts('das Buch', belowThreshold.user.id, [false, false])
    await makeWordWithAttempts('die Katze', almostStuck.user.id, [false, false, true, true, true])
    await makeWordWithAttempts('der Hund', exactlyStuck.user.id, [false, false, true, true])

    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/${lessonId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const r = JSON.parse(res.body)

    // Ученик с attempts < 3 — не завис, несмотря на 100% ошибок
    const sBelow = r.students.find(s => s.id === belowThreshold.user.id)
    expect(sBelow.attempts).toBe(2)
    expect(sBelow.stuck_words).toBe(0)
    expect(sBelow.stuck_list.map(w => w.word_de)).not.toContain('das Buch')

    // Ученик с wrong/attempts чуть ниже 0.5 (0.4) — не завис
    const sAlmost = r.students.find(s => s.id === almostStuck.user.id)
    expect(sAlmost.attempts).toBe(5)
    expect(sAlmost.stuck_words).toBe(0)
    expect(sAlmost.stuck_list.map(w => w.word_de)).not.toContain('die Katze')

    // Ученик с wrong/attempts ровно 0.5 — завис (граница >= включительно)
    const sExact = r.students.find(s => s.id === exactlyStuck.user.id)
    expect(sExact.attempts).toBe(4)
    expect(sExact.stuck_words).toBe(1)
    expect(sExact.stuck_list.map(w => w.word_de)).toContain('der Hund')

    // На уровне группы: у слова 'der Hund' students_stuck должен учесть завязшего ученика
    const hwHund = r.group.hardWords.find(w => w.word_de === 'der Hund')
    expect(hwHund).toBeTruthy()
    expect(hwHund.students_stuck).toBe(1)

    // У слова 'die Katze' (0.4 < 0.5) никто не завис
    const hwKatze = r.group.hardWords.find(w => w.word_de === 'die Katze')
    expect(hwKatze).toBeTruthy()
    expect(hwKatze.students_stuck).toBe(0)
  })
})
