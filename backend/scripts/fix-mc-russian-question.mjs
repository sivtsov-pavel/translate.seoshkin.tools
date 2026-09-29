#!/usr/bin/env node
// «Выбери ответ», где в вопросе стоит РУССКИЙ перевод вместо изучаемого слова.
//
// Вопрос вида «Wie heißt das auf Russisch: Украина?» сам показывает ответ —
// упражнение проходится не глядя. Заметно это на именах и странах, где формы
// похожи (Ukraine/Украина, Alexander/Александр), и генератор их путал.
//
// Чинится детерминированно: слово после двоеточия заменяется на word_de того же
// упражнения. ИИ не нужен — правильное слово уже лежит в словаре.
//
// Родственный fix-orphan-mc.mjs делает то же самое, но только для упражнений БЕЗ
// привязки к слову (word_id NULL). Здесь привязка есть — просто вопрос собран
// неверно.
//
// 💸 OpenAI НЕ вызывается — цена $0. Идемпотентен: повторный запуск находит 0.
//
//   node scripts/fix-mc-russian-question.mjs           # план
//   node scripts/fix-mc-russian-question.mjs --apply
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = `/tmp/mc-russian-question-rollback-${new Date().toISOString().slice(0, 10)}.json`

const { rows } = await db.query(
  `SELECT e.id, e.lesson_id, e.payload, w.word_de, w.translation_ru
   FROM exercises e JOIN words w ON w.id = e.word_id
   JOIN lessons l ON l.id = e.lesson_id
   WHERE e.type = 'multiple_choice'
     AND l.target_lang IN ('de','en','es','fr','it','pt')
     AND e.payload->>'question' ~ '[А-Яа-яЁё]'
   ORDER BY e.id`)

// Слово из вопроса — после последнего двоеточия, без вопросительного знака
const qWord = (q) => String(q || '').split(':').pop().replace(/[?？]/g, '').trim()

const plan = []
for (const r of rows) {
  const w = qWord(r.payload?.question)
  // Правим ТОЛЬКО когда в вопросе стоит ровно перевод этого же слова. Любое
  // другое расхождение — повод посмотреть глазами, а не угадывать: правило с
  // исключениями хуже, чем его отсутствие (docs/OPERATIONS.md).
  if (w.toLowerCase() !== String(r.translation_ru || '').trim().toLowerCase()) {
    console.log(`  ✋ #${r.id}: в вопросе «${w}», а перевод слова «${r.translation_ru}» — не трогаю`)
    continue
  }
  const question = String(r.payload.question).replace(w, r.word_de)
  plan.push({ id: r.id, lesson_id: r.lesson_id, was: r.payload.question, now: question, payload: r.payload })
}

console.log(`\nВопросов с русским словом вместо изучаемого: ${plan.length}`)
for (const p of plan) console.log(`  ✏️ #${p.id} урок ${p.lesson_id}: «${p.was}» → «${p.now}»`)

if (!plan.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено.\n  node scripts/fix-mc-russian-question.mjs --apply`)
  process.exit(0)
}

writeFileSync(ROLLBACK, JSON.stringify(plan.map(p => ({ id: p.id, payload: p.payload })), null, 2))
console.log(`\nОткат записан: ${ROLLBACK}`)

for (const p of plan) {
  // payload_translations не трогаем: там переведены ВАРИАНТЫ ответа, а меняется
  // только слово в вопросе, и оно на изучаемом языке — перевода не требует.
  await db.query(
    `UPDATE exercises SET payload = jsonb_set(payload, '{question}', to_jsonb($1::text)) WHERE id = $2`,
    [p.now, p.id])
}
await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0, items: plan.length,
  message: `«Выбери ответ»: русское слово в вопросе заменено на изучаемое (${plan.length})` }).catch(() => {})
console.log(`\nГотово: исправлено ${plan.length}`)
process.exit(0)
