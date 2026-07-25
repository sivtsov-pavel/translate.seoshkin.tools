// Генерация упражнений «Склонение» (conjugation) для немецких уроков — rule-based, БЕЗ OpenAI.
// Для слов-глаголов кладём упражнение с 6 формами Präsens (посчитаны конъюгатором).
// Аддитивно: существующие упражнения не трогаем, дубли не создаём. Запуск в backend-контейнере:
//   node scripts/gen-conjugation.mjs
import { db } from '../src/db/index.js'
import { conjugatePresent } from '../src/services/germanConjugator.js'

// Глагол-инфинитив: строчное слово, оканчивается строго на -en/-eln/-ern (не просто на -n:
// иначе ловим maskulin, braun, siebzehn). Плюс стоп-лист: числа, причастия, наречия/прилагат. на -en.
const STOP = new Set([
  // не-глаголы на -en
  'neben', 'oben', 'eben', 'sieben', 'gegen', 'wegen', 'denen', 'ihnen', 'innen', 'außen', 'unten',
  'hinten', 'morgen', 'eigen', 'offen', 'jeden', 'allen', 'seinen', 'meinen', 'deinen', 'keinen',
  'einen', 'ihren', 'unseren', 'diesen', 'welchen',
  // наречия/прилагательные/причастия и мусор, замеченные в данных
  'bisschen', 'draußen', 'drinnen', 'geschieden', 'gestern', 'vorgestern', 'übermorgen',
  'zusammen', 'verboten', 'tausen',
  // причастия II (ge…en) — не инфинитивы
  'gestorben', 'geboren', 'gegessen', 'geschrieben', 'gesprochen', 'gefunden', 'geschlafen',
  'geblieben', 'geworden', 'gewesen', 'genommen', 'gewonnen', 'gesehen', 'gelesen', 'getrunken',
  'gefahren', 'gegangen', 'gekommen', 'gewusst', 'geholfen',
])
const isVerb = w => /^[a-zäöüß]{3,}(en|eln|ern)$/.test(w) && !STOP.has(w)

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
