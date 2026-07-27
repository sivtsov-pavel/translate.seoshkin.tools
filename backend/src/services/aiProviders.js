// Кто считает: платный OpenAI или бесплатные локальные модели на ноутбуке.
//
// Раньше режим задавался ТОЛЬКО переменными окружения — переключение требовало правки
// .env и перезапуска бэкенда. Теперь режим хранится в platform_settings и меняется
// тумблером в админке на живую. Приоритет: база → env → 'openai'.
//
// Почему дефолт именно 'openai': локальные модели доступны лишь там, где рядом поднят
// Ollama/Draw Things (ноутбук Павла). На сервере их нет, и молча уйти в неработающий
// режим хуже, чем остаться на платном.
import { db } from '../db/index.js'
import { config } from '../config.js'
import { refreshPlatformClient } from './openaiClient.js'
import { localAiHealth } from './localAi.js'

const VALID = new Set(['openai', 'local'])

// Значения из env — к ним возвращаемся, если в базе ничего не задано.
const envText = config.aiTextProvider
const envImage = config.aiImageProvider

export async function loadProviders() {
  try {
    const { rows } = await db.query('SELECT config FROM platform_settings WHERE id=1')
    const cfg = rows[0]?.config || {}
    apply({
      text: VALID.has(cfg.ai_text_provider) ? cfg.ai_text_provider : envText,
      image: VALID.has(cfg.ai_image_provider) ? cfg.ai_image_provider : envImage,
    })
  } catch (e) {
    // Нет таблицы/строки (первый запуск до миграций) — работаем на env.
    console.error('loadProviders:', e.message)
  }
  return current()
}

// Применить режим к живому конфигу и пересобрать клиент текстовых моделей.
function apply({ text, image }) {
  if (VALID.has(text)) config.aiTextProvider = text
  if (VALID.has(image)) config.aiImageProvider = image
  refreshPlatformClient()
}

export async function setProviders({ text, image }) {
  const next = {
    text: VALID.has(text) ? text : config.aiTextProvider,
    image: VALID.has(image) ? image : config.aiImageProvider,
  }
  await db.query(
    `UPDATE platform_settings
        SET config = COALESCE(config, '{}'::jsonb) || $1::jsonb
      WHERE id = 1`,
    [JSON.stringify({ ai_text_provider: next.text, ai_image_provider: next.image })])
  apply(next)
  return current()
}

export function current() {
  return { text: config.aiTextProvider, image: config.aiImageProvider }
}

// Полный статус для админки: режим + живы ли локальные службы + какие модели.
export async function providersStatus() {
  const health = await localAiHealth()
  return {
    text: {
      provider: config.aiTextProvider,
      model: config.aiTextProvider === 'local' ? config.ollamaModel : 'gpt-4o-mini',
      local_available: health.text,
    },
    image: {
      provider: config.aiImageProvider,
      model: config.aiImageProvider === 'local' ? 'Draw Things' : 'gpt-image-1',
      local_available: health.image,
    },
    env_defaults: { text: envText, image: envImage },
  }
}
