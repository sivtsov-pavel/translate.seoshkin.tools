import { db } from '../db/index.js'
import { translateParagraphs } from '../services/claude.js'

export async function readerRoutes(fastify) {
  // Перевод абзацев немецкого текста на русский
  fastify.post('/api/reader/translate', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { paragraphs } = request.body
    if (!Array.isArray(paragraphs) || !paragraphs.length) {
      return reply.status(400).send({ error: 'paragraphs required' })
    }
    const filtered = paragraphs.map(p => p.trim()).filter(Boolean)
    if (!filtered.length) return reply.status(400).send({ error: 'empty paragraphs' })

    const translations = await translateParagraphs(filtered)
    return { translations: filtered.map((de, i) => ({ de, ru: translations[i] || '' })) }
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
