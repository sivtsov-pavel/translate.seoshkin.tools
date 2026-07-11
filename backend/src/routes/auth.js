import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'

export async function authRoutes(fastify) {
  // Регистрация нового пользователя
  // Только эти email могут быть учителями
  const OWNER_EMAILS = new Set(['teacher@seoshkin.tools', 'teacherseo@seoshkin.tools', 'sivtsov.pavel@gmail.com'])

  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body
    const role = OWNER_EMAILS.has(email.toLowerCase()) ? 'owner' : 'student'

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Email уже зарегистрирован' })
    }

    const password_hash = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, password_hash, role]
    )
    const user = rows[0]
    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })

    return reply.status(201).send({ token, user })
  })

  // Вход по email/паролю
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body

    const { rows } = await db.query(
      'SELECT id, email, role, password_hash FROM users WHERE email = $1',
      [email]
    )
    if (rows.length === 0) {
      return reply.status(401).send({ error: 'Неверный email или пароль' })
    }

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'Неверный email или пароль' })
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
  })

  // Получить текущего пользователя (с полями профиля)
  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { rows } = await db.query(
      'SELECT id, email, role, avatar, phone, telegram, whatsapp, profession, full_name FROM users WHERE id = $1',
      [request.user.id]
    )
    return rows[0] ?? request.user
  })

  // Обновить свой профиль
  fastify.put('/api/profile', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          full_name:  { type: 'string', maxLength: 100 },
          avatar:     { type: 'string', maxLength: 10 },
          phone:      { type: 'string', maxLength: 30 },
          telegram:   { type: 'string', maxLength: 60 },
          whatsapp:   { type: 'string', maxLength: 30 },
          profession: { type: 'string', maxLength: 100 },
          password:   { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { password, ...fields } = request.body
    const allowed = ['full_name', 'avatar', 'phone', 'telegram', 'whatsapp', 'profession']
    const keys = Object.keys(fields).filter(k => allowed.includes(k))

    if (keys.length > 0) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
      await db.query(
        `UPDATE users SET ${sets} WHERE id = $1`,
        [request.user.id, ...keys.map(k => fields[k])]
      )
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10)
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, request.user.id])
    }

    const { rows } = await db.query(
      'SELECT id, email, role, avatar, phone, telegram, whatsapp, profession, full_name FROM users WHERE id = $1',
      [request.user.id]
    )
    return rows[0]
  })
}
