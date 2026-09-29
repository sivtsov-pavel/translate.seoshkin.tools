#!/usr/bin/env node
// Дописывает переводы payload упражнениям, у которых их нет.
//
// Без переводов упражнение немое на девяти интерфейсах из десяти: ученик видит
// подсказку и варианты только на изучаемом языке. Дыра появляется каждый раз,
// когда payload правят точечно и сбрасывают payload_translations (там оставался
// перевод СТАРОГО текста — хуже, чем ничего).
//
// 💸 Тратит OpenAI (gpt-4o-mini) батчами по 15. Ориентир: ~$0.0006 на упражнение.
//    Без --apply печатает только смету.
//
//   node scripts/translate-missing-payloads.mjs                 # смета
//   node scripts/translate-missing-payloads.mjs --ids=191654 --apply
//   node scripts/translate-missing-payloads.mjs --apply         # все
import { db } from '../src/db/index.js'
import { translateExercisePayloads, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const IDS = (process.argv.find(a => a.startsWith('--ids='))?.split('=')[1] || '')
  .split(',').map(Number).filter(Boolean)
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
// --langs=ru — перевести только на нужные локали вместо всех девяти.
//
// Считать надо не по числу упражнений, а по числу ПАР «упражнение × язык»:
// «выбери ответ» и «напиши предложение» держат подсказку и варианты УЖЕ
// по-русски (для них русский — источник, а не перевод), поэтому при --langs=ru
// им переводить нечего, и в работу попадает только «заполни пропуск».
// Немецкий интерфейс падает на русский запасным вариантом (LANG_FALLBACK).
const LANGS = (process.argv.find(a => a.startsWith('--langs='))?.split('=')[1] || '')
  .split(',').map(s => s.trim()).filter(Boolean)
const FROM_RU = ['multiple_choice', 'sentence_write']   // источник — русский
const onlyLangs = LANGS.length ? LANGS : null

// Переводятся только те типы, которые умеет translateExercisePayloads
let TYPES = ['fill_blank', 'multiple_choice', 'sentence_write']
// Если из запрошенных языков для типов «из русского» не остаётся ни одного —
// такие упражнения в работу не берём вовсе, иначе платим за пустой ответ.
if (onlyLangs && !onlyLangs.some(l => l !== 'ru' && l !== 'de')) {
  TYPES = TYPES.filter(t => !FROM_RU.includes(t))
  console.log(`(языки ${onlyLangs.join(', ')}: «выбери ответ» и «напиши предложение» уже на русском — берём только «заполни пропуск»)`)
}

const { rows } = await db.query(
  `SELECT e.id, e.type, e.payload
   FROM exercises e
   WHERE e.type = ANY($1::text[])
     AND (e.payload_translations IS NULL OR e.payload_translations = '{}'::jsonb)
     AND ($2::int[] IS NULL OR e.id = ANY($2::int[]))
   ORDER BY e.id`, [TYPES, IDS.length ? IDS : null])

const targets = LIMIT ? rows.slice(0, LIMIT) : rows
console.log(`\nУпражнений без переводов payload: ${rows.length}${LIMIT ? `, берём ${targets.length}` : ''}`)
const byType = {}
for (const r of targets) byType[r.type] = (byType[r.type] || 0) + 1
for (const [t, n] of Object.entries(byType)) console.log(`   ${t}: ${n}`)
// Цена по ЗАМЕРУ, а не на глаз: журнал операций за 29.09 даёт $0.0001 за
// упражнение на девять языков (было насчитано $0.0006 — ошибка в 6 раз).
const perLang = 0.0001 / 9
const langCount = onlyLangs ? onlyLangs.filter(l => l !== 'de').length || 1 : 9
console.log(`Смета: ~$${(targets.length * perLang * langCount).toFixed(3)} (gpt-4o-mini, ${langCount} яз., батчи по 15)`)

if (!targets.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто смета — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/translate-missing-payloads.mjs --apply`)
  process.exit(0)
}

resetUsage()
let done = 0
for (let i = 0; i < targets.length; i += 15) {
  const batch = targets.slice(i, i + 15)
  try {
    // Функция ВОЗВРАЩАЕТ переводы, записывает их вызывающий
    const results = await translateExercisePayloads(batch, onlyLangs)
    for (const [id, langs] of Object.entries(results || {})) {
      await db.query(
        `UPDATE exercises SET payload_translations = COALESCE(payload_translations,'{}'::jsonb) || $1::jsonb
         WHERE id = $2`, [JSON.stringify(langs), parseInt(id)])
      done++
    }
    console.log(`  ${Math.min(i + 15, targets.length)}/${targets.length}`)
  } catch (e) { console.error(`  ✖ батч ${i}: ${e.message}`) }
}

await logOperation({ kind: 'translate', status: 'ok', provider: 'openai', model: 'gpt-4o-mini',
  costUsd: usageCostUSD(), items: done,
  message: `Переводы payload дописаны: ${done} из ${targets.length}${onlyLangs ? ` (языки: ${onlyLangs.join(',')})` : ''}` }).catch(() => {})
console.log(`\nГотово: ${done} из ${targets.length}. Потрачено: $${usageCostUSD().toFixed(4)}`)
process.exit(0)
