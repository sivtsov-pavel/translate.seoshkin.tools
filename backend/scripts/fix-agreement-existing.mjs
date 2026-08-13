#!/usr/bin/env node
// Прогоняет ВСЕ существующие «заполни пропуск» через проверку согласования.
//
// Новая защита в sanitizeExercise ловит «Ich ___ das Buch → nehmen» только на
// генерации, а в базе такие упражнения уже лежат. Здесь чиним их разом.
//
// Где форма выводится надёжно (ich/wir/ihr) — правим ответ и вариант. Где нет
// (du/er/es у сильных глаголов) — только помечаем в отчёте: такие идут на
// перегенерацию отдельным шагом, наугад спрягать нельзя.
//
// 💸 OpenAI НЕ вызывается — цена $0. Без --apply печатает план.
//
//   node scripts/fix-agreement-existing.mjs
//   node scripts/fix-agreement-existing.mjs --apply
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { fixAgreement } from '../src/services/fillBlankFix.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = '/tmp/agreement-rollback.json'

const { rows } = await db.query(
  `SELECT e.id, e.payload, w.word_de, l.id AS lesson_id
   FROM exercises e JOIN words w ON w.id = e.word_id JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = 'de' AND e.type = 'fill_blank'
     AND e.payload->>'sentence' ~* '^\\s*(ich|du|er|es|ihr|wir)\\s+___'`)

const fixable = [], hopeless = []
for (const r of rows) {
  const out = fixAgreement(r.payload)
  if (out === null) { hopeless.push(r); continue }
  if (out !== r.payload && out.blank !== r.payload.blank) fixable.push({ ...r, next: out })
}

console.log(`\nПроверено «заполни пропуск» с подлежащим впереди: ${rows.length}`)
console.log(`Чиним точно (ich/wir/ihr): ${fixable.length}`)
fixable.slice(0, 12).forEach(f => console.log(`   урок ${f.lesson_id}: «${f.payload.sentence}» ${f.payload.blank} → ${f.next.blank}`))
console.log(`На перегенерацию (du/er/es, сильные глаголы): ${hopeless.length}`)
hopeless.slice(0, 8).forEach(f => console.log(`   урок ${f.lesson_id}: «${f.payload.sentence}» ${f.payload.blank}`))

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено, OpenAI не вызывался.`)
  process.exit(0)
}

writeFileSync(ROLLBACK, JSON.stringify({ fixable, hopeless }, null, 1))
let n = 0
for (const f of fixable) {
  await db.query('UPDATE exercises SET payload = $1 WHERE id = $2', [JSON.stringify(f.next), f.id])
  n++
}

// Негодные удаляем: слову останутся другие типы, а битое упражнение мозолит глаза
// ученику каждый день. Перегенерация подхватит слово штатным ходом.
let removed = 0
if (hopeless.length) {
  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1::int[])', [hopeless.map(h => h.id)])
  removed = rowCount
}

await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0,
  message: `Согласование: исправлено ${n}, удалено негодных ${removed}`,
  meta: { rollback: ROLLBACK } }).catch(() => {})

console.log(`\nГотово ($0): исправлено ${n}, удалено негодных ${removed}`)
console.log(`Откат: ${ROLLBACK}`)
process.exit(0)
