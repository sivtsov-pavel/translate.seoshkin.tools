import { db } from '../db/index.js'
import { publishCourse, adoptTextbook } from '../services/catalog.js'

// Каталог учебников: список, публикация курса, подключение к своей школе.
export async function catalogRoutes(fastify) {
  // Публичный каталог (любой учитель видит)
  fastify.get('/api/catalog', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const target = request.headers['x-target-lang'] || null
    const { rows } = await db.query(`
      SELECT t.id, t.name, t.publisher, t.level, t.target_lang, t.cover_url,
             COALESCE(u.email,'') AS author,
             (SELECT count(*) FROM lessons l WHERE l.textbook_id=t.id AND l.status='done')::int AS lessons,
             (SELECT count(*) FROM words w JOIN lessons l ON l.id=w.lesson_id WHERE l.textbook_id=t.id)::int AS words
      FROM textbooks t LEFT JOIN users u ON u.id=t.created_by
      WHERE t.is_public=true ${target ? 'AND t.target_lang=$1' : ''}
      ORDER BY t.created_at DESC`, target ? [target] : [])
    return rows
  })

  // Опубликовать свой курс как учебник в каталог
  fastify.post('/api/catalog/publish', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { course_id, publisher, level } = request.body || {}
    if (!course_id) return reply.status(400).send({ error: 'Выберите курс' })
    try {
      const tb = await publishCourse(course_id, request.user.id, { publisher, level })
      return { ok: true, textbook: tb }
    } catch (e) { return reply.status(400).send({ error: e.message }) }
  })

  // Подключить учебник каталога к своей школе (копирует уроки — без затрат OpenAI)
  fastify.post('/api/catalog/:id/adopt', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    try {
      const res = await adoptTextbook(request.params.id, request.user.id, request.user.school_id)
      return { ok: true, ...res }
    } catch (e) { return reply.status(400).send({ error: e.message }) }
  })
}
