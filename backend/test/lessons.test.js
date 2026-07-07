import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'

let app, ownerToken

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await clearTestData()
  const auth = await registerAndLogin(app, 'owner')
  ownerToken = auth.token
})

describe('POST /api/lessons', () => {
  it('создаёт урок для авторизованного owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/lessons',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { title: 'Урок 1: Приветствия', date: '2026-07-08' },
    })
    expect(res.statusCode).toBe(201)
    const lesson = JSON.parse(res.body)
    expect(lesson.id).toBeTruthy()
    expect(lesson.status).toBe('pending')
  })

  it('возвращает 401 без токена', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/lessons', payload: { title: 'test' } })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/lessons', () => {
  it('возвращает список уроков пользователя', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/lessons',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { title: 'Урок 1' },
    })
    const res = await app.inject({
      method: 'GET',
      url: '/api/lessons',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const lessons = JSON.parse(res.body)
    expect(lessons).toHaveLength(1)
  })
})
