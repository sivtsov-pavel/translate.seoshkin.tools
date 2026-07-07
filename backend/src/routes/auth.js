import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'

export async function authRoutes(fastify) {
  // Регистрация нового пользователя
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role:     { type: 'string', enum: ['owner', 'student'], default: 'student' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, role = 'student' } = request.body

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

  // Получить текущего пользователя
  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    return request.user
  })
}
