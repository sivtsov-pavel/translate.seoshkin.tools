import { chatWithTrainer } from '../services/claude.js'

export async function aiTrainerRoutes(fastify) {
  fastify.post('/api/ai-trainer/chat', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { messages, character, scenario, userLang } = request.body

    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({ error: 'messages required' })
    }

    // Обмежуємо глибину контексту — останні 20 повідомлень
    const trimmed = messages.slice(-20)

    try {
      const result = await chatWithTrainer({ messages: trimmed, character, scenario, userLang })
      return result
    } catch (e) {
      fastify.log.error(e)
      return reply.status(500).send({ error: e.message })
    }
  })
}
