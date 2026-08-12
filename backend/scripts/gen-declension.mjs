#!/usr/bin/env node
// Генерация упражнений «Падежи» (declension) для существительных — rule-based, БЕЗ OpenAI.
//
// Спряжение (conjugation) охватывает только глаголы: их 317 против 1029 существительных,
// поэтому в уроке было одно-два «Склонения» вместо десятка. Здесь закрываем остальное.
//
// Аддитивно: существующие упражнения не трогаем, дубли не создаём. Цена — $0.
//   node scripts/gen-declension.mjs           # план
//   node scripts/gen-declension.mjs --apply   # создать
import { db } from '../src/db/index.js'
import { declineNoun } from '../src/services/germanDeclension.js'

const APPLY = process.argv.includes('--apply')

const { rows } = await db.query(
  `SELECT w.id, w.lesson_id, w.word_de, w.translation_ru
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = 'de' ORDER BY w.id`)

let planned = 0, skipped = 0, dup = 0, created = 0
const samples = []

for (const w of rows) {
  const forms = declineNoun(w.word_de)
  if (!forms) { skipped++; continue }
  const ex = await db.query(
    `SELECT 1 FROM exercises WHERE word_id = $1 AND type = 'declension' LIMIT 1`, [w.id])
  if (ex.rowCount) { dup++; continue }
  planned++
  if (samples.length < 15) samples.push(`  ${w.word_de} → ${forms.akk} / ${forms.dat} / ${forms.gen}`)

  if (APPLY) {
    const payload = JSON.stringify({
      word_de: w.word_de, translation_ru: w.translation_ru,
      article: forms.article, noun: forms.noun,
      forms: { nom: forms.nom, akk: forms.akk, dat: forms.dat, gen: forms.gen },
    })
    await db.query(
      `INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, 'declension', $3)`,
      [w.lesson_id, w.id, payload])
    created++
  }
}

console.log(`\nСуществительных к склонению: ${planned}`)
console.log(`Уже есть: ${dup}. Пропущено (не существительные, слабое склонение, слэш): ${skipped}\n`)
console.log(samples.join('\n'))
console.log(APPLY
  ? `\nСоздано упражнений: ${created}. OpenAI НЕ вызывался (0$).`
  : `\nЭто только план — ничего не создано. Запуск: node scripts/gen-declension.mjs --apply`)
process.exit(0)
