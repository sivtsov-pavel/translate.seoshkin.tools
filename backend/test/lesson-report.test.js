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
})
