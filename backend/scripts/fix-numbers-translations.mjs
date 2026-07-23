// Ремонт: один батч перевода слов (20 шт) в наборе «Числа» упал с ошибкой парсинга JSON от GPT.
// Догоняем переводом маленькими батчами по 5 — надёжнее для длинного JSON-ответа на 9 языков.
import { db } from '../src/db/index.js'
import { translateWordsToAllLangs } from '../src/services/claude.js'

const LESSON_ID = 551
const ACTIVE_LOCALES = ['ru', 'uk', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']

const { rows: missing } = await db.query(
  `SELECT id, word_de, translation_ru FROM words WHERE lesson_id = $1 AND (translations IS NULL OR translations = '{}') ORDER BY id`,
  [LESSON_ID])
console.log(`Без переводов: ${missing.length}`, missing.map(w => w.word_de).join(', '))
if (!missing.length) { console.log('Нечего чинить.'); process.exit(0) }

let count = 0
for (let i = 0; i < missing.length; i += 5) {
  const batch = missing.slice(i, i + 5)
  const wordTranslations = await translateWordsToAllLangs(batch, ACTIVE_LOCALES)
  for (const [id, t] of Object.entries(wordTranslations)) {
    await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(t), parseInt(id)])
    count++
  }
}
console.log(`Переведено: ${count}`)

const { rows: stillMissing } = await db.query(
  `SELECT word_de FROM words WHERE lesson_id = $1 AND (translations IS NULL OR translations = '{}')`, [LESSON_ID])
if (stillMissing.length) console.warn('Всё ещё без перевода:', stillMissing.map(r => r.word_de).join(', '))
else console.log('Все слова урока переведены.')
process.exit(0)
