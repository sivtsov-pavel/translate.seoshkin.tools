import { db } from '../db/index.js'
import { processLesson, enrichLesson, generateCustomSet, drawLessonImages, processNewMedia, redistributeLesson, distributeWordsToSets, extractLessonPreview, commitLessonWords } from '../services/processor.js'
import { ownerHasOwnKey } from '../services/openaiClient.js'
import { config } from '../config.js'

// Разрешена ли пользователю загрузка/обработка уроков (тратит токены).
// Разрешено: администраторам из белого списка ЛИБО учителю со своим ключом OpenAI
// (он платит за обработку сам — платформенные токены не тратятся).
async function canUpload(request, reply) {
  const allowed = config.uploadAllowedIds.includes(request.user.id) || await ownerHasOwnKey(request.user.id)
  if (!allowed) {
    reply.status(403).send({ error: 'Загрузка уроков ограничена. Добавьте свой ключ OpenAI в Настройках, чтобы обрабатывать уроки за свой счёт.' })
    return false
  }
  return true
}

export async function processRoutes(fastify) {
  // «Нарисовать недостающие картинки»: детсадовские ИИ-иллюстрации для слов урока без фото
  fastify.post('/api/lessons/:id/draw-images', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!(await canUpload(request, reply))) return
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

  // «Распределить в наборы»: слова урока → в тематические наборы словаря (НЕ разбивая урок).
  // Урок остаётся как есть; слова копируются в наборы по темам (та же логика, что камера/читалка).
  fastify.post('/api/lessons/:id/distribute-to-sets', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    const { rows: lr } = await db.query('SELECT owner_id, target_lang FROM lessons WHERE id = $1', [lessonId])
    if (!lr[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (lr[0].owner_id !== request.user.id) return reply.status(403).send({ error: 'Не ваш урок' })
    const { rows: words } = await db.query('SELECT word_de, translation_ru FROM words WHERE lesson_id = $1', [lessonId])
    if (!words.length) return reply.status(400).send({ error: 'Нет слов в уроке' })
    const { rows: sents } = await db.query('SELECT text, translation_ru FROM lesson_sentences WHERE lesson_id = $1', [lessonId])
    reply.code(202).send({ started: true, words: words.length })
    distributeWordsToSets(
      words.map(w => ({ de: w.word_de, tr: w.translation_ru })),
      request.user.id, lr[0].target_lang,
      sents.map(s => ({ text: s.text, translation: s.translation_ru }))
    ).catch(err => fastify.log.error({ lessonId, err }, 'Ошибка распределения в наборы'))
  })

  // «Свои упражнения»: создать набор из выбранных слов словаря
  fastify.post('/api/lessons/custom', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!(await canUpload(request, reply))) return
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

  // Превью распознанного ПЕРЕД созданием урока (#5): извлечь+смёржить фото урока
  // (учебник+тетрадь, дедуп), вернуть учителю на правку — слова/предложения в БД ещё
  // НЕ вставлены. Vision-разбор идёт здесь и только здесь (один раз). Синхронный ответ —
  // nginx proxy_read_timeout 900s, нескольких фото хватает с запасом.
  fastify.post('/api/lessons/:id/extract-preview', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!(await canUpload(request, reply))) return
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query('SELECT status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].status === 'processing') return reply.status(409).send({ error: 'Уже обрабатывается' })
    try {
      return await extractLessonPreview(lessonId)
    } catch (err) {
      fastify.log.error({ lessonId, err }, 'Ошибка превью распознавания')
      return reply.status(500).send({ error: 'Не удалось распознать фото: ' + err.message })
    }
  })

  // Подтверждение превью (#5): коммитит только отмеченные учителем + добавленные вручную
  // слова/предложения. Vision уже отработал на превью — здесь только текст (gpt-4o-mini) и картинки.
  fastify.post('/api/lessons/:id/confirm', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!(await canUpload(request, reply))) return
    const lessonId = parseInt(request.params.id)
    const { words, sentences, grammar_points } = request.body || {}
    const { rows } = await db.query('SELECT status FROM lessons WHERE id = $1', [lessonId])
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    if (rows[0].status === 'processing') return reply.status(409).send({ error: 'Уже обрабатывается' })

    await db.query("UPDATE lessons SET status='processing', progress='Сохраняю урок...' WHERE id=$1", [lessonId])
    commitLessonWords(lessonId, words, sentences, grammar_points).catch(err =>
      fastify.log.error({ lessonId, err }, 'Ошибка подтверждения урока'))
    return { started: true, lessonId }
  })

  // Запуск обработки — возвращает сразу, обработка идёт в фоне
  fastify.post('/api/lessons/:id/process', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Только учитель — обработка тратит токены (картинки/переводы), ученики не могут
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    if (!(await canUpload(request, reply))) return
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
    if (!(await canUpload(request, reply))) return
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
