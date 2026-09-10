#!/usr/bin/env node
// Починка русского перевода в упражнении «напиши предложение».
//
// Баг, найденный 10.09.2026. В payload лежат пара «example» (немецкое предложение) и
// «example_ru» (его перевод — именно он показывается ученику как задание). Модель иногда
// выдаёт СВОЁ немецкое предложение, а русский берёт от примера слова — и пара расходится:
//
//   example:    Das ist mein Handy          (это мой телефон)
//   example_ru: Это моя книга.              ← перевод чужого предложения
//
// Ученик пишет по-русски одно, а эталон на немецком про другое. Проверить себя невозможно.
//
// Чиним ТОЧЕЧНО: только те записи, где немецкий разошёлся со словом, а русский совпадает
// с переводом примера СЛОВА один в один — это и есть след подстановки чужого перевода.
// Там, где модель придумала пару целиком (оба поля свои), не трогаем: она согласована.
//
// 💸 Тратит платный ключ: перевод коротких предложений через gpt-4o-mini (дешёвая модель,
// как и все переводы контента в проекте). Объём печатается в плане ДО запуска.
//
// Запуск на бою (там ключ и база):
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-sentence-write-ru.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-sentence-write-ru.mjs --apply
//
// Идемпотентно: повторный запуск после --apply находит 0 записей.
import { db } from '../src/db/index.js'
import { getOwnerClient } from '../src/services/openaiClient.js'

const apply = process.argv.includes('--apply')
const BATCH = 20

// Записи, где русский заведомо от другого предложения
async function findBroken() {
  const { rows } = await db.query(`
    SELECT e.id, e.payload->>'example' AS example, e.payload->>'example_ru' AS example_ru,
           w.word_de, l.lesson_number
    FROM exercises e
    JOIN words w ON w.id = e.word_id
    JOIN lessons l ON l.id = e.lesson_id
    WHERE e.type = 'sentence_write'
      AND e.payload->>'example' IS NOT NULL
      AND e.payload->>'example' IS DISTINCT FROM w.example_sentence
      AND e.payload->>'example_ru' = w.example_sentence_ru
    ORDER BY e.id`)
  return rows
}

// Перевод пачкой: одним запросом на BATCH предложений, ответ — массив строк того же размера
async function translate(client, sentences) {
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: 'Ты переводишь короткие немецкие предложения уровня A1 на русский. Отвечай ТОЛЬКО JSON-массивом строк той же длины, что и вход, без пояснений.' },
      { role: 'user', content: JSON.stringify(sentences) },
    ],
  })
  const raw = res.choices[0]?.message?.content?.trim() || '[]'
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, '')
  const out = JSON.parse(json)
  if (!Array.isArray(out) || out.length !== sentences.length) {
    throw new Error(`модель вернула ${Array.isArray(out) ? out.length : '?'} строк вместо ${sentences.length}`)
  }
  return out.map(s => String(s).trim())
}

const broken = await findBroken()
console.log(`Найдено записей с чужим переводом: ${broken.length}`)
if (!broken.length) { console.log('Чинить нечего.'); process.exit(0) }

if (!apply) {
  console.log(`\nПлан (первые 10 из ${broken.length}):`)
  for (const r of broken.slice(0, 10)) {
    console.log(`  урок ${r.lesson_number} · ${r.word_de}`)
    console.log(`    немецкий: ${r.example}`)
    console.log(`    сейчас:   ${r.example_ru}   ← перевод чужого предложения`)
  }
  const calls = Math.ceil(broken.length / BATCH)
  console.log(`\nБудет ${calls} запрос(ов) к gpt-4o-mini по ${BATCH} предложений.`)
  console.log('Запустить починку: --apply')
  process.exit(0)
}

const client = await getOwnerClient(null)   // платформенный ключ
let fixed = 0, failed = 0

for (let i = 0; i < broken.length; i += BATCH) {
  const chunk = broken.slice(i, i + BATCH)
  try {
    const ru = await translate(client, chunk.map(r => r.example))
    for (let k = 0; k < chunk.length; k++) {
      const text = ru[k]
      if (!text) { failed++; continue }
      await db.query(
        `UPDATE exercises SET payload = jsonb_set(payload, '{example_ru}', to_jsonb($1::text)) WHERE id = $2`,
        [text, chunk[k].id])
      fixed++
    }
    console.log(`  ${Math.min(i + BATCH, broken.length)} / ${broken.length}`)
  } catch (e) {
    failed += chunk.length
    console.error(`  пачка с ${i}: ${e.message}`)
  }
}

console.log(`\nПочинено: ${fixed}, не удалось: ${failed}`)
const left = await findBroken()
console.log(`Осталось с чужим переводом: ${left.length}`)
process.exit(0)
