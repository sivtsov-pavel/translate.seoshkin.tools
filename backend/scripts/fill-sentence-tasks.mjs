#!/usr/bin/env node
// Достраивает «Напиши предложение» до задания-перевода: к эталону на изучаемом языке
// добавляет русскую фразу, которую ученик и увидит.
//
// Почему тип упражнения поменялся: раньше задание звучало «напиши своё предложение со
// словом X», а под ним показывался пример. На A1 ученик ещё не строит фразы сам — он
// списывал пример и получал за это 2 из 5, потому что проверка судила сочинение строго.
// Теперь задание конкретное: «напиши это предложение по-немецки», эталон известен, и
// проверка оценивает совпадение смысла.
//
// Русскую фразу берём из двух источников:
//  1) бесплатно — из предложений урока (lesson_sentences), если эталон пришёл оттуда;
//  2) остальное переводим gpt-4o-mini батчами по 20.
//
// 💸 Тратит немного: gpt-4o-mini, порядка одного цента на сотню упражнений.
//    Без --apply только считает и показывает смету.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fill-sentence-tasks.mjs
//   ... --apply
//
import { db } from '../src/db/index.js'
import { resetUsage, usageCostUSD } from '../src/services/claude.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const apply = process.argv.includes('--apply')

const { rows } = await db.query(`
  SELECT e.id, e.lesson_id, e.payload, l.target_lang
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   WHERE e.type = 'sentence_write'
     AND COALESCE(e.payload->>'example', '') <> ''
     AND COALESCE(e.payload->>'example_ru', '') = ''
   ORDER BY e.id`)

console.log(`«Напиши предложение» без русского задания: ${rows.length}`)
if (!rows.length) process.exit(0)

// 1) Бесплатный источник: то же предложение уже лежит в уроке вместе с переводом.
const { rows: sents } = await db.query(
  `SELECT lesson_id, lower(text) AS k, translation_ru FROM lesson_sentences WHERE translation_ru IS NOT NULL`)
const bank = new Map(sents.map(s => [`${s.lesson_id}|${s.k}`, s.translation_ru]))

const fromLesson = [], needAi = []
for (const r of rows) {
  const hit = bank.get(`${r.lesson_id}|${String(r.payload.example).trim().toLowerCase()}`)
  ;(hit ? fromLesson : needAi).push(hit ? { ...r, ru: hit } : r)
}

console.log(`  из предложений урока (бесплатно): ${fromLesson.length}`)
console.log(`  нужен перевод gpt-4o-mini: ${needAi.length} → примерно $${(needAi.length * 0.00008).toFixed(3)}`)

if (!apply) { console.log('\nЭто смета. Выполнить: --apply'); process.exit(0) }

resetUsage()
let done = 0

const save = async (id, payload, ru) => {
  await db.query('UPDATE exercises SET payload = $1 WHERE id = $2',
    [JSON.stringify({ ...payload, example_ru: ru }), id])
  done++
}

for (const r of fromLesson) await save(r.id, r.payload, r.ru)
console.log(`Из урока проставлено: ${done}`)

for (let i = 0; i < needAi.length; i += 20) {
  const batch = needAi.slice(i, i + 20)
  const list = batch.map((r, k) => `${k}: ${r.payload.example}`).join('\n')
  const prompt = `Переведи каждое предложение на русский язык. Перевод естественный, без пояснений и кавычек.
Верни СТРОГО JSON без markdown: [{"i":0,"ru":"..."}]
Предложения:
${list}`
  try {
    const res = await platformClient.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 2000, messages: [{ role: 'user', content: prompt }],
    })
    trackUsage('gpt-4o-mini', res.usage)
    const txt = res.choices[0].message.content
    const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1))
    for (const it of arr) {
      const r = batch[it.i]
      if (!r || !it.ru) continue
      await save(r.id, r.payload, String(it.ru).trim())
    }
  } catch (e) {
    console.error(`  батч ${i}: ${e.message}`)
  }
}

const cost = usageCostUSD()
console.log(`\nГотово: ${done} из ${rows.length}, цена $${cost.toFixed(4)}`)
await logOperation({
  kind: 'exercises', provider: 'openai', model: 'gpt-4o-mini', status: 'ok',
  items: done, costUsd: cost, message: '«Напиши предложение» → задание-перевод',
})
process.exit(0)
