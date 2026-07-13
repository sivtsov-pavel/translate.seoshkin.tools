import { db } from './src/db/index.js'
import { generateWordImage } from './src/services/imageGen.js'

const LESSON = Number(process.env.LESSON || 39)
const LIMIT = Number(process.env.LIMIT || 100)

const { rows } = await db.query(
  'SELECT id, word_de, translation_ru FROM words WHERE lesson_id=$1 AND image_url IS NULL ORDER BY id LIMIT $2',
  [LESSON, LIMIT])
console.log(`Генерирую ${rows.length} детских картинок для урока ${LESSON} (gpt-image-1 medium)...`)

let ok = 0
for (const w of rows) {
  try {
    const url = await generateWordImage(w.word_de, w.translation_ru, w.id)
    if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); ok++; console.log('  ✓', w.word_de) }
    else console.log('  ∅', w.word_de)
  } catch (e) { console.log('  ✗', w.word_de, e.message) }
}
console.log(`Готово: ${ok}/${rows.length}`)
process.exit(0)
