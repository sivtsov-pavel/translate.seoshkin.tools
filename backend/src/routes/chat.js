import { db } from '../db/index.js'
import { sendNewMessageEmail } from '../services/email.js'
import { sendTelegramNotification } from '../services/telegram.js'

export async function chatRoutes(fastify) {

  // ─── Получить список бесед текущего пользователя ───
  fastify.get('/api/chat/conversations', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const role   = request.user.role

    // owner видит все беседы; student — только свои
    const { rows } = role === 'owner'
      ? await db.query(`
          SELECT c.id, c.type, c.created_at, c.updated_at,
                 u.name AS student_name,
                 (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id != $1) AS unread
          FROM chat_conversations c
          JOIN users u ON u.id = c.student_id
          ORDER BY c.updated_at DESC
        `, [userId])
      : await db.query(`
          SELECT c.id, c.type, c.created_at, c.updated_at,
                 (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_id != $1) AS unread
          FROM chat_conversations c
          WHERE c.student_id = $1
          ORDER BY c.updated_at DESC
        `, [userId])

    return rows
  })

  // ─── Начать новую беседу (или вернуть существующую) ───
  fastify.post('/api/chat/conversations', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { type = 'support' } = request.body
    const userId = request.user.id

    if (!['support', 'teacher'].includes(type)) {
      return reply.status(400).send({ error: 'type должен быть support или teacher' })
    }

    // Возвращаем существующую беседу того же типа, если есть
    const existing = await db.query(
      'SELECT id FROM chat_conversations WHERE student_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1',
      [userId, type]
    )
    if (existing.rows.length) return existing.rows[0]

    const { rows } = await db.query(
      'INSERT INTO chat_conversations (student_id, type) VALUES ($1, $2) RETURNING id, type, created_at, updated_at',
      [userId, type]
    )
    return reply.status(201).send(rows[0])
  })

  // ─── Получить сообщения беседы ───
  fastify.get('/api/chat/conversations/:id/messages', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const convId = parseInt(request.params.id)
    const userId = request.user.id
    const role   = request.user.role

    const conv = await db.query('SELECT * FROM chat_conversations WHERE id = $1', [convId])
    if (!conv.rows.length) return reply.status(404).send({ error: 'Беседа не найдена' })
    if (role !== 'owner' && conv.rows[0].student_id !== userId) {
      return reply.status(403).send({ error: 'Нет доступа' })
    }

    const { rows } = await db.query(`
      SELECT m.id, m.body, m.read_at, m.created_at,
             m.sender_id, u.name AS sender_name, u.role AS sender_role
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [convId])

    // Отмечаем все входящие как прочитанные
    await db.query(
      'UPDATE chat_messages SET read_at = NOW() WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL',
      [convId, userId]
    )

    return rows
  })

  // ─── Отправить сообщение ───
  fastify.post('/api/chat/conversations/:id/messages', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const convId = parseInt(request.params.id)
    const userId = request.user.id
    const role   = request.user.role
    const { body } = request.body

    if (!body?.trim()) return reply.status(400).send({ error: 'body обязателен' })

    const conv = await db.query('SELECT * FROM chat_conversations WHERE id = $1', [convId])
    if (!conv.rows.length) return reply.status(404).send({ error: 'Беседа не найдена' })
    if (role !== 'owner' && conv.rows[0].student_id !== userId) {
      return reply.status(403).send({ error: 'Нет доступа' })
    }

    const { rows } = await db.query(`
      INSERT INTO chat_messages (conversation_id, sender_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, body, read_at, created_at, sender_id
    `, [convId, userId, body.trim()])

    // Обновляем updated_at беседы
    await db.query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1', [convId])

    // Уведомления только на входящие от студента (owner отвечает — уведомлять не нужно)
    if (role !== 'owner') {
      const senderName = request.user.name || request.user.email
      const chatType   = conv.rows[0].type

      // Запускаем параллельно, не ждём
      Promise.all([
        sendNewMessageEmail({ senderName, chatType, body: body.trim(), conversationId: convId }),
        sendTelegramNotification({ senderName, chatType, body: body.trim() }),
      ]).catch(e => console.error('[notify] Ошибка уведомления:', e.message))
    }

    return reply.status(201).send(rows[0])
  })

  // ─── Количество непрочитанных (для бейджа в навигации) ───
  fastify.get('/api/chat/unread', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const role   = request.user.role

    const { rows } = role === 'owner'
      ? await db.query(`
          SELECT COUNT(*) AS count
          FROM chat_messages m
          JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE m.sender_id != $1 AND m.read_at IS NULL
        `, [userId])
      : await db.query(`
          SELECT COUNT(*) AS count
          FROM chat_messages m
          JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE c.student_id = $1 AND m.sender_id != $1 AND m.read_at IS NULL
        `, [userId])

    return { count: parseInt(rows[0].count) }
  })
}
