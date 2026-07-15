import { db } from '../db/index.js'
import { randomBytes } from 'crypto'

// Классы внутри школы (мультиарендность SaaS). Учитель/школа-админ создаёт классы,
// ученик присоединяется по коду-приглашению. Scoping — по school_id из auth-контекста.
function genCode() { return randomBytes(4).toString('hex').toUpperCase() } // 8 hex-символов

export async function classesRoutes(fastify) {
  // Список классов моей школы (учителю)
  fastify.get('/api/classes', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const schoolId = request.user.school_id
    if (!schoolId) return []
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.invite_code, c.created_at,
              (SELECT count(*) FROM class_members m WHERE m.class_id=c.id AND m.role='student')::int AS students
       FROM classes c WHERE c.school_id=$1 ORDER BY c.id`, [schoolId])
    return rows
  })

  // Создать класс (с уникальным кодом-приглашением)
  fastify.post('/api/classes', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const schoolId = request.user.school_id
    if (!schoolId) return reply.status(400).send({ error: 'У вас нет школы' })
    const name = (request.body?.name || '').trim() || 'Новый класс'
    let code
    for (let i = 0; i < 5; i++) {
      code = genCode()
      const { rows } = await db.query('SELECT 1 FROM classes WHERE invite_code=$1', [code])
      if (!rows.length) break
    }
    const { rows } = await db.query(
      'INSERT INTO classes (school_id, name, invite_code) VALUES ($1,$2,$3) RETURNING id, name, invite_code', [schoolId, name, code])
    await db.query('INSERT INTO class_members (class_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [rows[0].id, request.user.id, 'teacher'])
    return reply.status(201).send(rows[0])
  })

  // Класс + состав (только своей школы)
  fastify.get('/api/classes/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { rows: cr } = await db.query('SELECT id, school_id, name, invite_code FROM classes WHERE id=$1', [request.params.id])
    const c = cr[0]
    if (!c) return reply.status(404).send({ error: 'Класс не найден' })
    if (!request.user.is_superadmin && c.school_id !== request.user.school_id) return reply.status(403).send({ error: 'Чужая школа' })
    const { rows: members } = await db.query(
      `SELECT u.id, COALESCE(u.full_name, u.email) AS name, m.role
       FROM class_members m JOIN users u ON u.id=m.user_id WHERE m.class_id=$1 ORDER BY m.role, name`, [request.params.id])
    return { ...c, members }
  })

  // Ученик присоединяется по коду-приглашению
  fastify.post('/api/classes/join', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const code = (request.body?.code || '').trim().toUpperCase()
    if (!code) return reply.status(400).send({ error: 'Введите код класса' })
    const { rows } = await db.query('SELECT id, school_id, name FROM classes WHERE invite_code=$1', [code])
    const c = rows[0]
    if (!c) return reply.status(404).send({ error: 'Класс по такому коду не найден' })
    await db.query('INSERT INTO class_members (class_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (class_id, user_id) DO NOTHING',
      [c.id, request.user.id, 'student'])
    // Привязываем ученика к школе класса, если он ещё без школы
    await db.query('UPDATE users SET school_id=COALESCE(school_id,$1) WHERE id=$2', [c.school_id, request.user.id])
    return { ok: true, class: { id: c.id, name: c.name } }
  })

  // Убрать ученика из класса (учителю своей школы)
  fastify.delete('/api/classes/:id/members/:userId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { rows: cr } = await db.query('SELECT school_id FROM classes WHERE id=$1', [request.params.id])
    if (!cr[0]) return reply.status(404).send({ error: 'Класс не найден' })
    if (!request.user.is_superadmin && cr[0].school_id !== request.user.school_id) return reply.status(403).send({ error: 'Чужая школа' })
    await db.query('DELETE FROM class_members WHERE class_id=$1 AND user_id=$2', [request.params.id, request.params.userId])
    return { ok: true }
  })
}
