import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'
import { createWriteStream, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

// Убеждаемся что директория загрузок существует при старте
mkdirSync(config.uploadDir, { recursive: true })

async function uploadPlugin(fastify) {
  fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB

  // Хелпер для сохранения файла из multipart части
  fastify.decorate('saveUploadedFile', async function (part) {
    const ext = extname(part.filename) || '.bin'
    const filename = `${randomUUID()}${ext}`
    const filepath = join(config.uploadDir, filename)

    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filepath)
      part.file.pipe(stream)
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    return { filename, filepath }
  })
}

export default fp(uploadPlugin)
