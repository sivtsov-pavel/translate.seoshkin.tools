import { db } from './src/db/index.js'
import { generateWordImage } from './src/services/imageGen.js'

// Все слова уроков учителя, где картинка старая (не наша .png) или отсутствует
const { rows } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.owner_id = 1
     AND (w.image_url IS NULL OR w.image_url NOT LIKE '%word-images/word_%.png')
   ORDER BY w.id`)
console.log('К генерации:', rows.length)

let ok = 0, fail = 0
for (const w of rows) {
  try {
    const url = await generateWordImage(w.word_de, w.translation_ru, w.id)
    if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); ok++ }
    else fail++
  } catch (e) { fail++; console.log('✗', w.word_de, e.message?.slice(0, 50)) }
  if ((ok + fail) % 10 === 0) console.log(`  ${ok + fail}/${rows.length} (ok ${ok}, fail ${fail})`)
}
console.log(`ГОТОВО: ${ok}/${rows.length}, ошибок ${fail}`)
process.exit(0)
