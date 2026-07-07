import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData } from './helpers.js'

let app

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await clearTestData() })

describe('POST /api/auth/register', () => {
  it('регистрирует пользователя и возвращает JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'owner@test.com', password: 'Pass1234!', role: 'owner' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.token).toBeTruthy()
    expect(body.user.email).toBe('owner@test.com')
    expect(body.user.role).toBe('owner')
    expect(body.user.password_hash).toBeUndefined()
  })

  it('возвращает 409 при дублирующемся email', async () => {
    const payload = { email: 'dup@test.com', password: 'Pass1234!', role: 'student' }
    await app.inject({ method: 'POST', url: '/api/auth/register', payload })
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload })
    expect(res.statusCode).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  it('возвращает JWT для зарегистрированного пользователя', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user@test.com', password: 'Pass1234!', role: 'student' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@test.com', password: 'Pass1234!' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).token).toBeTruthy()
  })

  it('возвращает 401 при неверном пароле', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user2@test.com', password: 'Pass1234!', role: 'student' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user2@test.com', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })
})
