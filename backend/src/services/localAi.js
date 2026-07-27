// Локальные модели на ноутбуке Павла (бесплатно, без OpenAI):
// тексты — Ollama (OpenAI-совместимый endpoint /v1), картинки — Draw Things
// (HTTP-сервер, совместимый с AUTOMATIC1111 /sdapi/v1/txt2img).
//
// Переключение — переменными окружения (см. config.js):
//   AI_TEXT_PROVIDER=local|openai   AI_IMAGE_PROVIDER=local|openai
// Правило денег: local ничего не тратит; openai тратит реальные деньги.
import OpenAI from 'openai'
import { config } from '../config.js'

// Голый OpenAI-клиент, направленный на Ollama: модель берётся из параметров вызова.
// Нужен для микро-задач с явной моделью (см. conceptToEnglish).
function rawOllamaClient() {
  return new OpenAI({
    apiKey: 'ollama', // Ollama ключ не проверяет, но SDK требует непустой.
    baseURL: `${config.ollamaBaseUrl.replace(/\/$/, '')}/v1`,
  })
}

// Клиент Ollama через OpenAI-совместимый API. Модель подменяется на локальную
// в любом вызове chat.completions.create — call-сайты править не нужно.
export function makeOllamaClient() {
  const client = rawOllamaClient()
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

// Чистим ответ локальной модели до голого понятия: qwen3 любит рассуждать в <think>…</think>,
// добавлять кавычки, точки и пояснения. Берём первую содержательную строку, максимум 3 слова.
export function cleanConcept(raw) {
  const text = String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')   // рассуждения qwen3
    .trim()
  // Незакрытый <think> = генерацию оборвало на рассуждениях, самого ответа нет.
  // Тащить обрывок мысли в промпт картинки нельзя — лучше отдать пусто и уйти в фолбэк.
  if (/<think>/i.test(text)) return ''
  const line = text.split('\n').map(s => s.trim()).find(Boolean) || ''
  const words = line
    .replace(/^["'«»`*\-–—\s]+|["'«»`*.!?,;:\s]+$/g, '') // кавычки/пунктуация по краям
    .split(/\s+/)
    .filter(w => /[a-zA-Z]/.test(w))               // отбрасываем не-латиницу (модель могла ответить по-русски)
    .slice(0, 3)
  return words.join(' ')
}

// Понятие для картинки — по-английски. Локальные диффузионные модели русский НЕ понимают:
// «стол» они рисуют как НАДПИСЬ «СТОЛ» вместо стола. Перевод локальной моделью бесплатен.
// Модель — БЫСТРАЯ (llama3.1:8b), а не основная: замерено на M4, одно слово —
// llama3.1:8b 6 с против qwen3:14b 2 мин 21 с (та «размышляет»), ответ одинаковый «table».
// Возвращает английское слово/короткую фразу или null, если модель не ответила.
export async function conceptToEnglish(translationRu, wordDe) {
  try {
    const client = rawOllamaClient()
    const r = await client.chat.completions.create({
      model: config.ollamaFastModel,
      messages: [{
        role: 'user',
        content: `Translate this word to English. Answer with ONE English word only, nothing else.\n`
          + `Russian: "${translationRu}"${wordDe ? ` (target: "${wordDe}")` : ''}`,
      }],
      temperature: 0,
      max_tokens: 500, // запас на <think> у qwen3, сам ответ — одно слово
    })
    return cleanConcept(r.choices?.[0]?.message?.content) || null
  } catch (e) {
    console.error('conceptToEnglish:', e.message)
    return null
  }
}

// Генерация картинки локально через Draw Things. Возвращает Buffer (png) или null.
export async function generateImageLocally(prompt) {
  const url = `${config.drawThingsUrl.replace(/\/$/, '')}/sdapi/v1/txt2img`
  const body = {
    prompt,
    negative_prompt: 'text, letters, words, watermark, signature, blurry, deformed',
    width: 512,
    height: 512,
    // z-image-turbo: 4 шага достаточно (turbo-модель), cfg низкий.
    // На M4 одна карточка ~2.5 минуты — генерацию ставим в фон, не в запрос.
    steps: 4,
    cfg_scale: 2,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600000),
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
