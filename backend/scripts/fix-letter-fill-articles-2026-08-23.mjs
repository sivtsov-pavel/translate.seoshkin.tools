#!/usr/bin/env node
// «Добавь букву»: убираем дырки из артиклей.
//
// Найдено 23.08.2026 при разборе жалобы Павла на уроки 19 и 28: на бою 544 упражнения
// прячут буквы внутри артикля — «d_r Sport», «d__ N__l», «d_e C_la». Ученик угадывает
// буквы в «der/die/das» вместо того, чтобы тренировать слово, и род при этом не
// запоминается: артикль он как раз и не видит целиком. buildMask артикль не трогает
// давно, но isValidMask такие маски пропускал как годные — теперь нет (закреплено
// тестом backend/test/letter-fill.test.js).
//
// Скрипт перестраивает маску через ту же normalizeLetterFill, что стоит на генерации,
// поэтому результат совпадает с тем, что создаётся сейчас.
//
// Идемпотентный, $0 (ИИ не участвует). Без --apply печатает план.
//   node scripts/fix-letter-fill-articles-2026-08-23.mjs
//   node scripts/fix-letter-fill-articles-2026-08-23.mjs --apply
import { db } from '../src/db/index.js'
import { normalizeLetterFill, isValidMask } from '../src/services/letterFill.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')

const { rows } = await db.query(`
  SELECT e.id, e.payload, l.lesson_number
  FROM exercises e JOIN lessons l ON l.id = e.lesson_id
  WHERE e.type = 'letter_fill'`)

const broken = []
for (const r of rows) {
  const answer = String(r.payload?.answer || r.payload?.word_de || '').trim()
  if (!answer || isValidMask(r.payload?.masked, answer)) continue
  const fixed = normalizeLetterFill(r.payload)
  if (!fixed || fixed.masked === r.payload?.masked) continue
  broken.push({ id: r.id, lesson_number: r.lesson_number, answer, was: r.payload.masked, now: fixed.masked, payload: fixed })
}

console.log(`Упражнений «добавь букву»: ${rows.length}`)
console.log(`С негодной маской (дырка в артикле или битая): ${broken.length}`)
for (const b of broken.slice(0, 12)) {
  console.log(`  урок ${b.lesson_number ?? '—'}: «${b.answer}» · «${b.was}» → «${b.now}»`)
}

if (!APPLY) {
  console.log('\nЭто ПЛАН. Запусти с --apply, чтобы применить.')
  process.exit(0)
}

for (const b of broken) {
  await db.query('UPDATE exercises SET payload = $1 WHERE id = $2', [JSON.stringify(b.payload), b.id])
}
console.log(`Перестроено масок: ${broken.length}`)

await logOperation({
  kind: 'cleanup', status: 'ok', costUsd: 0, items: broken.length,
  message: `«Добавь букву»: перестроено ${broken.length} масок (дырки в артиклях)`,
  meta: { script: 'fix-letter-fill-articles-2026-08-23' },
})
process.exit(0)
