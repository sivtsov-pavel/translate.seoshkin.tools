import OpenAI from 'openai'
import { config } from '../config.js'
import { downloadAndSave } from './unsplash.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

function saveB64(b64, wordId) {
  const dir = join(config.uploadDir, 'word-images')
  mkdirSync(dir, { recursive: true })
  const filename = `word_${wordId}.png`
  writeFileSync(join(dir, filename), Buffer.from(b64, 'base64'))
  return `/uploads/word-images/${filename}`
}

// Генерирует «детсадовскую» иллюстрацию слова (как школьная карточка). Возвращает локальный URL.
// Пробует gpt-image-1 (base64), фолбэк — dall-e-2 (url).
export async function generateWordImage(wordDe, translationRu, wordId) {
  const prompt = `Simple cheerful flat vector illustration for a children's language flashcard. Show clearly: "${translationRu}" (German word: ${wordDe}). Cute minimalist cartoon, bright friendly colors, plain light background, one centered object or simple scene, thick clean outlines, kindergarten style. No text, no letters.`
  try {
    const r = await openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 })
    if (r.data?.[0]?.b64_json) return saveB64(r.data[0].b64_json, wordId)
    if (r.data?.[0]?.url) return await downloadAndSave(r.data[0].url, wordId)
  } catch (e) {
    console.error('gpt-image-1:', e.message)
  }
  try {
    const r2 = await openai.images.generate({ model: 'dall-e-2', prompt, size: '512x512', n: 1 })
    return await downloadAndSave(r2.data[0].url, wordId)
  } catch (e) {
    console.error('dall-e-2:', e.message)
    return null
  }
}
