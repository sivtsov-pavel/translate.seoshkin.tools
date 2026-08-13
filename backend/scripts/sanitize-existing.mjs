#!/usr/bin/env node
// Прогоняет существующие «заполни пропуск» через тот же конвейер очистки, что
// стоит на генерации: пропуск на месте, ответ среди вариантов, без повторов,
// глагол согласован с подлежащим.
//
// Нужен потому, что починка генератора не переписывает уже сгенерированное
// («данные важнее кода» — правило из OPERATIONS.md). Проверка системы показала
// 2 непроходимых упражнения и 6 с повторами вариантов.
//
// 💸 OpenAI НЕ вызывается — цена $0. Без --apply печатает план.
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { fixFillBlank, ensureBlank, dedupeOptions, fixAgreement } from '../src/services/fillBlankFix.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = '/tmp/sanitize-rollback.json'

const { rows } = await db.query(
  `SELECT e.id, e.payload, e.lesson_id FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   WHERE e.type = 'fill_blank' AND l.target_lang = 'de'`)

const fixed = [], dropped = []
for (const r of rows) {
  const cleaned = fixAgreement(dedupeOptions(fixFillBlank(ensureBlank(r.payload))))
  if (cleaned === null) { dropped.push(r); continue }
  if (JSON.stringify(cleaned) !== JSON.stringify(r.payload)) fixed.push({ ...r, next: cleaned })
}

console.log(`\nПроверено: ${rows.length}`)
console.log(`Чиним: ${fixed.length}`)
fixed.slice(0, 15).forEach(f => console.log(`   урок ${f.lesson_id}: «${f.payload.sentence}» ${f.payload.blank} → ${f.next.blank} [${(f.next.options || []).join(', ')}]`))
console.log(`Негодных (на удаление): ${dropped.length}`)
dropped.slice(0, 8).forEach(f => console.log(`   урок ${f.lesson_id}: «${f.payload.sentence}» ${f.payload.blank}`))

if (!APPLY) { console.log(`\nЭто план — ничего не изменено, OpenAI не вызывался.`); process.exit(0) }

writeFileSync(ROLLBACK, JSON.stringify({ fixed, dropped }, null, 1))
let n = 0
for (const f of fixed) {
  await db.query('UPDATE exercises SET payload = $1 WHERE id = $2', [JSON.stringify(f.next), f.id])
  n++
}
let removed = 0
if (dropped.length) {
  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1::int[])', [dropped.map(d => d.id)])
  removed = rowCount
}

await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0,
  message: `Очистка «заполни пропуск»: исправлено ${n}, удалено ${removed}`, meta: { rollback: ROLLBACK } }).catch(() => {})
console.log(`\nГотово ($0): исправлено ${n}, удалено ${removed}. Откат: ${ROLLBACK}`)
process.exit(0)
