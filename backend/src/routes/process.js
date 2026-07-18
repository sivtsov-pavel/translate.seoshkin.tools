import { db } from '../db/index.js'
import { processLesson, enrichLesson, generateCustomSet, drawLessonImages, processNewMedia, redistributeLesson } from '../services/processor.js'
import { config } from '../config.js'

// Разрешена ли пользователю загрузка/обработка уроков (тратит токены) — пока только Павел+Евгений
function canUpload(request, reply) {
  if (!config.uploadAllowedIds.includes(request.user.id)) {
    reply.status(403).send({ error: 'Загрузка уроков временно ограничена (только администратор)' })
    return false
  }
  return true
}

export async function processRoutes(fastify) {
  // «Нарисовать недостающие картинки»: детсадовские ИИ-иллюстрации для слов урока без фото
  fastify.post('/api/lessons/:id/draw-images', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!canUpload(request, reply)) return
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query('SELECT status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].status === 'processing') return reply.status(409).send({ error: 'Уже обрабатывается' })
    await db.query("UPDATE lessons SET status = 'processing', progress = 'Рисую картинки...' WHERE id = $1", [lessonId])
    ;(async () => {
      try { await drawLessonImages(lessonId) }
      catch (err) { fastify.log.error({ lessonId, err }, 'Ошибка рисования картинок') }
      finally { await db.query("UPDATE lessons SET status = 'done', progress = 'Готово! Картинки нарисованы.' WHERE id = $1", [lessonId]) }
    })()
    return { started: true, lessonId }
  })

  // «Перераспределить»: разбить урок на тематические под-уроки (14 → 14.1, 14.2…).
  // Исходный урок остаётся; создаются отдельные тематические наборы из его слов.
  fastify.post('/api/lessons/:id/redistribute', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query('SELECT owner_id, status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].owner_id !== request.user.id) return reply.status(403).send({ error: 'Не ваш урок' })
    redistributeLesson(lessonId).catch(err => fastify.log.error({ lessonId, err }, 'Ошибка перераспределения урока'))
    return { started: true, lessonId }
  })

  // «Свои упражнения»: создать набор из выбранных слов словаря
  fastify.post('/api/lessons/custom', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!canUpload(request, reply)) return
    const { title, word_ids, course_id } = request.body || {}
    if (!Array.isArray(word_ids) || !word_ids.length) return reply.status(400).send({ error: 'Выберите слова' })
    const { rows } = await db.query(
      "INSERT INTO lessons (owner_id, title, date, course_id, status) VALUES ($1, $2, CURRENT_DATE, $3, 'processing') RETURNING id",
      [request.user.id, (title && title.trim()) || '✏️ Мой набор', course_id || null]
    )
    const lessonId = rows[0].id
    generateCustomSet(lessonId, word_ids.map(Number).filter(Boolean)).catch(err =>
      fastify.log.error({ lessonId, err }, 'Ошибка генерации своего набора'))
    return { lessonId, started: true }
  })

  // Запуск обработки — возвращает сразу, обработка идёт в фоне
  fastify.post('/api/lessons/:id/process', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Только учитель — обработка тратит токены (картинки/переводы), ученики не могут
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!canUpload(request, reply)) return
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
    if (!canUpload(request, reply)) return
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query('SELECT status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].status === 'processing') return reply.status(409).send({ error: 'Уже обрабатывается' })

    await db.query("UPDATE lessons SET status = 'processing', progress = 'Дополняю недостающее...' WHERE id = $1", [lessonId])
    // В фоне: докидываем недостающее, затем возвращаем статус done
    ;(async () => {
      try {
        // Сначала обрабатываем НОВЫЕ фото (новые слова + упражнения), потом дополняем
        const n = await processNewMedia(lessonId)
        await enrichLesson(lessonId)
        await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2",
          [n > 0 ? `Готово! Обработано новых фото: ${n}.` : 'Готово! Всё дополнено.', lessonId])
      } catch (err) {
        fastify.log.error({ lessonId, err }, 'Ошибка «Обработать всё»')
        await db.query("UPDATE lessons SET status='done', progress='Готово (с ошибками).' WHERE id=$1", [lessonId])
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
