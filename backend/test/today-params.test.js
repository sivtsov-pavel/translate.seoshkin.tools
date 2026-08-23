// Сессия «Начать» с карты: /api/exercises/today?lesson_id=…&types=…&shuffle=1
//
// Баг 23.08.2026: кнопка «Начать» на «Пути» не открывала урок — экран моргал и возвращал
// на главную. Сервер отвечал 500: запрос собирается из кусков, и в этом сочетании
// (урок задан + случайный порядок) два последних параметра не попадают в текст —
// ни в условие «пройденных уроков» (его нет, когда урок выбран явно), ни в ORDER BY
// (там RANDOM()). PostgreSQL отвергает Bind, если параметров передано больше,
// чем встречается в запросе: «bind message supplies 7 parameters, but prepared
// statement "" requires 5».
//
// Тест работает на своих временных данных и убирает их за собой (никакого TRUNCATE —
// он снёс бы локальное зеркало прода).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../src/db/index.js'
import { createTestApp, registerAndLogin } from './helpers.js'

describe('GET /api/exercises/today — сборка запроса', () => {
  let app, token, userId, lessonId

  beforeAll(async () => {
    app = await createTestApp()
    const auth = await registerAndLogin(app, 'owner')
    token = auth.token
    userId = auth.user.id

    const { rows: [l] } = await db.query(
      `INSERT INTO lessons (owner_id, title, status, target_lang, lesson_number)
       VALUES ($1, 'Тест сессии с карты', 'done', 'de', 9001) RETURNING id`, [userId])
    lessonId = l.id
    const { rows: [w] } = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
       VALUES ($1, $2, 'das Haus', 'дом') RETURNING id`, [lessonId, userId])
    for (const type of ['flashcard', 'multiple_choice']) {
      await db.query(
        `INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,'{}'::jsonb)`,
        [lessonId, w.id, type])
    }
  })

  afterAll(async () => {
    if (lessonId) await db.query('DELETE FROM lessons WHERE id = $1', [lessonId])
    if (userId) await db.query('DELETE FROM users WHERE id = $1', [userId])
    await app?.close()
  })

  const get = (url) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}`, 'x-target-lang': 'de' } })

  it('урок + типы + случайный порядок («Начать» с карты) — отдаёт упражнения, а не 500', async () => {
    const res = await get(`/api/exercises/today?lesson_id=${lessonId}&types=multiple_choice,flashcard&shuffle=1`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(2)
  })

  it('урок без случайного порядка — тоже работает', async () => {
    const res = await get(`/api/exercises/today?lesson_id=${lessonId}`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).length).toBeGreaterThan(0)
  })

  it('поток без урока со случайным порядком — работает', async () => {
    const res = await get('/api/exercises/today?types=flashcard&shuffle=1')
    expect(res.statusCode).toBe(200)
  })

  it('практика по одному типу — работает', async () => {
    const res = await get('/api/exercises/today?type=flashcard')
    expect(res.statusCode).toBe(200)
  })
})
