#!/usr/bin/env node
// Замена упоминаний России на Украину в учебном материале (просьба Павла).
//
// Тонкость, из-за которой нельзя обойтись простым поиском-заменой: «Russland» —
// среднего рода и без артикля («aus Russland», «Russland ist groß»), а «Ukraine» —
// женского и всегда с артиклем («aus der Ukraine», «Die Ukraine ist groß»).
// Поэтому правим по правилам склонения, а не строкой.
//
// 💸 OpenAI НЕ вызывается — цена $0. Без --apply печатает план.
//
//   node scripts/fix-country-mentions.mjs           # план
//   node scripts/fix-country-mentions.mjs --apply   # заменить
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = '/tmp/country-rollback.json'

// Порядок важен: сначала длинные конструкции с предлогами, потом одиночное слово
const RULES = [
  [/\baus\s+Russland\b/g,        'aus der Ukraine'],
  [/\bnach\s+Russland\b/g,       'in die Ukraine'],
  [/\bin\s+Russland\b/g,         'in der Ukraine'],
  [/\bvon\s+Russland\b/g,        'von der Ukraine'],
  [/\bdas\s+Russland\b/g,        'die Ukraine'],
  [/\bRussland\b/g,              'die Ukraine'],
  [/\bMoskau\b/g,                'Kyjiw'],
  // ВНИМАНИЕ: «Russisch» НЕ трогаем. Это язык, а не страна: вопрос
  // «Wie heißt das auf Russisch: der Sport?» означает «как это по-русски»,
  // и ответы в нём русские. Замена сделала бы упражнение неверным.
  // Русская сторона
  [/\bиз\s+России\b/g,           'из Украины'],
  [/\bв\s+Россию\b/g,            'в Украину'],
  [/\bв\s+России\b/g,            'в Украине'],
  [/\bРоссия\b/g,                'Украина'],
  [/\bРоссии\b/g,                'Украины'],
  [/\bроссийск(ий|ая|ое|ие)\b/g, 'украинск$1'],
  [/\bМосква\b/g,                'Киев'],
  [/\bМоскву\b/g,                'Киев'],
  [/\bМоскве\b/g,                'Киеве'],
]

// «Die Ukraine ist groß» — предложение начинается с артикля, а не со слова
const fixSentenceStart = (s) => s.replace(/^die\s+Ukraine\b/, 'Die Ukraine')

function convert(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [re, to] of RULES) out = out.replace(re, to)
  return fixSentenceStart(out)
}

function convertDeep(value) {
  if (typeof value === 'string') return convert(value)
  if (Array.isArray(value)) return value.map(convertDeep)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = convertDeep(v)
    return out
  }
  return value
}

const HIT = /Russland|Moskau|Росси|Москв/i

// ── Слова ─────────────────────────────────────────────────────────────────────
const { rows: words } = await db.query(
  `SELECT id, word_de, translation_ru, example_sentence, example_sentence_ru, translations
   FROM words
   WHERE word_de ~* 'Russland|Moskau' OR translation_ru ~* 'Росси|Москв'
      OR example_sentence ~* 'Russland|Moskau' OR example_sentence_ru ~* 'Росси|Москв'`)

// ── Упражнения ────────────────────────────────────────────────────────────────
const { rows: exercises } = await db.query(
  `SELECT id, type, payload, payload_translations FROM exercises
   WHERE payload::text ~* 'Russland|Moskau|Росси|Москв'
      OR payload_translations::text ~* 'Росси|Москв'`)

console.log(`\nСлов затронуто: ${words.length}, упражнений: ${exercises.length}\n`)
for (const w of words.slice(0, 10)) {
  console.log(`  слово ${w.id}: ${w.word_de} → ${convert(w.word_de)} · ${w.translation_ru} → ${convert(w.translation_ru)}`)
}
for (const e of exercises.slice(0, 12)) {
  const before = JSON.stringify(e.payload)
  const after = JSON.stringify(convertDeep(e.payload))
  if (before !== after) console.log(`  упр. ${e.id} [${e.type}]: ${after.slice(0, 120)}`)
}

if (!APPLY) {
  console.log(`\nЭто только план — ничего не изменено, OpenAI не вызывался.`)
  console.log(`  node scripts/fix-country-mentions.mjs --apply`)
  process.exit(0)
}

writeFileSync(ROLLBACK, JSON.stringify({ words, exercises }, null, 1))
console.log(`Откат записан: ${ROLLBACK}`)

let wn = 0, en = 0
for (const w of words) {
  await db.query(
    `UPDATE words SET word_de = $1, translation_ru = $2, example_sentence = $3,
            example_sentence_ru = $4, translations = $5 WHERE id = $6`,
    [convert(w.word_de), convert(w.translation_ru), convert(w.example_sentence),
     convert(w.example_sentence_ru), JSON.stringify(convertDeep(w.translations || {})), w.id])
  wn++
}
for (const e of exercises) {
  await db.query(
    `UPDATE exercises SET payload = $1, payload_translations = $2 WHERE id = $3`,
    [JSON.stringify(convertDeep(e.payload)),
     JSON.stringify(convertDeep(e.payload_translations || {})), e.id])
  en++
}

await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0,
  message: `Россия → Украина: слов ${wn}, упражнений ${en}`, meta: { rollback: ROLLBACK } }).catch(() => {})
console.log(`\nГотово: слов ${wn}, упражнений ${en}. OpenAI не вызывался (0$).`)
process.exit(0)
