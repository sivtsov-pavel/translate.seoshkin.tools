import { db } from '../db/index.js'
import { extractWordsFromImage } from '../services/claude.js'
import { unlink } from 'fs/promises'

// Личный словарь ученика: тетрадь → OCR → дедуп против уроков школы → добавляем НОВЫЕ.
const norm = s => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, '').trim()

export async function personalWordsRoutes(fastify) {
  // Список личных слов ученика (для активного изучаемого языка)
  fastify.get('/api/personal-words', { preHandler: [fastify.authenticate] }, async (request) => {
    const target = request.headers['x-target-lang'] || 'de'
    const { rows } = await db.query(
      'SELECT id, word, translation, image_url, status, created_at FROM personal_words WHERE user_id=$1 AND target_lang=$2 ORDER BY id DESC',
      [request.user.id, target])
    return rows
  })

  // Тетрадь ученика: фото → OCR → дедуп → добавить только новые (картинка из банка бесплатно)
  fastify.post('/api/personal-words/from-photo', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const part = await request.file()
    if (!part) return reply.status(400).send({ error: 'Нет фото' })
    const lang = request.query.lang || 'ru'
    const target = request.headers['x-target-lang'] || 'de'
    const userId = request.user.id

    // Простой предохранитель от расхода (OCR платный): не больше 200 слов в день
    const { rows: cnt } = await db.query(
      "SELECT count(*)::int AS n FROM personal_words WHERE user_id=$1 AND created_at::date=CURRENT_DATE", [userId])
    if (cnt[0].n > 200) return reply.status(429).send({ error: 'Дневной лимит слов исчерпан. Продолжи завтра.' })

    const { filepath } = await fastify.saveUploadedFile(part)
    let ocr = []
    try { ocr = await extractWordsFromImage(filepath, lang, target) }
    catch (e) { unlink(filepath).catch(() => {}); return reply.status(500).send({ error: 'Не удалось разобрать фото' }) }
    unlink(filepath).catch(() => {})

    const added = []
    let skipped = 0
    for (const w of ocr) {
      if (!w || !w.de) continue
      const base = norm(w.de)
      if (!base) continue
      // Уже есть в уроках СВОЕЙ школы? → не личное (выучит на уроке), пропускаем
      const inSchool = await db.query(
        `SELECT 1 FROM words wd JOIN lessons l ON l.id=wd.lesson_id
         WHERE l.school_id IS NOT DISTINCT FROM $1 AND l.target_lang=$2
           AND regexp_replace(lower(wd.word_de),'^(der|die|das|ein|eine)\\s+','')=$3 LIMIT 1`,
        [request.user.school_id ?? null, target, base])
      if (inSchool.rows.length) { skipped++; continue }
      // Картинка из банка по смыслу (перевод) — бесплатно
      let image = null
      const tr = String(w.tr || '').trim().toLowerCase()
      if (tr) {
        const img = await db.query("SELECT image_url FROM words WHERE lower(trim(translation_ru))=$1 AND image_url IS NOT NULL LIMIT 1", [tr])
        image = img.rows[0]?.image_url || null
      }
      const ins = await db.query(
        `INSERT INTO personal_words (user_id, target_lang, word, translation, image_url)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, target_lang, word) DO NOTHING
         RETURNING id, word, translation, image_url, status`,
        [userId, target, String(w.de).trim(), (w.tr || '').trim() || null, image])
      if (ins.rows[0]) added.push(ins.rows[0]); else skipped++
    }
    return { added, skipped }
  })

  // Статус слова (new/learning/known)
  fastify.patch('/api/personal-words/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { status } = request.body || {}
    if (!['new', 'learning', 'known'].includes(status)) return reply.status(400).send({ error: 'Неверный статус' })
    const { rows } = await db.query('UPDATE personal_words SET status=$1 WHERE id=$2 AND user_id=$3 RETURNING id, status',
      [status, request.params.id, request.user.id])
    if (!rows[0]) return reply.status(404).send({ error: 'Не найдено' })
    return rows[0]
  })

  fastify.delete('/api/personal-words/:id', { preHandler: [fastify.authenticate] }, async (request) => {
    await db.query('DELETE FROM personal_words WHERE id=$1 AND user_id=$2', [request.params.id, request.user.id])
    return { ok: true }
  })
}
