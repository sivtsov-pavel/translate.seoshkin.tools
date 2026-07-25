// Генерация упражнений «Склонение» (conjugation) для немецких уроков — rule-based, БЕЗ OpenAI.
// Для слов-глаголов кладём упражнение с 6 формами Präsens (посчитаны конъюгатором).
// Аддитивно: существующие упражнения не трогаем, дубли не создаём. Запуск в backend-контейнере:
//   node scripts/gen-conjugation.mjs
import { db } from '../src/db/index.js'
import { conjugatePresent } from '../src/services/germanConjugator.js'

// Строчные слова на -en/-n длиной ≥4 считаем глаголами. Стоп-лист — частые НЕ-глаголы на -en.
const STOP = new Set(['neben', 'oben', 'eben', 'sieben', 'gegen', 'wegen', 'denen', 'ihnen', 'innen', 'außen', 'unten', 'hinten', 'vorne', 'morgen', 'abend', 'wenn', 'denn', 'dann', 'schon', 'eigen', 'offen', 'gerne', 'gern', 'jeden', 'allen', 'seinen', 'meinen', 'deinen', 'keinen', 'einen'])
const isVerb = w => /^[a-zäöüß]{4,}e?n$/.test(w) && !STOP.has(w)

const { rows } = await db.query(
  `SELECT w.id, w.lesson_id, w.word_de, w.translation_ru
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = 'de' ORDER BY w.id`
)
console.log(`Немецких слов: ${rows.length}`)

let created = 0, skipped = 0, dup = 0
for (const w of rows) {
  const inf = (w.word_de || '').trim()
  if (!isVerb(inf)) { skipped++; continue }
  const ex = await db.query(`SELECT 1 FROM exercises WHERE word_id = $1 AND type = 'conjugation' LIMIT 1`, [w.id])
  if (ex.rowCount) { dup++; continue }
  const forms = conjugatePresent(inf)
  if (!forms) { skipped++; continue }
  const payload = JSON.stringify({ infinitive: inf, translation_ru: w.translation_ru, forms })
  await db.query(`INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, 'conjugation', $3)`, [w.lesson_id, w.id, payload])
  created++
  if (created <= 25) console.log(`  урок ${w.lesson_id}: ${inf} → ${forms.ich}/${forms.du}/${forms.er}…`)
}
console.log(`\nСоздано conjugation: ${created}, дублей: ${dup}, не-глаголы: ${skipped}. OpenAI НЕ вызывался (0$).`)
process.exit(0)
