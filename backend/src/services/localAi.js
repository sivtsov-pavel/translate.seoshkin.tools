// Локальные модели на ноутбуке Павла (бесплатно, без OpenAI):
// тексты — Ollama (OpenAI-совместимый endpoint /v1), картинки — Draw Things
// (HTTP-сервер, совместимый с AUTOMATIC1111 /sdapi/v1/txt2img).
//
// Переключение — переменными окружения (см. config.js):
//   AI_TEXT_PROVIDER=local|openai   AI_IMAGE_PROVIDER=local|openai
// Правило денег: local ничего не тратит; openai тратит реальные деньги.
import OpenAI from 'openai'
import { config } from '../config.js'

// Клиент Ollama через OpenAI-совместимый API. Модель подменяется на локальную
// в любом вызове chat.completions.create — call-сайты править не нужно.
export function makeOllamaClient() {
  const client = new OpenAI({
    apiKey: 'ollama', // Ollama ключ не проверяет, но SDK требует непустой.
    baseURL: `${config.ollamaBaseUrl.replace(/\/$/, '')}/v1`,
  })
  const origCreate = client.chat.completions.create.bind(client.chat.completions)
  client.chat.completions.create = (params, opts) => {
    // Vision-запросы (картинки на вход) требуют мультимодальную модель.
    const hasImage = JSON.stringify(params?.messages || '').includes('image_url')
    const model = hasImage ? config.ollamaVisionModel : config.ollamaModel
    // response_format json_schema Ollama не поддерживает — оставляем json_object.
    const rf = params?.response_format?.type === 'json_schema'
      ? { type: 'json_object' }
      : params?.response_format
    return origCreate({ ...params, model, response_format: rf }, opts)
  }
  return client
}

// Генерация картинки локально через Draw Things. Возвращает Buffer (png) или null.
export async function generateImageLocally(prompt) {
  const url = `${config.drawThingsUrl.replace(/\/$/, '')}/sdapi/v1/txt2img`
  const body = {
    prompt,
    negative_prompt: 'text, letters, words, watermark, signature, blurry, deformed',
    width: 512,
    height: 512,
    steps: 12,
    cfg_scale: 5,
    sampler_name: 'DPM++ 2M Karras',
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`Draw Things ${res.status}`)
  const data = await res.json()
  const b64 = data?.images?.[0]
  if (!b64) throw new Error('Draw Things: пустой ответ')
  return Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
}

// Доступность локальных сервисов — для переключателя в интерфейсе.
export async function localAiHealth() {
  const out = { text: false, image: false, textModel: config.ollamaModel }
  try {
    const r = await fetch(`${config.ollamaBaseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(4000) })
    out.text = r.ok
  } catch { /* сервис не поднят */ }
  try {
    const r = await fetch(`${config.drawThingsUrl.replace(/\/$/, '')}/sdapi/v1/options`, { signal: AbortSignal.timeout(4000) })
    out.image = r.ok
  } catch { /* Draw Things не запущен */ }
  return out
}
