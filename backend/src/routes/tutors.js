import { db } from '../db/index.js'

// Координаты городов для меток на карте (расширяемо)
const CITY_COORDS = {
  'Мюнхен': [48.137, 11.575], 'Гамбург': [53.551, 9.993], 'Берлин': [52.520, 13.405],
  'Франкфурт': [50.110, 8.682], 'Кёльн': [50.937, 6.960], 'Вена': [48.208, 16.373], 'Цюрих': [47.377, 8.541],
  'Штутгарт': [48.775, 9.183], 'Дюссельдорф': [51.228, 6.773], 'Лейпциг': [51.340, 12.375], 'Дрезден': [51.050, 13.737],
}

export async function tutorsRoutes(fastify) {
  // Публичный список (для авторизованных) — опубликованные анкеты
  fastify.get('/api/tutors', { preHandler: [fastify.authenticate] }, async () => {
    const { rows } = await db.query('SELECT * FROM tutors WHERE published = true ORDER BY verified DESC, rating DESC, reviews DESC')
    return rows
  })

  // Своя анкета
  fastify.get('/api/tutors/mine', { preHandler: [fastify.authenticate] }, async (request) => {
    const { rows } = await db.query('SELECT * FROM tutors WHERE user_id = $1', [request.user.id])
    return rows[0] || null
  })

  // Создать/обновить свою анкету
  fastify.post('/api/tutors', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2 },
          type: { type: 'string' },
          avatar_url: { type: ['string', 'null'] },
          langs: { type: 'array' }, levels: { type: 'array' }, audience: { type: 'array' },
          country: { type: ['string', 'null'] }, city: { type: ['string', 'null'] }, district: { type: ['string', 'null'] },
          format: { type: 'string' }, price: { type: 'integer' }, experience: { type: 'integer' },
          about: { type: ['string', 'null'] }, contact: { type: ['string', 'null'] },
        },
      },
    },
  }, async (request) => {
    const b = request.body
    const coords = (b.city && CITY_COORDS[b.city]) || [null, null]
    const { rows } = await db.query(
      `INSERT INTO tutors (user_id, name, type, avatar_url, langs, levels, country, city, district, lat, lng, format, price, experience, audience, about, contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (user_id) DO UPDATE SET
         name=EXCLUDED.name, type=EXCLUDED.type, avatar_url=EXCLUDED.avatar_url, langs=EXCLUDED.langs, levels=EXCLUDED.levels,
         country=EXCLUDED.country, city=EXCLUDED.city, district=EXCLUDED.district, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
         format=EXCLUDED.format, price=EXCLUDED.price, experience=EXCLUDED.experience, audience=EXCLUDED.audience,
         about=EXCLUDED.about, contact=EXCLUDED.contact
       RETURNING *`,
      [request.user.id, b.name, b.type || 'Репетитор', b.avatar_url || null,
       JSON.stringify(b.langs || ['Немецкий']), JSON.stringify(b.levels || []),
       b.country || null, b.city || null, b.district || null, coords[0], coords[1],
       b.format || 'Онлайн', b.price || 0, b.experience || 0, JSON.stringify(b.audience || []),
       b.about || null, b.contact || null])
    return rows[0]
  })

  // Удалить свою анкету
  fastify.delete('/api/tutors/mine', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    await db.query('DELETE FROM tutors WHERE user_id = $1', [request.user.id])
    return reply.status(204).send()
  })
}
