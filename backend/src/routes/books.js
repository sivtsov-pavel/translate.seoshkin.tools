import { db } from '../db/index.js'
import { extractBookText, splitBookParagraphs } from '../services/bookText.js'
import { saveBookCover } from '../services/imageOptimize.js'

export async function booksRoutes(fastify) {
  // ── Учитель: список своих книг (для управления) ──────────────────────────────
  fastify.get('/api/books', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { rows } = await db.query(
      `SELECT id, title, cover_image_url, target_lang, source_type, char_count, created_at
       FROM books WHERE owner_id = $1 ORDER BY created_at DESC`, [request.user.id])
    return rows
  })

  // ── Читалка: книги, доступные пользователю (свои + книги его школы) ───────────
  // Возвращаем позицию закладки, чтобы показать «▶ продолжить» и прогресс на карточке.
  fastify.get('/api/reader/books', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const schoolId = request.user.school_id ?? null
    const { rows } = await db.query(
      `SELECT b.id, b.title, b.cover_image_url, b.target_lang, b.source_type, b.char_count,
              COALESCE(bp.para_index, 0) AS para_index
       FROM books b
       LEFT JOIN book_progress bp ON bp.book_id = b.id AND bp.user_id = $1
       WHERE b.owner_id = $1 OR ($2::int IS NOT NULL AND b.school_id = $2)
       ORDER BY b.created_at DESC`, [request.user.id, schoolId])
    return rows
  })

  // ── Читалка: текст книги (абзацы) + сохранённая закладка ──────────────────────
  fastify.get('/api/books/:id/content', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const bookId = parseInt(request.params.id)
    const schoolId = request.user.school_id ?? null
    const { rows } = await db.query(
      `SELECT id, title, content, source_type, target_lang
       FROM books
       WHERE id = $1 AND (owner_id = $2 OR ($3::int IS NOT NULL AND school_id = $3))`,
      [bookId, request.user.id, schoolId])
    if (!rows[0]) return reply.status(404).send({ error: 'Книга не найдена' })
    const paragraphs = splitBookParagraphs(rows[0].content)
    const { rows: pr } = await db.query(
      'SELECT para_index FROM book_progress WHERE user_id = $1 AND book_id = $2', [request.user.id, bookId])
    const paraIndex = Math.min(pr[0]?.para_index ?? 0, Math.max(0, paragraphs.length - 1))
    return { id: rows[0].id, title: rows[0].title, target_lang: rows[0].target_lang, paragraphs, para_index: paraIndex }
  })

  // ── Сохранить закладку (на каком абзаце остановился) ──────────────────────────
  fastify.put('/api/books/:id/position', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const bookId = parseInt(request.params.id)
    const idx = Math.max(0, parseInt(request.body?.para_index) || 0)
    // Доступ: книга видна пользователю (своя или школьная)
    const schoolId = request.user.school_id ?? null
    const { rows } = await db.query(
      `SELECT id FROM books WHERE id = $1 AND (owner_id = $2 OR ($3::int IS NOT NULL AND school_id = $3))`,
      [bookId, request.user.id, schoolId])
    if (!rows[0]) return reply.status(404).send({ error: 'Книга не найдена' })
    await db.query(
      `INSERT INTO book_progress (user_id, book_id, para_index) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, book_id) DO UPDATE SET para_index = $3, updated_at = now()`,
      [request.user.id, bookId, idx])
    return { ok: true, para_index: idx }
  })

  // ── Учитель: загрузить книгу (PDF/TXT) + обложка ──────────────────────────────
  // multipart: поля title, target_lang; файлы file (обязательно) и cover (опц.).
  fastify.post('/api/books', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })

    let title = '', targetLang = request.headers['x-target-lang'] || 'de'
    let fileBuf = null, fileName = '', coverBuf = null
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'cover') coverBuf = await part.toBuffer()
          else { fileBuf = await part.toBuffer(); fileName = part.filename || '' }
        } else {
          if (part.fieldname === 'title') title = String(part.value || '').trim()
          if (part.fieldname === 'target_lang') targetLang = String(part.value || 'de')
        }
      }
    } catch (e) {
      if (e.code === 'FST_REQ_FILE_TOO_LARGE' || /too large/i.test(e.message || '')) {
        return reply.status(413).send({ error: 'Файл слишком большой (лимит 200 МБ).' })
      }
      throw e
    }
    if (!fileBuf) return reply.status(400).send({ error: 'Файл книги не получен' })

    // Извлекаем текст (PDF → pdftotext, TXT → как есть)
    const { text, sourceType } = await extractBookText(fileBuf, fileName)
    if (!text || text.length < 20) {
      return reply.status(400).send({ error: 'Не удалось извлечь текст. Для PDF нужен текстовый слой (не скан), либо загрузи TXT.' })
    }
    if (!title) title = (fileName.replace(/\.[^.]+$/, '') || 'Книга').slice(0, 200)
    const paraCount = splitBookParagraphs(text).length

    // Сначала создаём запись (нужен id для имени файла обложки), затем сохраняем обложку
    const { rows } = await db.query(
      `INSERT INTO books (owner_id, school_id, title, target_lang, source_type, content, char_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [request.user.id, request.user.school_id ?? null, title, targetLang, sourceType, text, text.length])
    const bookId = rows[0].id

    let coverUrl = null
    if (coverBuf) {
      try {
        coverUrl = await saveBookCover(coverBuf, bookId) + `?v=${Date.now()}`
        await db.query('UPDATE books SET cover_image_url = $1 WHERE id = $2', [coverUrl, bookId])
      } catch (e) { fastify.log.error({ bookId, err: e }, 'Ошибка сохранения обложки книги') }
    }
    return { id: bookId, title, source_type: sourceType, char_count: text.length, para_count: paraCount, cover_image_url: coverUrl }
  })

  // ── Учитель: обновить/добавить обложку отдельно ──────────────────────────────
  fastify.post('/api/books/:id/cover', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const bookId = parseInt(request.params.id)
    const { rows } = await db.query('SELECT id FROM books WHERE id = $1 AND owner_id = $2', [bookId, request.user.id])
    if (!rows[0]) return reply.status(404).send({ error: 'Книга не найдена' })
    let coverBuf = null
    for await (const part of request.parts()) {
      if (part.type === 'file') { coverBuf = await part.toBuffer(); break }
    }
    if (!coverBuf) return reply.status(400).send({ error: 'Обложка не получена' })
    const url = await saveBookCover(coverBuf, bookId) + `?v=${Date.now()}`
    await db.query('UPDATE books SET cover_image_url = $1 WHERE id = $2', [url, bookId])
    return { cover_image_url: url }
  })

  // ── Учитель: удалить книгу (каскадом уходит и book_progress) ──────────────────
  fastify.delete('/api/books/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const bookId = parseInt(request.params.id)
    const { rows } = await db.query('DELETE FROM books WHERE id = $1 AND owner_id = $2 RETURNING id', [bookId, request.user.id])
    if (!rows[0]) return reply.status(404).send({ error: 'Книга не найдена' })
    return { deleted: true }
  })
}
