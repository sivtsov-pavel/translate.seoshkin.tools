#!/usr/bin/env node
// Переводы фраз на 10 локалей. Без переводов экран набора показывает только целевой
// язык — понять смысл нельзя, а шаг «слушаю» в тренажёре остаётся без вариантов ответа.
//
// 💸 Тратит OpenAI (gpt-4o-mini) батчами по 20 фраз. Ориентир: ~$0.25 на 316 фраз.
//    Без --apply печатает только план и смету.
//
//   node scripts/translate-phrases.mjs           # план
//   node scripts/translate-phrases.mjs --apply   # перевести
import { db } from '../src/db/index.js'
import { translateSentencesAllLangs, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const BATCH = 20

const { rows: pending } = await db.query(
  `SELECT p.id, p.text, t.lang
   FROM phrases p JOIN phrase_topics t ON t.id = p.topic_id
   WHERE p.translations = '{}'::jsonb OR NOT (p.translations ? 'ru')
   ORDER BY p.id`)

console.log(`\nФраз без переводов: ${pending.length}`)
console.log(`Батчей по ${BATCH}: ${Math.ceil(pending.length / BATCH)}. Ориентир цены: ~$${(pending.length * 0.0008).toFixed(2)}\n`)
for (const p of pending.slice(0, 5)) console.log(`  ${p.id} · ${p.text}`)
if (pending.length > 5) console.log(`  … и ещё ${pending.length - 5}`)

if (!APPLY) {
  console.log(`\nЭто только план — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/translate-phrases.mjs --apply`)
  process.exit(0)
}

resetUsage()
let done = 0
for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH)
  try {
    // Тот же механизм, что переводит предложения уроков: на вход массив строк,
    // на выходе массив объектов {ru, uk, en, …} в том же порядке.
    const out = await translateSentencesAllLangs(batch.map(p => p.text))
    for (let j = 0; j < batch.length; j++) {
      const langs = out[j]
      if (!langs || !Object.keys(langs).length) continue
      await db.query(
        `UPDATE phrases SET translations = COALESCE(translations, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify(langs), batch[j].id])
      done++
    }
    console.log(`  переведено ${done}/${pending.length}`)
  } catch (e) {
    console.error(`  ✗ батч ${i}: ${e.message}`)
  }
}

const cost = usageCostUSD()
await logOperation({
  kind: 'translate', status: 'ok', costUsd: cost,
  message: `переводы фраз: ${done} из ${pending.length}`,
}).catch(() => {})
console.log(`\nГотово: переведено ${done}. Потрачено: $${cost.toFixed(4)}`)
process.exit(0)
