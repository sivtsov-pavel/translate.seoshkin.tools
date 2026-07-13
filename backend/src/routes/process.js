import { db } from '../db/index.js'
import { processLesson, enrichLesson } from '../services/processor.js'

export async function processRoutes(fastify) {
  // Запуск обработки — возвращает сразу, обработка идёт в фоне
  fastify.post('/api/lessons/:id/process', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = parseInt(request.params.id)
    const ownerId = request.user.id

    const { rows } = await db.query('SELECT status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].status === 'processing') return reply.status(409).send({ error: 'Уже обрабатывается' })

    // Запускаем в фоне — не ждём завершения
    processLesson(lessonId, ownerId).catch(err =>
      fastify.log.error({ lessonId, err }, 'Ошибка обработки урока')
    )

    return { started: true, lessonId }
  })

  // «Обработать всё» для ГОТОВОГО урока: докидывает недостающее (переводы, картинки,
  // переводы упражнений на все языки). Не пересоздаёт упражнения — прогресс ученика цел.
  fastify.post('/api/lessons/:id/enrich', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query('SELECT status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].status === 'processing') return reply.status(409).send({ error: 'Уже обрабатывается' })

    await db.query("UPDATE lessons SET status = 'processing', progress = 'Дополняю недостающее...' WHERE id = $1", [lessonId])
    // В фоне: докидываем недостающее, затем возвращаем статус done
    ;(async () => {
      try {
        await enrichLesson(lessonId)
      } catch (err) {
        fastify.log.error({ lessonId, err }, 'Ошибка «Обработать всё»')
      } finally {
        await db.query("UPDATE lessons SET status = 'done', progress = 'Готово! Всё дополнено.' WHERE id = $1", [lessonId])
      }
    })()

    return { started: true, lessonId }
  })

  // Статус обработки урока — для polling с фронтенда каждые 3 сек
  fastify.get('/api/lessons/:id/status', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query(
      'SELECT id, status, progress FROM lessons WHERE id = $1',
      [lessonId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return rows[0]
  })
}
