import { readFileSync } from 'fs'
import { unlink } from 'fs/promises'
import { db } from '../db/index.js'
import { saveCourseCover } from '../services/imageOptimize.js'
import { pdfToImages } from '../services/pdf.js'
import { drainPendingLessons } from '../services/processor.js'
import { ownerHasOwnKey } from '../services/openaiClient.js'
import { unlockedCount, unlockDateForIndex, LESSON_PASSED_HAVING } from '../services/drip.js'

export async function coursesRoutes(fastify) {

  // Список курсов: все owner видят общий пул; student видит курсы с готовыми уроками
  fastify.get('/api/courses', { preHandler: [fastify.authenticate] }, async (request) => {
    const { role } = request.user
    // Разделение по изучаемому языку: показываем курсы активного target_lang (напр. de/en)
    const target = request.headers['x-target-lang'] || 'de'
    // owner видит общий пул своего языка; student — только курсы с готовыми уроками того же языка
    const filter = role === 'owner'
      ? 'WHERE c.target_lang = $1'
      : 'WHERE c.target_lang = $1 AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id = c.id AND l.status = \'done\')'

    const { rows } = await db.query(`
      SELECT
        c.id, c.title, c.description, c.cover_image_url, c.sort_order, c.created_at,
        COUNT(l.id)::int                                                  AS lessons_total,
        COUNT(CASE WHEN l.status = 'done'       THEN 1 END)::int         AS lessons_done,
        COUNT(CASE WHEN l.status = 'processing' THEN 1 END)::int         AS lessons_processing
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      ${filter}
      GROUP BY c.id
      ORDER BY c.sort_order, c.created_at
    `, [target])
    return rows
  })

  // Уроки внутри курса. Для ученика с расписанием (дрип) добавляем lock-статус и дату открытия.
  fastify.get('/api/courses/:id/lessons', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const courseId = parseInt(request.params.id)
    const { rows: course } = await db.query('SELECT * FROM courses WHERE id = $1', [courseId])
    if (!course[0]) return reply.status(404).send({ error: 'Курс не найден' })

    const { rows } = await db.query(`
      SELECT id, title, date, status, progress, lesson_number, created_at,
             (SELECT count(*) FROM words w WHERE w.lesson_id = lessons.id)::int AS words_total,
             (SELECT count(*) FROM exercises e WHERE e.lesson_id = lessons.id)::int AS exercises_total
      FROM lessons
      WHERE course_id = $1
      ORDER BY lesson_number NULLS LAST, created_at
    `, [courseId])

    // Дрип: у ученика есть расписание по этому курсу → размечаем, какие уроки открыты.
    // СТРОГИЙ дрип: следующий урок открывается, только если (а) наступил учебный день
    // И (б) предыдущий урок ПРОЙДЕН (все упражнения отправлены в будущее). Не прошёл — закрыт.
    let schedule = null
    let needsSchedule = false
    if (request.user.role !== 'owner') {
      const { rows: sc } = await db.query(
        'SELECT weekdays, start_date FROM course_schedules WHERE user_id = $1 AND course_id = $2',
        [request.user.id, courseId])
      if (!sc[0]) {
        // Нет расписания: ученик ОБЯЗАН сначала выбрать календарь обучения.
        // Пока не выбрал — все готовые уроки закрыты (причина 'no_schedule').
        const hasDone = rows.some(l => l.status === 'done')
        if (hasDone) {
          needsSchedule = true
          for (const l of rows) { l.locked = true; l.lock_reason = 'no_schedule'; l.unlock_date = null }
        }
      }
      if (sc[0]) {
        schedule = sc[0]
        const opened = unlockedCount(sc[0].start_date, sc[0].weekdays)
        // Статус «пройден» = каждое слово урока отработано хотя бы в одном упражнении
        // (см. LESSON_PASSED_HAVING в drip.js) — не нужно щёлкать все 7 упражнений каждого слова.
        const { rows: passedRows } = await db.query(
          `SELECT e.lesson_id
           FROM exercises e
           JOIN lessons l ON l.id = e.lesson_id
           LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
           WHERE l.course_id = $2
           GROUP BY e.lesson_id
           HAVING ${LESSON_PASSED_HAVING}`,
          [request.user.id, courseId])
        const passedSet = new Set(passedRows.map(r => r.lesson_id))

        // Идём по готовым урокам по порядку. prevPassed — пройден ли предыдущий готовый урок.
        let doneIdx = 0
        let prevPassed = true // у первого урока нет предшественника — гейт «пройден» открыт
        for (const l of rows) {
          if (l.status === 'done') {
            const calendarOpen = doneIdx < opened          // наступил ли учебный день
            const gateOpen = doneIdx === 0 || prevPassed    // пройден ли предыдущий
            l.locked = !(calendarOpen && gateOpen)
            // Причина замка: 'date' — ещё не наступил день; 'prev' — не пройден предыдущий урок
            l.lock_reason = !l.locked ? null : (!calendarOpen ? 'date' : 'prev')
            l.unlock_date = (l.locked && l.lock_reason === 'date')
              ? unlockDateForIndex(sc[0].start_date, sc[0].weekdays, doneIdx) : null
            prevPassed = passedSet.has(l.id)
            doneIdx++
          } else {
            l.locked = true
            l.lock_reason = null
            l.unlock_date = null
            prevPassed = false
          }
        }
      }
    }

    return { course: course[0], lessons: rows, schedule, needs_schedule: needsSchedule }
  })

  // Учитель: повторить обработку уроков курса, упавших с ошибкой (напр. после пополнения OpenAI).
  // Сбрасывает error→pending и запускает устойчивый дренер.
  fastify.post('/api/courses/:id/retry-failed', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)
    const { rows } = await db.query(
      `UPDATE lessons SET status='pending', progress='В очереди на повтор...'
       WHERE course_id = $1 AND owner_id = $2 AND status='error'
         AND EXISTS (SELECT 1 FROM lesson_media m WHERE m.lesson_id = lessons.id)
       RETURNING id`, [courseId, request.user.id])
    reply.code(202).send({ retry: rows.length })
    drainPendingLessons().catch(e => fastify.log.error({ err: e }, 'drainPendingLessons retry-failed'))
  })

  // Глобальный индикатор: сколько уроков владельца сейчас в обработке/очереди (+ где).
  // Фронт опрашивает и показывает фоновый бейдж «⏳ обрабатывается N».
  fastify.get('/api/lessons/processing-status', { preHandler: [fastify.authenticate] }, async (request) => {
    if (request.user.role !== 'owner') return { processing: 0, pending: 0, error: 0, total: 0 }
    const { rows } = await db.query(`
      SELECT
        count(*) FILTER (WHERE status='processing')::int AS processing,
        count(*) FILTER (WHERE status='pending')::int    AS pending,
        count(*) FILTER (WHERE status='error')::int      AS error
      FROM lessons
      WHERE owner_id = $1 AND EXISTS (SELECT 1 FROM lesson_media m WHERE m.lesson_id = lessons.id)`,
      [request.user.id])
    const r = rows[0] || {}
    // Что именно сейчас обрабатывается (для подсказки в бейдже)
    const { rows: cur } = await db.query(
      `SELECT id, title, progress, course_id FROM lessons
       WHERE owner_id = $1 AND status='processing' ORDER BY id LIMIT 1`, [request.user.id])
    return {
      processing: r.processing || 0, pending: r.pending || 0, error: r.error || 0,
      active: (r.processing || 0) + (r.pending || 0),
      current: cur[0] || null,
    }
  })

  // Ученик: получить своё расписание дрип-выдачи по курсу
  fastify.get('/api/courses/:id/schedule', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const courseId = parseInt(request.params.id)
    const { rows } = await db.query(
      'SELECT weekdays, start_date FROM course_schedules WHERE user_id = $1 AND course_id = $2',
      [request.user.id, courseId])
    return rows[0] || null
  })

  // Ученик: задать/обновить расписание (учебные дни недели + дата старта)
  fastify.put('/api/courses/:id/schedule', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const courseId = parseInt(request.params.id)
    const { weekdays, start_date } = request.body || {}
    // Валидация: массив ISO-дней 1..7, непустой
    const wd = Array.isArray(weekdays) ? [...new Set(weekdays.map(Number).filter(n => n >= 1 && n <= 7))].sort() : []
    if (!wd.length) return reply.status(400).send({ error: 'Выбери хотя бы один день недели' })
    const start = start_date || new Date().toISOString().slice(0, 10)

    const { rows } = await db.query(`
      INSERT INTO course_schedules (user_id, course_id, weekdays, start_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, course_id) DO UPDATE SET weekdays = $3, start_date = $4
      RETURNING weekdays, start_date`,
      [request.user.id, courseId, wd, start])
    return rows[0]
  })

  // Учитель: удалить ВСЕ уроки курса (для чистой перезаливки). Сам курс остаётся.
  // Каскад удаляет слова/упражнения/медиа по FK. ОПАСНО — только владелец, с подтверждением на фронте.
  fastify.delete('/api/courses/:id/lessons', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)
    const { rows: c } = await db.query('SELECT id FROM courses WHERE id = $1 AND owner_id = $2', [courseId, request.user.id])
    if (!c[0]) return reply.status(404).send({ error: 'Курс не найден' })
    const { rows } = await db.query(
      'DELETE FROM lessons WHERE course_id = $1 AND owner_id = $2 RETURNING id', [courseId, request.user.id])
    return { deleted: rows.length }
  })

  // Учитель: массовая загрузка курса одним PDF → каждая страница = отдельный урок в курсе.
  // Уроки создаются по порядку и обрабатываются в фоне (vision → слова → упражнения).
  fastify.post('/api/courses/:id/upload-pdf', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    // Администратор из белого списка ЛИБО учитель со своим ключом OpenAI (обрабатывает за свой счёт)
    if (!config.uploadAllowedIds.includes(request.user.id) && !(await ownerHasOwnKey(request.user.id)))
      return reply.status(403).send({ error: 'Загрузка уроков ограничена. Добавьте свой ключ OpenAI в Настройках, чтобы обрабатывать уроки за свой счёт.' })
    const courseId = parseInt(request.params.id)
    const target = request.headers['x-target-lang'] || 'de'
    const { rows: c } = await db.query('SELECT id, title FROM courses WHERE id = $1 AND owner_id = $2', [courseId, request.user.id])
    if (!c[0]) return reply.status(404).send({ error: 'Курс не найден' })

    // Читаем PDF из multipart (с понятной ошибкой, если файл превысил лимит)
    let buffer = null
    try {
      const parts = request.parts()
      for await (const part of parts) {
        if (part.type === 'file') { buffer = await part.toBuffer(); break }
      }
    } catch (e) {
      if (e.code === 'FST_REQ_FILE_TOO_LARGE' || /too large/i.test(e.message || '')) {
        return reply.status(413).send({ error: 'PDF слишком большой (лимит 200 МБ). Раздели учебник на части.' })
      }
      throw e
    }
    if (!buffer) return reply.status(400).send({ error: 'PDF не получен' })

    const pages = await pdfToImages(buffer)
    if (!pages.length) return reply.status(400).send({ error: 'Не удалось разобрать PDF на страницы' })

    // Сколько страниц на один урок (по умолчанию 1). Напр. «4» = урок из 4 страниц (4 стр/день).
    const perLesson = Math.min(Math.max(parseInt(request.query?.pages_per_lesson) || 1, 1), 10)

    // Нумерация — продолжаем с текущего максимума в курсе
    const { rows: mx } = await db.query('SELECT COALESCE(MAX(lesson_number), 0) AS n FROM lessons WHERE course_id = $1', [courseId])
    let num = mx[0].n
    const created = []
    for (let i = 0; i < pages.length; i += perLesson) {
      num++
      const chunk = pages.slice(i, i + perLesson)
      const { rows: lr } = await db.query(
        `INSERT INTO lessons (owner_id, title, course_id, lesson_number, target_lang, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [request.user.id, `Урок ${num}`, courseId, num, target])
      const lessonId = lr[0].id
      // Все страницы группы — как медиа одного урока (обработаются вместе)
      for (const p of chunk) {
        await db.query(
          `INSERT INTO lesson_media (lesson_id, type, file_path, source) VALUES ($1, 'photo', $2, 'textbook')`,
          [lessonId, p.filename])
      }
      created.push(lessonId)
    }

    // Отвечаем сразу — обработка страниц идёт в фоне через устойчивый дренер
    // (переживает рестарт бэкенда: на старте дообработает всё pending).
    reply.code(202).send({ started: true, lessons: created.length })
    drainPendingLessons().catch(e => fastify.log.error({ err: e }, 'drainPendingLessons после PDF'))
  })

  // Создать курс
  fastify.post('/api/courses', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { title, description = '' } = request.body
    if (!title?.trim()) return reply.status(400).send({ error: 'Название обязательно' })

    const target = request.headers['x-target-lang'] || 'de'
    const { rows: maxOrder } = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS mo FROM courses WHERE owner_id = $1',
      [request.user.id]
    )
    const { rows } = await db.query(
      'INSERT INTO courses (owner_id, title, description, sort_order, target_lang) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [request.user.id, title.trim(), description.trim(), maxOrder[0].mo + 1, target]
    )
    return reply.status(201).send(rows[0])
  })

  // Переименовать / изменить описание курса
  fastify.patch('/api/courses/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)
    const { title, description } = request.body

    const { rows } = await db.query(
      `UPDATE courses
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description)
       WHERE id = $3 AND owner_id = $4
       RETURNING *`,
      [title?.trim() || null, description?.trim() ?? null, courseId, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Курс не найден' })
    return rows[0]
  })

  // Загрузить/сменить обложку курса (фото учебника)
  fastify.post('/api/courses/:id/cover', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)

    // Проверка существования И владения курсом ДО записи файла на диск —
    // иначе владелец B может перезаписать обложку курса владельца A
    // (путь файла детерминирован по courseId, запись не зависит от owner_id).
    const { rows: existing } = await db.query(
      'SELECT id FROM courses WHERE id = $1 AND owner_id = $2', [courseId, request.user.id]
    )
    if (!existing[0]) return reply.status(404).send({ error: 'Курс не найден' })

    const parts = request.parts()
    let filePart = null
    for await (const part of parts) {
      if (part.type === 'file') { filePart = part; break }
    }
    if (!filePart) return reply.status(400).send({ error: 'Файл не передан' })
    if (!filePart.mimetype?.startsWith('image/')) {
      return reply.status(400).send({ error: 'Обложка должна быть изображением' })
    }

    const { filepath } = await fastify.saveUploadedFile(filePart)
    let coverUrl
    try {
      const buffer = readFileSync(filepath)
      coverUrl = await saveCourseCover(buffer, courseId)
    } finally {
      unlink(filepath).catch(() => {})
    }

    const { rows } = await db.query(
      'UPDATE courses SET cover_image_url = $1 WHERE id = $2 AND owner_id = $3 RETURNING *',
      [coverUrl, courseId, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Курс не найден' })
    return rows[0]
  })

  // Убрать обложку курса
  fastify.delete('/api/courses/:id/cover', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)
    const { rows } = await db.query(
      'UPDATE courses SET cover_image_url = NULL WHERE id = $1 AND owner_id = $2 RETURNING id',
      [courseId, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Курс не найден' })
    return reply.status(204).send()
  })

  // Удалить курс (уроки остаются, course_id → NULL); owner удаляет любой курс
  fastify.delete('/api/courses/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    await db.query('DELETE FROM courses WHERE id = $1', [parseInt(request.params.id)])
    return reply.status(204).send()
  })

  // Привязать урок к курсу (или открепить: course_id = null)
  fastify.patch('/api/lessons/:id/course', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { course_id, lesson_number } = request.body
    const { rows } = await db.query(
      'UPDATE lessons SET course_id = $1, lesson_number = $2 WHERE id = $3 RETURNING id, course_id, lesson_number',
      [course_id || null, lesson_number || null, parseInt(request.params.id)]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return rows[0]
  })
}
