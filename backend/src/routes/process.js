import { processLesson } from '../services/processor.js'

export async function processRoutes(fastify) {
  fastify.post('/api/lessons/:id/process', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = parseInt(request.params.id)
    const ownerId = request.user.id

    // Обработка синхронная для MVP — для больших файлов можно сделать async с polling
    const result = await processLesson(lessonId, ownerId)
    return result
  })
}
