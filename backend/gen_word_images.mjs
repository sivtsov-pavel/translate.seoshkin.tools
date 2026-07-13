import { db } from './src/db/index.js'
import OpenAI from 'openai'
import { config } from './src/config.js'
import { downloadAndSave } from './src/services/unsplash.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const openai = new OpenAI({ apiKey: config.openaiApiKey })
const LESSON = Number(process.env.LESSON || 39)
const LIMIT = Number(process.env.LIMIT || 12)

function saveB64(b64, wordId) {
  const dir = join(config.uploadDir, 'word-images')
  mkdirSync(dir, { recursive: true })
  const filename = `word_${wordId}.png`
  writeFileSync(join(dir, filename), Buffer.from(b64, 'base64'))
  return `/uploads/word-images/${filename}`
}

async function genImage(prompt, wordId) {
  // 1) пробуем gpt-image-1 (base64)
  try {
    const r = await openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', n: 1 })
    if (r.data?.[0]?.b64_json) return saveB64(r.data[0].b64_json, wordId)
    if (r.data?.[0]?.url) return await downloadAndSave(r.data[0].url, wordId)
  } catch (e) { console.log('   gpt-image-1:', e.message) }
  // 2) фолбэк dall-e-2 (url)
  const r2 = await openai.images.generate({ model: 'dall-e-2', prompt, size: '512x512', n: 1 })
  return await downloadAndSave(r2.data[0].url, wordId)
}

const { rows } = await db.query(
  'SELECT id, word_de, translation_ru FROM words WHERE lesson_id=$1 AND image_url IS NULL ORDER BY id LIMIT $2',
  [LESSON, LIMIT])
console.log(`Генерирую ${rows.length} детских картинок для урока ${LESSON}...`)

for (const w of rows) {
  try {
    const prompt = `Simple cheerful flat vector illustration for a children's language flashcard. Show clearly: "${w.translation_ru}" (German word: ${w.word_de}). Cute minimalist cartoon, bright friendly colors, plain light background, one centered object or simple scene, thick clean outlines, kindergarten style. No text, no letters.`
    const localUrl = await genImage(prompt, w.id)
    if (localUrl) {
      await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [localUrl, w.id])
      console.log('  ✓', w.word_de, '→', w.translation_ru)
    } else console.log('  ∅', w.word_de)
  } catch (e) { console.log('  ✗', w.word_de, e.message) }
}
console.log('Готово.')
process.exit(0)
