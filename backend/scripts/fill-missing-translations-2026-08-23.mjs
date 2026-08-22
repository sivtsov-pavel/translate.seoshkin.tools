#!/usr/bin/env node
// Дозаполнение переводов слов на все локали.
//
// Требование Павла: контент всегда на языке ученика, а не только по-русски. Слово
// с пустым translations на украинской или турецкой локали показывается по-русски —
// то есть ученик учит немецкое слово через язык, которого может не знать.
//
// Когда переводы теряются: асинхронная генерация не дошла до конца, урок правили
// скриптом (правка записи сбрасывает translations нарочно — старый перевод под новым
// словом врёт сильнее, чем его отсутствие).
//
// 💸 gpt-4o-mini, батчи по 20 (translateWordsToAllLangs). ~740 слов ≈ $0.05.
// Идемпотентный: слова с готовыми переводами не трогает, повторный прогон бесплатен.
//
//   node scripts/fill-missing-translations-2026-08-23.mjs            # план и смета
//   node scripts/fill-missing-translations-2026-08-23.mjs --apply
import { db } from '../src/db/index.js'
import { translateWordsToAllLangs, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const LANG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || 'de'
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)

const { rows: words } = await db.query(`
  SELECT w.id, w.word_de, w.translation_ru, l.lesson_number
  FROM words w JOIN lessons l ON l.id = w.lesson_id
  WHERE l.target_lang = $1 AND NOT w.is_function_word
    AND w.translations = '{}'::jsonb AND w.translation_ru <> ''
  ORDER BY w.lesson_id, w.id`, [LANG])

const targets = LIMIT ? words.slice(0, LIMIT) : words
console.log(`Слов без переводов на локали: ${words.length}${LIMIT ? `, берём ${targets.length}` : ''}`)
console.log(`Батчей по 20: ${Math.ceil(targets.length / 20)}, ориентир: $${(targets.length * 0.00007).toFixed(3)}`)
for (const w of targets.slice(0, 8)) console.log(`  урок ${w.lesson_number ?? '—'}: ${w.word_de} = ${w.translation_ru}`)

if (!APPLY) {
  console.log('\nЭто ПЛАН — ничего не изменено и не потрачено.')
  process.exit(0)
}

resetUsage()
const translations = await translateWordsToAllLangs(targets)
let saved = 0
for (const [id, t] of Object.entries(translations)) {
  if (!t || typeof t !== 'object') continue
  const { rowCount } = await db.query(
    `UPDATE words SET translations = $1 WHERE id = $2 AND translations = '{}'::jsonb`,
    [JSON.stringify(t), Number(id)])
  saved += rowCount
}
const cost = usageCostUSD()
console.log(`Переводы записаны: ${saved} из ${targets.length}, потрачено $${cost.toFixed(4)}`)

await logOperation({
  kind: 'translate', provider: 'openai', model: 'gpt-4o-mini', status: 'ok',
  items: saved, costUsd: Number(cost.toFixed(4)),
  message: `Дозаполнены переводы слов на локали: ${saved}`,
  meta: { script: 'fill-missing-translations-2026-08-23', lang: LANG },
})
process.exit(0)
