#!/usr/bin/env node
// Переводы примера-предложения слова на ВСЕ локали интерфейса.
//
// Во флеш-карточке под фразой на изучаемом языке идёт её перевод. Он хранился
// в одной колонке example_sentence_ru — только по-русски, и турок, араб или
// албанец видели под немецкой фразой русскую строку. Теперь девять языков
// лежат в words.example_translations (миграция 075), русский остаётся в своей
// колонке как запасной вариант.
//
// Заодно дозаполняет пустой example_sentence_ru из того же ответа: отдельного
// прогона ради русской строки не нужно.
//
// 💸 Тратит OpenAI (gpt-4o-mini). Внутри translateSentencesAllLangs батчи по 12
//    предложений × 9 языков. Ориентир: $0.00006 на предложение.
//    Без --apply печатает только смету.
//
//   node scripts/translate-examples-all-langs.mjs              # смета
//   node scripts/translate-examples-all-langs.mjs --lang de    # один курс
//   node scripts/translate-examples-all-langs.mjs --apply
import { db } from '../src/db/index.js'
import { translateSentencesAllLangs, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const onlyLang = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || null
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
const NEED = ['ru', 'uk', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']
const BATCH = 60   // внутри функция всё равно режет по 12; здесь — размер транзакции записи

// Язык предложения — это язык КУРСА (target_lang урока), а не интерфейса.
const { rows: pending } = await db.query(
  `SELECT w.id, w.example_sentence, l.target_lang
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE w.example_sentence IS NOT NULL AND trim(w.example_sentence) <> ''
     AND NOT (COALESCE(w.example_translations, '{}'::jsonb) ?& $1::text[])
     AND ($2::text IS NULL OR l.target_lang = $2)
   ORDER BY l.target_lang, w.id`, [NEED, onlyLang])

const byLang = new Map()
for (const r of pending) {
  if (!byLang.has(r.target_lang)) byLang.set(r.target_lang, [])
  byLang.get(r.target_lang).push(r)
}

console.log(`\nПримеров без полного набора локалей: ${pending.length}`)
for (const [lg, rows] of byLang) console.log(`   ${lg}: ${rows.length}`)
console.log(`Смета: ~$${(pending.length * 0.00006).toFixed(3)} (gpt-4o-mini, 9 языков за один вызов на 12 фраз)`)

if (!pending.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто смета — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/translate-examples-all-langs.mjs --apply`)
  process.exit(0)
}

resetUsage()
let done = 0, empty = 0
for (const [lg, rows] of byLang) {
  const list = LIMIT ? rows.slice(0, LIMIT) : rows
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH)
    try {
      // Язык оригинала передаём явно: иначе промпт считает любое предложение немецким
      const out = await translateSentencesAllLangs(chunk.map(r => r.example_sentence), lg)
      for (let j = 0; j < chunk.length; j++) {
        const langs = out[j]
        if (!langs || !Object.keys(langs).length) { empty++; continue }
        await db.query(
          `UPDATE words
              SET example_translations = COALESCE(example_translations, '{}'::jsonb) || $1::jsonb,
                  example_sentence_ru  = COALESCE(NULLIF(trim(example_sentence_ru), ''), $2)
            WHERE id = $3`,
          [JSON.stringify(langs), langs.ru || null, chunk[j].id])
        done++
      }
      console.log(`  ${lg}: ${Math.min(i + BATCH, list.length)}/${list.length}`)
    } catch (e) { console.error(`  ✖ ${lg} батч ${i}: ${e.message}`) }
  }
}

await logOperation({
  kind: 'translate', status: 'ok', provider: 'openai', model: 'gpt-4o-mini',
  costUsd: usageCostUSD(), items: done,
  message: `Переводы примеров на локали: ${done}${empty ? `, пустых ответов ${empty}` : ''}`,
}).catch(() => {})
console.log(`\nГотово: ${done} из ${pending.length}. Потрачено: $${usageCostUSD().toFixed(4)}`)
process.exit(0)
