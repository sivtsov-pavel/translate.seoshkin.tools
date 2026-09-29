#!/usr/bin/env node
// Приводит номер В НАЗВАНИИ урока к его настоящему lesson_number.
//
// Откуда расхождение: разбивка тяжёлого урока сдвигает номера последующих
// уроков, а номер продублирован внутри строки названия («Урок 39: Языки»).
// После сдвига урок с номером 41 продолжал называться «Урок 39: …» — в списке
// уроков и на «Пути» это выглядит как два разных урока 39.
//
// Ничего не переводит и не тратит: правит только цифру в начале строки, причём
// и в title, и в переводах названия на локали. Идемпотентен.
//
//   node scripts/fix-lesson-title-numbers.mjs           # план
//   node scripts/fix-lesson-title-numbers.mjs --apply
import { db } from '../src/db/index.js'

const APPLY = process.argv.includes('--apply')
const RE = /^(\s*(?:Урок|Lektion|Lesson|Lección|Ders|Урок|Дарс)\s*)(\d+)(\s*[:.\-–])/iu

const { rows } = await db.query(
  `SELECT id, lesson_number, title, COALESCE(title_translations,'{}'::jsonb) AS tt
   FROM lessons WHERE is_set = false AND is_personal = false AND lesson_number IS NOT NULL
   ORDER BY target_lang, lesson_number`)

const plan = []
for (const l of rows) {
  const m = RE.exec(l.title || '')
  if (!m || Number(m[2]) === l.lesson_number) continue
  const title = l.title.replace(RE, `$1${l.lesson_number}$3`)
  const tt = {}
  for (const [lang, val] of Object.entries(l.tt)) {
    if (typeof val === 'string' && RE.test(val)) tt[lang] = val.replace(RE, `$1${l.lesson_number}$3`)
  }
  plan.push({ id: l.id, from: l.title, to: title, tt })
}

console.log(`\nУроков с чужим номером в названии: ${plan.length}`)
for (const p of plan) console.log(`  #${p.id}: «${p.from}» → «${p.to}»`)

if (!plan.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено.\n  node scripts/fix-lesson-title-numbers.mjs --apply`)
  process.exit(0)
}
for (const p of plan) {
  await db.query(
    `UPDATE lessons SET title = $1,
            title_translations = COALESCE(title_translations,'{}'::jsonb) || $2::jsonb WHERE id = $3`,
    [p.to, JSON.stringify(p.tt), p.id])
}
console.log(`\nГотово: исправлено ${plan.length}`)
process.exit(0)
