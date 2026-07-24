// Разовый БЕСПЛАТНЫЙ скрипт (без OpenAI): чинит спряжение в существующих fill_blank
// немецких уроков. GPT нередко кладёт в пропуск инфинитив («Ich fragen» вместо «Ich frage»).
// Правит UPDATE-ом того же упражнения → ID сохраняются, прогресс/история ученика НЕ теряются.
// Запуск внутри backend-контейнера: node scripts/fix-fillblank-conjugation.mjs
import { db } from '../src/db/index.js'
import { fixFillBlankConjugation } from '../src/services/germanConjugator.js'

const { rows } = await db.query(
  `SELECT e.id, e.lesson_id, e.payload
   FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   WHERE e.type = 'fill_blank' AND l.target_lang = 'de'
   ORDER BY e.id`
)
console.log(`Немецких fill_blank всего: ${rows.length}`)

let changed = 0
for (const r of rows) {
  const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
  const res = fixFillBlankConjugation(payload)
  if (res.changed) {
    await db.query('UPDATE exercises SET payload = $1 WHERE id = $2', [JSON.stringify(res.payload), r.id])
    changed++
    if (changed <= 30) console.log(`  урок ${r.lesson_id} #${r.id}: «${payload.blank}» → «${res.payload.blank}»  (${payload.sentence})`)
  }
}
console.log(`\nИсправлено спряжений: ${changed} из ${rows.length}. OpenAI НЕ вызывался (0$).`)
process.exit(0)
