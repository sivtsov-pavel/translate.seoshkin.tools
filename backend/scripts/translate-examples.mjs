#!/usr/bin/env node
// Перевод примеров-предложений для слов, у которых он не заполнен.
//
// Во флеш-карте под немецким примером идёт строка с переводом. У 861 слова она
// пуста — ученик видит фразу и не понимает её целиком, хотя само слово знает.
//
// Служебные слова пропускаем: у них своя судьба (грамматические упражнения).
//
// 💸 Тратит OpenAI (gpt-4o-mini) батчами по 25: ориентир $0.02. Одобрено Павлом 13.08.2026.
//
//   node scripts/translate-examples.mjs          # смета
//   node scripts/translate-examples.mjs --run
import { db } from '../src/db/index.js'
import { translateSentences, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const RUN = process.argv.includes('--run')
const BATCH = 25

const { rows } = await db.query(
  `SELECT w.id, w.example_sentence FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE w.example_sentence IS NOT NULL AND w.example_sentence <> ''
     AND w.example_sentence_ru IS NULL AND NOT w.is_function_word
   ORDER BY w.id`)

console.log(`\nПримеров без перевода: ${rows.length}`)
console.log(`Батчей по ${BATCH}: ${Math.ceil(rows.length / BATCH)}, ориентир $${(rows.length * 0.00002).toFixed(3)}\n`)

if (!RUN) { console.log('Это смета. Запуск: --run'); process.exit(0) }

resetUsage()
let done = 0, failed = 0

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  try {
    const res = await translateSentences(batch.map(r => ({ id: r.id, sentence: r.example_sentence })))
    for (const r of res) {
      if (!r.translation) { failed++; continue }
      await db.query('UPDATE words SET example_sentence_ru = $1 WHERE id = $2', [r.translation, r.id])
      done++
    }
  } catch (e) {
    failed += batch.length
    console.error(`  ✗ батч ${Math.floor(i / BATCH) + 1}: ${e.message}`)
  }
  if ((i / BATCH) % 10 === 9) console.log(`… ${Math.min(i + BATCH, rows.length)}/${rows.length}, $${usageCostUSD().toFixed(3)}`)
}

const cost = usageCostUSD()
await logOperation({ kind: 'translate', status: 'ok', costUsd: cost,
  message: `Переводы примеров: ${done} из ${rows.length}` }).catch(() => {})
console.log(`\nГотово: переведено ${done}, не вышло ${failed}. Потрачено: $${cost.toFixed(4)}`)
process.exit(0)
