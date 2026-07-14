import { db } from '../db/index.js'
import { buildClassGame } from '../services/classGame.js'

// Перевод строки под локаль ученика (fallback: локаль → ru → любой → de-нет)
function pickTr(translations, lang) {
  const t = translations || {}
  return t[lang] || t.ru || t.en || Object.values(t)[0] || null
}

export async function classGamesRoutes(fastify) {
  // Создать игру из урока (учитель) — генерация в фоне
  fastify.post('/api/class-games', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { lesson_id, count, format } = request.body || {}
    if (!lesson_id) return reply.status(400).send({ error: 'lesson_id обязателен' })
    const { rows: l } = await db.query('SELECT title FROM lessons WHERE id=$1', [lesson_id])
    if (!l[0]) return reply.status(404).send({ error: 'Урок не найден' })
    const { rows } = await db.query(
      "INSERT INTO class_games (lesson_id, owner_id, title, format, status) VALUES ($1,$2,$3,$4,'generating') RETURNING id",
      [lesson_id, request.user.id, l[0].title, format === 'qa' ? 'qa' : 'relay'])
    const gameId = rows[0].id
    const n = Math.min(Math.max(parseInt(count) || 30, 5), 60)
    buildClassGame(gameId, lesson_id, n).catch(e => fastify.log.error({ gameId, e }, 'buildClassGame'))
    return { id: gameId, started: true }
  })

  // Статус (polling)
  fastify.get('/api/class-games/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { rows } = await db.query('SELECT id, status, progress FROM class_games WHERE id=$1', [request.params.id])
    if (!rows[0]) return reply.status(404).send({ error: 'not found' })
    return rows[0]
  })

  // Список моих игр: учитель — свои созданные; ученик — где есть его фразы
  fastify.get('/api/class-games', { preHandler: [fastify.authenticate] }, async (request) => {
    if (request.user.role === 'owner') {
      const { rows } = await db.query(
        `SELECT g.*, (SELECT count(*) FROM class_game_lines WHERE game_id=g.id)::int lines
         FROM class_games g WHERE g.owner_id=$1 ORDER BY g.id DESC`, [request.user.id])
      return rows
    }
    const { rows } = await db.query(
      `SELECT DISTINCT g.id, g.title, g.status, g.created_at,
              (SELECT count(*) FROM class_game_lines WHERE game_id=g.id AND assigned_user_id=$1)::int my_lines
       FROM class_games g JOIN class_game_lines cl ON cl.game_id=g.id
       WHERE cl.assigned_user_id=$1 AND g.status='ready' ORDER BY g.id DESC`, [request.user.id])
    return rows
  })

  // Одна игра: учитель — все фразы по ученикам; ученик — только свои
  fastify.get('/api/class-games/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const lang = request.query.lang || 'ru'
    const { rows: g } = await db.query('SELECT * FROM class_games WHERE id=$1', [request.params.id])
    if (!g[0]) return reply.status(404).send({ error: 'not found' })
    const isOwner = request.user.role === 'owner'
    const where = isOwner ? '' : ' AND cl.assigned_user_id=$2'
    const params = isOwner ? [request.params.id] : [request.params.id, request.user.id]
    const { rows: lines } = await db.query(
      `SELECT cl.id, cl.ord, cl.sentence_de, cl.translations, cl.role, cl.assigned_user_id, cl.read_at,
              u.full_name, u.email
       FROM class_game_lines cl LEFT JOIN users u ON u.id=cl.assigned_user_id
       WHERE cl.game_id=$1${where} ORDER BY cl.ord`, params)
    return {
      game: g[0],
      lines: lines.map(l => ({
        id: l.id, ord: l.ord, role: l.role, read: !!l.read_at,
        de: l.sentence_de,
        tr: pickTr(l.translations, lang),
        translations: isOwner ? undefined : l.translations,
        student: isOwner ? (l.full_name || l.email?.split('@')[0] || '—') : undefined,
        student_id: isOwner ? l.assigned_user_id : undefined,
      })),
    }
  })

  // Отметить «прочитал» (ученик — свою; учитель — любую)
  fastify.post('/api/class-games/:id/lines/:lid/read', { preHandler: [fastify.authenticate] }, async (request) => {
    const cond = request.user.role === 'owner' ? '' : ' AND assigned_user_id=$2'
    const params = request.user.role === 'owner' ? [request.params.lid] : [request.params.lid, request.user.id]
    await db.query(`UPDATE class_game_lines SET read_at=now() WHERE id=$1${cond}`, params)
    return { ok: true }
  })

  // Сохранить свои фразы в разговорник (на языке ученика)
  fastify.post('/api/class-games/:id/to-phrasebook', { preHandler: [fastify.authenticate] }, async (request) => {
    const lang = request.body?.lang || 'ru'
    const { rows: lines } = await db.query(
      'SELECT sentence_de, translations FROM class_game_lines WHERE game_id=$1 AND assigned_user_id=$2',
      [request.params.id, request.user.id])
    const { rows: g } = await db.query('SELECT title FROM class_games WHERE id=$1', [request.params.id])
    const cat = g[0]?.title ? `🎮 ${g[0].title}` : '🎮 Игра класса'
    let saved = 0
    for (const l of lines) {
      const tr = pickTr(l.translations, lang) || ''
      const dup = await db.query('SELECT id FROM phrasebook WHERE user_id=$1 AND LOWER(de)=LOWER($2)', [request.user.id, l.sentence_de])
      if (dup.rows.length) continue
      await db.query(
        'INSERT INTO phrasebook (user_id, de, ru, category, source) VALUES ($1,$2,$3,$4,$5)',
        [request.user.id, l.sentence_de, tr, cat, 'game'])
      saved++
    }
    return { ok: true, saved }
  })
}
