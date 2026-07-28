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

// Клиент Ollama. Снаружи выглядит как OpenAI-клиент (call-сайты не меняются), но
// chat.completions.create ходит в РОДНОЙ /api/chat, а не в /v1-совместимую прослойку.
//
// Зачем родной API: у Ollama окно контекста по умолчанию 4096 токенов, а генерация
// упражнений просит ответ до 8192 — модель обрывала бы ответ на полуслове (ровно тот баг
// усечения, из-за которого старые уроки неполные). Задать num_ctx через /v1-прослойку
// НЕЛЬЗЯ: она принимает только OpenAI-поля. Оставался бы ручной `ollama create` с
// PARAMETER num_ctx на конкретной машине — настройка, которая не переживает переустановку.
// Родной эндпоинт принимает options.num_ctx явно, поэтому контекст живёт в коде.
export function makeOllamaClient() {
  const client = rawOllamaClient()
  client.chat.completions.create = async (params) => {
    // Vision-запросы (картинки на вход) требуют мультимодальную модель.
    const hasImage = JSON.stringify(params?.messages || '').includes('image_url')
    const model = hasImage ? config.ollamaVisionModel : config.ollamaModel
    // Ollama знает только format:"json"; json_schema не поддерживается.
    const wantsJson = params?.response_format?.type === 'json_schema'
      || params?.response_format?.type === 'json_object'
    // Контекст должен вмещать промпт И запрошенный ответ, иначе усечение.
    const numPredict = params?.max_tokens ?? config.ollamaNumPredict
    const numCtx = Math.max(config.ollamaNumCtx, numPredict * 2)

    const res = await fetch(`${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: params.messages,
        stream: false,
        ...(wantsJson ? { format: 'json' } : {}),
        options: {
          num_ctx: numCtx,
          num_predict: numPredict,
          ...(params.temperature != null ? { temperature: params.temperature } : {}),
        },
      }),
      signal: AbortSignal.timeout(config.ollamaTimeoutMs),
    })
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    // Приводим к форме ответа OpenAI — call-сайты читают choices[0].message.content и usage.
    return {
      choices: [{
        message: { role: 'assistant', content: data?.message?.content ?? '' },
        finish_reason: data?.done_reason === 'length' ? 'length' : 'stop',
      }],
      usage: {
        prompt_tokens: data?.prompt_eval_count ?? 0,
        completion_tokens: data?.eval_count ?? 0,
        total_tokens: (data?.prompt_eval_count ?? 0) + (data?.eval_count ?? 0),
      },
    }
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
        // «ONE word only» ломалось на многословных понятиях: «в парке» модель склеивала
        // в «Inpark», и картинка выходила бессмысленной. Просим назвать ПРЕДМЕТ, который
        // нужно нарисовать, и разрешаем короткую фразу.
        content: `Name in English the object or scene that should be drawn for this concept.\n`
          + `Answer with 1-3 English words only, nothing else. No explanations, no quotes.\n`
          + `Concept (Russian): "${translationRu}"${wordDe ? ` (original: "${wordDe}")` : ''}`,
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
