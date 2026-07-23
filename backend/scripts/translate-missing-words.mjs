// Разовый скрипт: догенерировать words.translations для слов курсов de/en, где перевод пуст.
// Переиспользует существующую translateWordsToAllLangs (gpt-4o-mini, батчи по 20) — тот же код,
// что и админ-кнопка «Слова → 10 языков». Запуск внутри backend-контейнера: node scripts/translate-missing-words.mjs
import { db } from '../src/db/index.js'
import { translateWordsToAllLangs } from '../src/services/claude.js'

const { rows } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE (w.translations IS NULL OR w.translations = '{}' OR NOT (w.translations ? 'sq'))
     AND l.target_lang IN ('de', 'en')
   ORDER BY w.id`
)
console.log(`Найдено слов без переводов (de/en): ${rows.length}`)

let updated = 0
const results = await translateWordsToAllLangs(rows)
for (const [id, t] of Object.entries(results)) {
  await db.query(
    'UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2',
    [JSON.stringify(t), parseInt(id)]
  )
  updated++
}
console.log(`Обновлено слов: ${updated} из ${rows.length}`)
process.exit(0)
