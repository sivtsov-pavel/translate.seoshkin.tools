import { db } from './src/db/index.js'
import { generateWordImage, isFunctionWord } from './src/services/imageGen.js'

const LIMIT = Number(process.env.LIMIT || 200)
// Только КОНКРЕТНЫЕ слова без картинок (служебные пропускаем)
const { rows: all } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.owner_id = 1 AND w.image_url IS NULL
   ORDER BY w.id`)
const rows = all.filter(w => !isFunctionWord(w.word_de)).slice(0, LIMIT)
console.log(`Без картинки: ${all.length}, служебных пропущено: ${all.length - all.filter(w => !isFunctionWord(w.word_de)).length}, генерирую: ${rows.length}`)

let ok = 0, fail = 0
for (const w of rows) {
  try {
    const url = await generateWordImage(w.word_de, w.translation_ru, w.id)
    if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); ok++; console.log('  ✓', w.word_de) }
    else { fail++; console.log('  ∅', w.word_de) }
  } catch (e) { fail++; console.log('  ✗', w.word_de, e.message?.slice(0, 50)) }
}
console.log(`ГОТОВО: ${ok}/${rows.length}, ошибок ${fail}`)
process.exit(0)
