#!/usr/bin/env node
// Задание в «Напиши предложение» — на язык КАЖДОГО ученика.
//
// В payload лежит example_ru: фраза, которую ученик собирает на изучаемом языке. Она
// существовала только по-русски, и ученик с турецким или украинским интерфейсом получал
// задание по-русски — то есть не понимал, что от него хотят. Нашлось аудитом 14.09.2026.
//
// Переводы кладём в НОВЫЙ ключ payload.example_translations = { en: …, tr: … }.
// Существующий payload_translations не трогаем намеренно: там лежат строки старой
// подсказки, и подмена их объектом сломала бы прежний режим упражнения.
//
// Русский не переводим — он уже есть в example_ru и служит запасным вариантом.
//
// 💸 gpt-4o-mini, батчами по 10 фраз: за один запрос все девять языков сразу. По 15 ответ
// иногда упирался в потолок токенов и обрывался на полуслове — JSON не разбирался, и
// батч терялся целиком. Замер на 150 заданиях: $0.0088, то есть вся база ≈ $0.25.
// Идемпотентно: упражнения, где переводы уже есть, пропускаются, поэтому прогон можно
// повторять и добивать остаток после сбоя.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/translate-sentence-tasks-2026-09-14.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/translate-sentence-tasks-2026-09-14.mjs --apply
import { db } from '../src/db/index.js'
import { resetUsage, usageCostUSD, trackUsage } from '../src/services/claude.js'
import { platformClient } from '../src/services/openaiClient.js'
import { logOperation } from '../src/services/opLog.js'

const apply = process.argv.includes('--apply')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 0

// Девять локалей интерфейса без русского: он и есть исходник.
const LANGS = {
  en: 'английский', de: 'немецкий', uk: 'украинский', bg: 'болгарский',
  tr: 'турецкий', ar: 'арабский', es: 'испанский', fr: 'французский', sq: 'албанский',
}
const CODES = Object.keys(LANGS)

const { rows } = await db.query(`
  SELECT e.id, e.payload->>'example_ru' AS task,
         COALESCE(e.payload->'example_translations', '{}'::jsonb) AS have
    FROM exercises e
   WHERE e.type = 'sentence_write'
     AND e.payload->>'example_ru' IS NOT NULL
     AND trim(e.payload->>'example_ru') <> ''
   ORDER BY e.id`)

// Уже переведённые пропускаем: прогон должен добивать остаток, а не платить заново.
const need = rows.filter(r => CODES.some(c => !r.have?.[c]))
const work = LIMIT ? need.slice(0, LIMIT) : need

console.log(`Заданий всего: ${rows.length}, без полного перевода: ${need.length}`)
const batches = Math.ceil(work.length / 10)
console.log(`Батчей по 10: ${batches}, gpt-4o-mini, оценка ≈ $${(batches * 0.0006).toFixed(2)}`)

if (!work.length) { console.log('Всё переведено.'); process.exit(0) }
if (!apply) {
  console.log('\nПримеры заданий:')
  for (const r of work.slice(0, 5)) console.log(`  #${r.id}: ${r.task}`)
  console.log('\nЭто пробный прогон. Записать: --apply')
  process.exit(0)
}

resetUsage()
let done = 0, skipped = 0

for (let i = 0; i < work.length; i += 10) {
  const items = work.slice(i, i + 10)
  const list = items.map((r, k) => `${k}: ${r.task}`).join('\n')
  const prompt = `Переведи каждую фразу на девять языков: ${CODES.map(c => `${c} (${LANGS[c]})`).join(', ')}.
Это учебные задания: переводи точно по смыслу, коротко и естественно, без пояснений.
Верни СТРОГО JSON без markdown: [{"i":0,"en":"...","de":"...","uk":"...","bg":"...","tr":"...","ar":"...","es":"...","fr":"...","sq":"..."}]
Фразы:
${list}`
  try {
    const res = await platformClient.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 6000, messages: [{ role: 'user', content: prompt }],
    })
    trackUsage('gpt-4o-mini', res.usage)
    const txt = res.choices[0].message.content
    const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1))
    for (const it of arr) {
      const r = items[it.i]
      if (!r) { skipped++; continue }
      // Переводом считаем только непустую строку: пропуск языка не должен затирать
      // уже имеющийся перевод пустотой.
      const tr = {}
      for (const c of CODES) if (typeof it[c] === 'string' && it[c].trim()) tr[c] = it[c].trim()
      if (Object.keys(tr).length < 5) { skipped++; continue }
      await db.query(
        `UPDATE exercises
            SET payload = jsonb_set(payload, '{example_translations}',
                  COALESCE(payload->'example_translations', '{}'::jsonb) || $2::jsonb)
          WHERE id = $1`,
        [r.id, JSON.stringify(tr)])
      done++
    }
  } catch (e) {
    console.error(`  батч ${i}: ${e.message}`)
  }
  if ((i / 10) % 20 === 0) console.log(`  ${i + items.length} / ${work.length}, переведено ${done}`)
}

const cost = usageCostUSD()
console.log(`\nПереведено: ${done}, пропущено: ${skipped}, цена: $${cost.toFixed(4)}`)
await logOperation({
  kind: 'translate', provider: 'openai', model: 'gpt-4o-mini',
  items: done, costUsd: cost, message: 'задания «напиши предложение» на 9 локалей',
})
process.exit(0)
