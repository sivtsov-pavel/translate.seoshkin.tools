import { createHash } from 'crypto'
import { db } from '../db/index.js'
import { generateLetterFill } from '../services/claude.js'
import { regenerateExercisesFromDb } from '../services/processor.js'
import { ownerHasOwnKey } from '../services/openaiClient.js'
import { pdfToImages } from '../services/pdf.js'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'

export async function lessonsRoutes(fastify) {
  // Создание урока (опционально с привязкой к курсу)
  fastify.post('/api/lessons', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          title:         { type: 'string' },
          description:   { type: ['string', 'null'] },
          date:          { type: 'string', format: 'date' },
          course_id:     { type: ['integer', 'null'] },
          lesson_number: { type: ['integer', 'null'] },
        },
      },
    },
  }, async (request, reply) => {
    const { title, description, date, course_id, lesson_number } = request.body
    const ownerId = request.user.id

    // Автономер урока: следующий по порядку в курсе (или в общем пуле без курса)
    let number = lesson_number
    if (number == null) {
      const q = course_id
        ? await db.query('SELECT COALESCE(MAX(lesson_number), 0) + 1 AS n FROM lessons WHERE course_id = $1', [course_id])
        : await db.query('SELECT COALESCE(MAX(lesson_number), 0) + 1 AS n FROM lessons WHERE owner_id = $1 AND course_id IS NULL', [ownerId])
      number = q.rows[0].n
    }

    const targetLang = request.headers['x-target-lang'] || 'de'
    const { rows } = await db.query(
      'INSERT INTO lessons (owner_id, title, description, date, course_id, lesson_number, target_lang) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [ownerId, title || null, description || null, date || new Date().toISOString().slice(0, 10), course_id || null, number, targetLang]
    )
    return reply.status(201).send(rows[0])
  })

  // Список уроков: все owner видят общий пул; student видит готовые
  fastify.get('/api/lessons', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { id: userId, role } = request.user
    const target = request.headers['x-target-lang'] || 'de'
    // Мульти-таргет: показываем только уроки активного изучаемого языка
    // Личные наборы ученика («мои сложные слова») в общий список не показываем никому,
    // кроме их владельца — иначе они утекли бы всей школе.
    const personalFilter = ` AND (NOT l.is_personal OR l.owner_id = ${parseInt(userId)})`
    // Пустые авто-уроки из PDF (обложка/пустая страница — ИИ не нашёл слов) прячем из списка,
    // данные не удаляем (фото остаётся в БД, урок виден только напрямую/через БД).
    const emptyAutoPdfFilter = ' AND NOT (l.auto_pdf AND l.status = \'done\' AND NOT EXISTS (SELECT 1 FROM words w2 WHERE w2.lesson_id = l.id))'
    // Мультиарендность (как в /api/words и /exercises/today): учитель видит СВОИ уроки
    // (супер-админ id=1 — все), ученик — уроки СВОЕЙ школы (null-safe: без школы — как раньше).
    let tenantFilter = ''
    if (userId === 1) {
      tenantFilter = ''
    } else if (role === 'owner') {
      // Учитель видит уроки СВОЕЙ ШКОЛЫ плюс свои личные.
      // Было `owner_id = userId` — второй учитель школы не видел ничего и знал
      // меньше собственных учеников (те видят уроки школы). Исправлено 2026-07-27.
      const teacherSchoolId = request.user.school_id ?? null
      tenantFilter = teacherSchoolId != null
        ? ` AND (l.school_id = ${parseInt(teacherSchoolId)} OR l.owner_id = ${parseInt(userId)})`
        : ` AND l.owner_id = ${parseInt(userId)}`
    } else {
      const schoolId = request.user.school_id ?? null
      // Личные наборы ученика (is_personal, owner = ученик) видны всегда — у них нет school_id
      tenantFilter = schoolId != null
        ? ` AND (l.school_id = ${parseInt(schoolId)} OR (l.is_personal AND l.owner_id = ${parseInt(userId)}))`
        : ''
    }
    const filter = (role === 'owner' ? 'WHERE l.target_lang = $1' : "WHERE l.status = 'done' AND l.target_lang = $1") + personalFilter + emptyAutoPdfFilter + tenantFilter

    const { rows } = await db.query(
      `SELECT l.*,
          -- Готовый урок не должен показывать текст от прошлой обработки — progress имеет
          -- смысл только пока идёт/упала обработка (перекрывает l.progress из l.*, см. ниже).
          CASE WHEN l.status IN ('processing', 'pending', 'error') THEN l.progress ELSE NULL END AS progress,
          COUNT(DISTINCT lm.id)::int AS media_count,
          -- Фото, которые загружены, но ещё не распознаны: по ним показываем кнопку
          -- «разобрать». Без счётчика учитель грузит фото и не понимает, почему ничего
          -- не происходит — загрузка только складывает файлы, разбор запускается отдельно.
          COUNT(DISTINCT lm.id) FILTER (WHERE NOT lm.processed AND lm.type = 'photo')::int AS pending_media,
          (l.preview->>'savedAt' IS NOT NULL) AS has_preview,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL)::int AS words_total,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL AND w.image_url IS NOT NULL)::int AS words_with_images,
          COUNT(DISTINCT e.id)::int AS exercises_total
       FROM lessons l
       LEFT JOIN lesson_media lm ON lm.lesson_id = l.id
       LEFT JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN words w ON w.id = e.word_id
       ${filter}
       GROUP BY l.id
       -- Внутри одного дня сортируем по номеру урока: уроки, разбитые из большого
       -- скопом или залитые пачкой, получают одну дату, и без второго ключа порядок
       -- случайный («20, 35, 27» — жалоба Павла 13.08). NULLS LAST — у урока без даты
       -- место в конце, а не наверху списка.
       ORDER BY l.date DESC NULLS LAST, l.lesson_number DESC NULLS LAST, l.created_at DESC`,
      [target]
    )
    // `l.*` тянет и preview — это весь разбор фото, сотни слов JSON на урок. В списке он
    // не нужен (есть флаг has_preview), а трафик на телефоне раздувает заметно.
    return rows.map(({ preview, ...rest }) => rest)
  })

  // Добавить letter_fill к уроку без сброса прогресса
  fastify.post('/api/lessons/:id/add-letter-fill', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1', [lessonId]
    )
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    // Берём слова урока (из существующих упражнений, дедупликация по word_de)
    const { rows: existing } = await db.query(
      `SELECT DISTINCT ON (e.payload->>'question')
         e.word_id,
         COALESCE(w.word_de, e.payload->>'question') AS word_de,
         COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
       FROM exercises e
       LEFT JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.type = 'flashcard'
       ORDER BY e.payload->>'question'`,
      [lessonId]
    )

    if (!existing.length) return reply.status(400).send({ error: 'Нет слов в уроке' })

    // Проверяем нет ли уже letter_fill у этого урока
    const { rows: already } = await db.query(
      `SELECT COUNT(*) cnt FROM exercises WHERE lesson_id = $1 AND type = 'letter_fill'`, [lessonId]
    )
    if (parseInt(already[0].cnt) > 0) {
      return reply.status(409).send({ error: 'Упражнения letter_fill уже есть в этом уроке' })
    }

    const words = existing.map(r => ({ word_de: r.word_de, translation_ru: r.translation_ru }))
    const exercises = await generateLetterFill(words)

    const wordMap = Object.fromEntries(existing.map(r => [r.word_de, r.word_id]))
    let added = 0
    for (const ex of exercises) {
      if (ex.type !== 'letter_fill') continue
      const wordId = wordMap[ex.word_de] ?? null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
      added++
    }

    return { added }
  })

  // Добавить диктант к уроку
  fastify.post('/api/lessons/:id/add-dictation', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    // Если переданы word_ids — диктант ТОЛЬКО из выбранных слов (с заменой существующего)
    const selected = Array.isArray(request.body?.word_ids)
      ? request.body.word_ids.map(Number).filter(Boolean) : null

    const { rows: lessonRows } = await db.query('SELECT id FROM lessons WHERE id = $1', [lessonId])
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    if (selected) {
      // Пересобираем диктант из выбранных — удаляем прежний
      await db.query("DELETE FROM exercises WHERE lesson_id = $1 AND type = 'dictation'", [lessonId])
    } else {
      const { rows: already } = await db.query(
        `SELECT COUNT(*) cnt FROM exercises WHERE lesson_id = $1 AND type = 'dictation'`, [lessonId])
      if (parseInt(already[0].cnt) > 0) return reply.status(409).send({ error: 'Диктант уже добавлен' })
    }

    // Слова: выбранные (по id) — из words; иначе все слова урока (из flashcard-упражнений)
    const { rows: wordRows } = selected
      ? await db.query(
          `SELECT id AS word_id, word_de, translation_ru FROM words
           WHERE lesson_id = $1 AND id = ANY($2::int[]) ORDER BY id`, [lessonId, selected])
      : await db.query(
          `SELECT DISTINCT ON (e.payload->>'question')
             e.word_id,
             COALESCE(w.word_de, e.payload->>'question') AS word_de,
             COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
           FROM exercises e
           LEFT JOIN words w ON w.id = e.word_id
           WHERE e.lesson_id = $1 AND e.type = 'flashcard'
           ORDER BY e.payload->>'question'`, [lessonId])
    if (!wordRows.length) return reply.status(400).send({ error: 'Нет слов для диктанта' })

    let added = 0
    for (const w of wordRows) {
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, w.word_id, 'dictation', JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })]
      )
      added++
    }
    return { added }
  })

  // Добавить упражнения на произношение (speech) к уроку без сброса прогресса
  fastify.post('/api/lessons/:id/add-speech', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows: lessonRows } = await db.query('SELECT id FROM lessons WHERE id = $1', [lessonId])
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: already } = await db.query(
      `SELECT COUNT(*) cnt FROM exercises WHERE lesson_id = $1 AND type = 'speech'`, [lessonId]
    )
    if (parseInt(already[0].cnt) > 0) return reply.status(409).send({ error: 'Упражнения на произношение уже добавлены' })

    const { rows: wordRows } = await db.query(
      `SELECT DISTINCT ON (e.payload->>'question')
         e.word_id,
         COALESCE(w.word_de, e.payload->>'question') AS word_de,
         COALESCE(w.translation_ru, e.payload->>'answer') AS translation_ru
       FROM exercises e
       LEFT JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.type = 'flashcard'
       ORDER BY e.payload->>'question'`,
      [lessonId]
    )
    if (!wordRows.length) return reply.status(400).send({ error: 'Нет слов в уроке' })

    let added = 0
    for (const w of wordRows) {
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, w.word_id, 'speech', JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })]
      )
      added++
    }
    return { added }
  })

  // Слова урока — через упражнения (не через words.lesson_id, т.к. там дедупликация)
  fastify.get('/api/lessons/:id/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const lessonId = parseInt(request.params.id)
    const { rows } = await db.query(
      `SELECT DISTINCT ON (w.id) w.id, w.word_de, w.translation_ru, w.source,
              COALESCE(w.translations, '{}') AS translations, w.example_sentence,
              COALESCE(w.image_url, e.image_url) AS image_url
       FROM exercises e
       JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.word_id IS NOT NULL
       ORDER BY w.id`,
      [lessonId]
    )
    // Порядок как в тетради ученика: сначала слова из учебника (📖 — они в зачёте),
    // потом дописанные с доски/тетради (✏️ — дополнительные). Внутри группы — по id,
    // то есть в том порядке, в каком слова встретились на странице.
    return rows.sort((a, b) =>
      (a.source === 'extra' ? 1 : 0) - (b.source === 'extra' ? 1 : 0) || a.id - b.id)
  })

  // Упражнения урока для печатного листа A4 — БЕЗ SRS-фильтра «на сегодня»
  // (учителю нужен полный набор, а не только несделанные). Только учитель.
  fastify.get('/api/lessons/:id/print', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows: lessons } = await db.query(
      `SELECT id, title, COALESCE(title_translations, '{}') AS title_translations
       FROM lessons WHERE id = $1`,
      [lessonId]
    )
    if (!lessons[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: exercises } = await db.query(
      `SELECT e.id, e.type, e.payload,
              w.word_de, w.translation_ru, COALESCE(w.translations, '{}') AS translations
       FROM exercises e
       LEFT JOIN words w ON w.id = e.word_id
       WHERE e.lesson_id = $1 AND e.type IN ('letter_fill', 'fill_blank')
       ORDER BY e.type, e.id`,
      [lessonId]
    )
    return { lesson: lessons[0], exercises }
  })

  // Получить один урок
  fastify.get('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params
    // owner видит любой урок; student — только если урок принадлежит его owner
    const ownerFilter = request.user.role === 'owner' ? '' : 'AND l.owner_id = $2'
    const params = request.user.role === 'owner' ? [id] : [id, request.user.id]
    const { rows } = await db.query(
      `SELECT l.*,
          CASE WHEN l.status IN ('processing', 'pending', 'error') THEN l.progress ELSE NULL END AS progress,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL)::int AS words_total,
          COUNT(DISTINCT e.word_id) FILTER (WHERE e.word_id IS NOT NULL AND w.image_url IS NOT NULL)::int AS words_with_images
       FROM lessons l
       LEFT JOIN exercises e ON e.lesson_id = l.id
       LEFT JOIN words w ON w.id = e.word_id
       WHERE l.id = $1 ${ownerFilter}
       GROUP BY l.id`,
      params
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const { rows: media } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1', [id]
    )
    return { ...rows[0], media }
  })

  // Редактировать урок (title, description, text_content) — любой owner
  fastify.patch('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          title:              { type: 'string' },
          description:        { type: 'string' },
          text_content:       { type: 'string' },
          text_content_extra: { type: 'string' },
          title_translations: { type: 'object' },
        },
      },
    },
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    const { title, description, text_content, text_content_extra, title_translations } = request.body

    const { rows } = await db.query(
      `UPDATE lessons SET
         title              = COALESCE($1, title),
         description        = COALESCE($2, description),
         text_content       = COALESCE($3, text_content),
         text_content_extra = COALESCE($4, text_content_extra),
         title_translations = CASE WHEN $5::jsonb IS NOT NULL
                                THEN COALESCE(title_translations, '{}'::jsonb) || $5::jsonb
                                ELSE title_translations END
       WHERE id = $6
       RETURNING *`,
      [title ?? null, description ?? null, text_content ?? null, text_content_extra ?? null,
       title_translations ? JSON.stringify(title_translations) : null,
       lessonId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return rows[0]
  })

  // Удалить урок (только owner, каскадно удаляет слова/упражнения через FK)
  fastify.delete('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { rows } = await db.query(
      'DELETE FROM lessons WHERE id = $1 AND owner_id = $2 RETURNING id',
      [parseInt(request.params.id), request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return reply.status(204).send()
  })

  // Загрузка медиафайлов к уроку
  fastify.post('/api/lessons/:id/media', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    // Загрузка медиа запускает обработку (токены): администратор из белого списка ЛИБО учитель со своим ключом OpenAI
    if (!config.uploadAllowedIds.includes(request.user.id) && !(await ownerHasOwnKey(request.user.id)))
      return reply.status(403).send({ error: 'Загрузка уроков ограничена. Добавьте свой ключ OpenAI в Настройках, чтобы обрабатывать уроки за свой счёт.' })
    const lessonId = request.params.id
    // Источник: учебник (по умолчанию) или тетрадь/доска (?source=extra)
    const source = request.query?.source === 'extra' ? 'extra' : 'textbook'

    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1', [lessonId]
    )
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const parts = request.parts()
    const savedFiles = []
    const duplicates = []   // страницы, которые уже есть в другом уроке этого учителя

    for await (const part of parts) {
      if (part.type !== 'file') continue

      const mimeType = part.mimetype || ''
      // PDF учебника → конвертируем в страницы-картинки, каждую как отдельное фото урока
      const isPdf = mimeType === 'application/pdf' || (part.filename || '').toLowerCase().endsWith('.pdf')
      if (isPdf) {
        try {
          const buf = await part.toBuffer()
          const pages = await pdfToImages(buf)
          for (const p of pages) {
            const pageHash = createHash('sha256').update(p.filename).digest('hex')
            const { rows } = await db.query(
              "INSERT INTO lesson_media (lesson_id, type, file_path, source, file_hash) VALUES ($1, 'photo', $2, $3, $4) RETURNING id",
              [lessonId, p.filename, source, pageHash])
            savedFiles.push({ mediaId: rows[0].id, filename: p.filename, type: 'photo' })
          }
        } catch (e) {
          fastify.log.error({ lessonId, err: e }, 'Ошибка конвертации PDF')
        }
        continue
      }

      const mediaType = mimeType.startsWith('audio') ? 'audio' : 'photo'
      const { filename, fileHash } = await fastify.saveUploadedFile(part)

      // Тот же файл уже есть в ДРУГОМ уроке? Значит страницы грузят повторно —
      // обычно после обновления страницы во время разбора. Не запрещаем (бывает, что
      // фото правда нужно в двух уроках), но сообщаем, чтобы не платить дважды и не
      // держать два одинаковых урока.
      if (fileHash) {
        const { rows: dup } = await db.query(
          `SELECT m.lesson_id, l.title FROM lesson_media m JOIN lessons l ON l.id = m.lesson_id
            WHERE m.file_hash = $1 AND m.lesson_id <> $2 AND l.owner_id = $3 LIMIT 1`,
          [fileHash, lessonId, request.user.id])
        if (dup[0]) duplicates.push({ filename: part.filename, lessonId: dup[0].lesson_id, lessonTitle: dup[0].title })
      }

      const { rows } = await db.query(
        'INSERT INTO lesson_media (lesson_id, type, file_path, source, file_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [lessonId, mediaType, filename, source, fileHash || null]
      )
      savedFiles.push({ mediaId: rows[0].id, filename, type: mediaType })
    }

    // Загрузка сама по себе больше НЕ запускает обработку (раньше — «вслепую», часть слов
    // терялась незаметно). Разбор — через явное превью: POST /extract-preview → учитель
    // проверяет/правит → POST /confirm. Для добавления фото к готовому уроку — как раньше,
    // кнопка «✨ Обработать всё» (эндпоинт /enrich, processNewMedia остаётся для неё).
    return reply.status(201).send({ files: savedFiles, processing: false, duplicates })
  })

  // Удалить одно загруженное медиа урока (фото/аудио) — чтобы переделать урок с нужными страницами.
  // Удаляет запись lesson_media + файл с диска. Только владелец урока. Слова/упражнения не трогаем
  // (они уже извлечены); при желании учитель потом пересоберёт урок.
  fastify.delete('/api/lessons/:id/media/:mediaId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)
    const mediaId = parseInt(request.params.mediaId)

    // Проверяем: медиа принадлежит уроку этого владельца
    const { rows } = await db.query(
      `SELECT lm.id, lm.file_path FROM lesson_media lm
       JOIN lessons l ON l.id = lm.lesson_id
       WHERE lm.id = $1 AND lm.lesson_id = $2 AND l.owner_id = $3`,
      [mediaId, lessonId, request.user.id])
    if (!rows[0]) return reply.status(404).send({ error: 'Файл не найден' })

    // Удаляем файл с диска (не критично, если уже отсутствует)
    try { await unlink(join(config.uploadDir, rows[0].file_path)) } catch { /* файла может не быть */ }
    await db.query('DELETE FROM lesson_media WHERE id = $1', [mediaId])
    return { deleted: mediaId }
  })

  // Пересоздать упражнения из существующих слов (без сканирования фото)
  fastify.post('/api/lessons/:id/regenerate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const lessonId = parseInt(request.params.id)

    const { rows } = await db.query(
      'SELECT id, title FROM lessons WHERE id = $1', [lessonId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    // Отвечаем немедленно — генерация идёт в фоне
    reply.code(202).send({ started: true, lessonId })

    try {
      await regenerateExercisesFromDb(lessonId)
    } catch (e) {
      console.error(`regenerate lesson ${lessonId}: ${e.message}`)
    }
  })

  // Пересоздать упражнения для ВСЕХ уроков со словами
  fastify.post('/api/admin/regenerate-all', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    // Уроки у которых есть слова но нет упражнений (или status pending)
    const { rows } = await db.query(`
      SELECT l.id, l.title, COUNT(DISTINCT w.id) AS words_count, COUNT(DISTINCT e.id) AS ex_count
      FROM lessons l
      LEFT JOIN words w ON w.lesson_id = l.id
      LEFT JOIN exercises e ON e.lesson_id = l.id
      GROUP BY l.id, l.title
      HAVING COUNT(DISTINCT w.id) > 0 AND COUNT(DISTINCT e.id) = 0
      ORDER BY l.id
    `)
    if (!rows.length) return { message: 'Все уроки уже имеют упражнения', count: 0 }

    reply.code(202).send({ started: true, lessons: rows.map(r => ({ id: r.id, title: r.title, words: r.words_count })) })

    for (const lesson of rows) {
      try {
        console.log(`regenerate-all: урок ${lesson.id} (${lesson.words_count} слов)`)
        await regenerateExercisesFromDb(lesson.id)
        console.log(`regenerate-all: урок ${lesson.id} готов`)
      } catch (e) {
        console.error(`regenerate-all: урок ${lesson.id} ошибка: ${e.message}`)
      }
    }
  })
}
