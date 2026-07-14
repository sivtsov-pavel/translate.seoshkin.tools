import { db } from '../db/index.js'

// «Поделиться карточкой»: отдаём данные одного слова по id, чтобы другой ученик
// открыл ссылку /w/:id и увидел карточку (слово, перевод, картинка, пример, озвучка).
export async function shareRoutes(fastify) {
  fastify.get('/api/share/word/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (!id) return reply.status(400).send({ error: 'bad id' })
    const { rows } = await db.query(
      `SELECT w.id, w.word_de, w.translation_ru, w.translations, w.image_url,
              w.example_sentence, w.example_sentence_ru,
              COALESCE(l.target_lang, 'de') AS target_lang
       FROM words w
       LEFT JOIN lessons l ON l.id = w.lesson_id
       WHERE w.id = $1`,
      [id]
    )
    if (!rows.length) return reply.status(404).send({ error: 'not found' })
    return rows[0]
  })
}
