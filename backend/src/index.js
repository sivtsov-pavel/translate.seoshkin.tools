import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import authPlugin from './plugins/auth.js'
import uploadPlugin from './plugins/upload.js'
import { authRoutes } from './routes/auth.js'
import { lessonsRoutes } from './routes/lessons.js'
import { mediaRoutes } from './routes/media.js'
import { runMigrationsOnStartup } from './db/migrations/run.js'

// Регистрация плагинов — выделено для переиспользования в тестах
export async function registerPlugins(app) {
  await app.register(cors, { origin: true })
  await app.register(authPlugin)
  await app.register(uploadPlugin)
}

async function registerRoutes(app) {
  await app.register(authRoutes)
  await app.register(lessonsRoutes)
  await app.register(mediaRoutes)
}

export async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })
  await registerPlugins(app)
  await registerRoutes(app)
  return app
}

// Точка входа — только при прямом запуске
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = await buildApp()
  await runMigrationsOnStartup()
  await app.listen({ port: config.port, host: config.host })
  console.log(`Backend запущен на http://${config.host}:${config.port}`)
}
