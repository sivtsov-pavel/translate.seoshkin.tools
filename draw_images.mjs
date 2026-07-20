// Дорисовка недостающих картинок с банк-дедупом по смыслу (translation_ru).
// Служебные слова (артикли/предлоги) пропускаем. Строго без текста на картинке.
import { db } from '/app/src/db/index.js'
import { generateWordImage, isFunctionWord } from '/app/src/services/imageGen.js'

const { rows: noimg } = await db.query(
  "SELECT id, word_de, translation_ru, (SELECT target_lang FROM lessons WHERE id=w.lesson_id) tl FROM words w WHERE image_url IS NULL ORDER BY id")
console.log('Слов без картинки:', noimg.length)
let drawn = 0, reused = 0, skipped = 0
for (const w of noimg) {
  if (isFunctionWord(w.word_de)) { skipped++; continue }
  const tr = String(w.translation_ru || '').trim().toLowerCase()
  // 1) переиспользуем картинку по тому же смыслу
  if (tr.length > 1) {
    const { rows } = await db.query("SELECT image_url FROM words WHERE lower(trim(translation_ru))=$1 AND image_url IS NOT NULL LIMIT 1", [tr])
    if (rows[0]?.image_url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [rows[0].image_url, w.id]); reused++; continue }
  }
  // 2) генерим новую
  try {
    const url = await generateWordImage(w.word_de, w.translation_ru, w.id, w.tl || 'de')
    if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); drawn++; console.log(`  ✎ ${w.word_de} — ${w.translation_ru}`) }
  } catch (e) { console.error('img', w.word_de, e.message) }
}
console.log(`ГОТОВО: сгенерено ${drawn}, переиспользовано ${reused}, пропущено служебных ${skipped}`)
process.exit(0)
