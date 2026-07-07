import { db } from '../src/db/index.js'

// Создаём тестовый инстанс Fastify
export async function createTestApp() {
  const { buildApp } = await import('../src/index.js')
  const app = await buildApp()
  await app.ready()
  return app
}

// Очистка тестовых данных между тестами
export async function clearTestData() {
  await db.query(
    'TRUNCATE exercise_attempts, exercises, grammar_points, words, lesson_media, lessons, users RESTART IDENTITY CASCADE'
  )
}

// Регистрация тестового пользователя и возврат JWT токена
export async function registerAndLogin(app, role = 'owner') {
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
  const password = 'TestPass123!'

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password, role },
  })

  const { token, user } = JSON.parse(regRes.body)
  return { token, user, email, password }
}
