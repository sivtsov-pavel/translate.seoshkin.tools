import { db } from '../db/index.js'
import { translateParagraphs, translateSingle, extractWordsFromImage, extractSentencesFromImage } from '../services/claude.js'
import { saveCameraWords, distributeWordsToSets } from '../services/processor.js'
import { unlink } from 'fs/promises'

const MODEL_MAP = { smart: 'gpt-4o', mini: 'gpt-4o-mini' }

export async function readerRoutes(fastify) {
  // Камера: фото → извлекаем немецкие слова + перевод; помечаем какие уже в словаре
  fastify.post('/api/reader/camera', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const part = await request.file()
    if (!part) return reply.status(400).send({ error: 'Нет фото' })
    const lang = request.query.lang || 'ru'
    const target = request.headers['x-target-lang'] || 'de'
    const { filepath } = await fastify.saveUploadedFile(part)
    let words = []
    try {
      words = await extractWordsFromImage(filepath, lang, target)
    } catch (e) {
      fastify.log.error({ e }, 'camera extract')
      unlink(filepath).catch(() => {})
      return reply.status(500).send({ error: 'Не удалось разобрать фото' })
    }
    unlink(filepath).catch(() => {})
    // Помечаем какие слова уже есть в словаре (и берём их перевод на локаль)
    for (const w of words) {
      const bare = String(w.de).toLowerCase().replace(/^(der|die|das)\s+/i, '').trim()
      const { rows } = await db.query(
        `SELECT translation_ru, COALESCE(translations,'{}') AS translations
         FROM words WHERE LOWER(word_de)=$1 OR LOWER(word_de)=$2 LIMIT 1`,
        [String(w.de).toLowerCase(), bare])
      w.inDict = rows.length > 0
      if (rows[0]) w.tr = (rows[0].translations && rows[0].translations[lang]) || rows[0].translation_ru || w.tr
    }
    return { words }
  })

  // Фото ПРЕДЛОЖЕНИЙ: абзац + перевод + разбор по словам (каждое слово помечаем — есть ли в словаре)
  fastify.post('/api/reader/camera-sentences', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const part = await request.file()
    if (!part) return reply.status(400).send({ error: 'Нет фото' })
    const lang = request.query.lang || 'ru'
    const target = request.headers['x-target-lang'] || 'de'
    const { filepath } = await fastify.saveUploadedFile(part)
    let sentences = []
    try {
      sentences = await extractSentencesFromImage(filepath, lang, target)
    } catch (e) {
      fastify.log.error({ e }, 'camera sentences')
      unlink(filepath).catch(() => {})
      return reply.status(500).send({ error: 'Не удалось разобрать фото' })
    }
    unlink(filepath).catch(() => {})
    // Помечаем слова разбора: есть ли в словаре + перевод на локаль
    for (const s of sentences) {
      for (const w of (s.words || [])) {
        const bare = String(w.de).toLowerCase().replace(/^(der|die|das)\s+/i, '').trim()
        const { rows } = await db.query(
          `SELECT translation_ru, COALESCE(translations,'{}') AS translations
           FROM words WHERE LOWER(word_de)=$1 OR LOWER(word_de)=$2 LIMIT 1`,
          [String(w.de).toLowerCase(), bare])
        w.inDict = rows.length > 0
        if (rows[0]) w.tr = (rows[0].translations && rows[0].translations[lang]) || rows[0].translation_ru || w.tr
      }
    }
    return { sentences }
  })

  // Сохранить слова с фото в УРОК (существующий или новый набор) — учитель.
  // words: [{de, tr}]. Генерация упражнений идёт в фоне.
  fastify.post('/api/reader/save-to-lesson', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { lesson_id, title, words } = request.body || {}
    if (!Array.isArray(words) || !words.length) return reply.status(400).send({ error: 'Нет слов' })
    const target = request.headers['x-target-lang'] || 'de'
    let lid = lesson_id ? parseInt(lesson_id) : null
    if (!lid) {
      const { rows } = await db.query(
        "INSERT INTO lessons (owner_id, title, date, status, target_lang) VALUES ($1,$2,CURRENT_DATE,'processing',$3) RETURNING id",
        [request.user.id, (title && title.trim()) || '📷 Слова с фото', target])
      lid = rows[0].id
    } else {
      await db.query("UPDATE lessons SET status='processing' WHERE id=$1", [lid])
    }
    saveCameraWords(lid, words).catch(e => fastify.log.error({ e }, 'saveCameraWords'))
    return { lesson_id: lid, started: true }
  })

  // 🎯 Авто-разложить слова по тематическим наборам (анти-свалка): AI относит каждое слово
  // в верную из 22 тем, нормализует артикли, дедуплицирует. Слова оседают в нужных наборах.
  fastify.post('/api/reader/distribute', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const { words } = request.body || {}
    if (!Array.isArray(words) || !words.length) return reply.status(400).send({ error: 'Нет слов' })
    const target = request.headers['x-target-lang'] || 'de'
    try {
      const res = await distributeWordsToSets(words, request.user.id, target)
      return res
    } catch (e) {
      fastify.log.error({ e }, 'distribute')
      return reply.status(500).send({ error: 'Не удалось разложить слова' })
    }
  })

  // Перевод абзацев с выбором языковой пары
  fastify.post('/api/reader/translate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { paragraphs, sourceLang = 'de', targetLang = 'ru', model = 'smart' } = request.body
    if (!Array.isArray(paragraphs) || !paragraphs.length) {
      return reply.status(400).send({ error: 'paragraphs required' })
    }
    const filtered = paragraphs.map(p => p.trim()).filter(Boolean)
    if (!filtered.length) return reply.status(400).send({ error: 'empty paragraphs' })

    const gptModel = MODEL_MAP[model] || 'gpt-4o-mini'
    const translations = await translateParagraphs(filtered, sourceLang, targetLang, gptModel)
    return { translations: filtered.map((original, i) => ({ original, translation: translations[i] || '' })) }
  })

  // Перевод одной фразы для режима разговора
  fastify.post('/api/reader/speak-translate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { text, sourceLang = 'de', targetLang = 'ru', model = 'smart' } = request.body
    if (!text?.trim()) return reply.status(400).send({ error: 'text required' })
    const gptModel = MODEL_MAP[model] || 'gpt-4o-mini'
    const translation = await translateSingle(text.trim(), sourceLang, targetLang, gptModel)
    return { translation }
  })

  // Собрать текст из примеров слов урока
  fastify.get('/api/lessons/:id/reader-text', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = parseInt(request.params.id)
    const { rows: words } = await db.query(
      `SELECT word_de, translation_ru, example_sentence, example_sentence_ru
       FROM words
       WHERE lesson_id = $1
         AND example_sentence IS NOT NULL
         AND example_sentence != ''
       ORDER BY id`,
      [lessonId]
    )
    if (!words.length) return { text: '', wordCount: 0 }

    // Один абзац = одно примерное предложение
    const text = words.map(w => w.example_sentence).join('\n\n')
    return { text, wordCount: words.length }
  })

  // Список уроков для выбора в читалке
  fastify.get('/api/reader/lessons', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const { rows } = await db.query(
      `SELECT l.id, l.title, l.title_translations,
              COUNT(w.id) FILTER (WHERE w.example_sentence IS NOT NULL AND w.example_sentence != '') AS sentences_count
       FROM lessons l
       LEFT JOIN words w ON w.lesson_id = l.id
       WHERE l.status = 'done'
       GROUP BY l.id, l.title, l.title_translations
       HAVING COUNT(w.id) FILTER (WHERE w.example_sentence IS NOT NULL AND w.example_sentence != '') > 0
       ORDER BY l.id`
    )
    return rows
  })
}
