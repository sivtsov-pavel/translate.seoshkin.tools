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
    'TRUNCATE exercise_attempts, exercises, grammar_points, words, lesson_media, lessons, courses, users RESTART IDENTITY CASCADE'
  )
}

// Регистрация тестового пользователя и возврат JWT токена.
// /api/auth/register игнорирует role из payload (роль owner даёт только
// захардкоженный вайтлист email в auth.js — намеренно, самому назначить
// owner при регистрации нельзя). Для тестов роль после регистрации
// проставляем напрямую в БД и логинимся заново — токен login выдаётся по
// свежей роли из БД (см. auth.js: login делает SELECT role перед sign()).
export async function registerAndLogin(app, role = 'owner') {
  const email = `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`
  const password = 'TestPass123!'

  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password, role },
  })
  const registered = JSON.parse(regRes.body)

  if (registered.user.role !== role) {
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, registered.user.id])
  }

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  })
  const { token, user } = JSON.parse(loginRes.body)
  return { token, user, email, password }
}
