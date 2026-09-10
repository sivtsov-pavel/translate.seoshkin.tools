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
// Кандидатов отбираем грубо (немецкий разошёлся со словом, а русский совпадает с переводом
// примера слова), но САМ ФАКТ поломки решает не этот признак. Первая версия скрипта чинила
// «по признаку» — и план показал, что среди 184 кандидатов большинство В ПОРЯДКЕ:
// «I eat a sandwich.» → «Я ем сэндвич.» согласовано, просто у слова другой пример.
// Поэтому каждую пару сверяет модель и возвращает исправление ТОЛЬКО при несоответствии.
// Ровно тот случай, ради которого скрипт обязан сначала печатать план.
//
// 💸 Тратит платный ключ: перевод коротких предложений через gpt-4o-mini (дешёвая модель,
// как и все переводы контента в проекте). Объём печатается в плане ДО запуска.
//
// Запуск на бою (там ключ и база):
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-sentence-write-ru.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-sentence-write-ru.mjs --apply
//
// Идемпотентно, но по-своему: список кандидатов после --apply остаётся тем же (признак
// отбора грубый), просто сверка теперь отвечает «ok» и записей не меняет. Повторный
// прогон безопасен, хотя и стоит тех же запросов к модели.
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

// Сверка пачкой: на каждую пару модель отвечает "ok" (перевод соответствует) либо
// правильным переводом. Так меняем только то, что действительно сломано.
async function checkBatch(client, pairs) {
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content:
        'На вход JSON-массив пар {original, ru}: original — короткое предложение на изучаемом языке, ru — его русский перевод. ' +
        'Для КАЖДОЙ пары реши, передаёт ли ru смысл original. Ответь ТОЛЬКО JSON-массивом той же длины: ' +
        'строка "ok", если перевод соответствует (мелкие стилистические различия допустимы), ' +
        'иначе — правильный русский перевод предложения original. Без пояснений.' },
      { role: 'user', content: JSON.stringify(pairs.map(p => ({ original: p.example, ru: p.example_ru }))) },
    ],
  })
  const raw = res.choices[0]?.message?.content?.trim() || '[]'
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, '')
  const out = JSON.parse(json)
  if (!Array.isArray(out) || out.length !== pairs.length) {
    throw new Error(`модель вернула ${Array.isArray(out) ? out.length : '?'} ответов вместо ${pairs.length}`)
  }
  return out.map(x => String(x).trim())
}

const broken = await findBroken()
console.log(`Кандидатов на сверку: ${broken.length}`)
if (!broken.length) { console.log('Чинить нечего.'); process.exit(0) }

if (!apply) {
  console.log(`\nПлан (первые 10 из ${broken.length}):`)
  for (const r of broken.slice(0, 10)) {
    console.log(`  урок ${r.lesson_number} · ${r.word_de}`)
    console.log(`    оригинал: ${r.example}`)
    console.log(`    перевод:  ${r.example_ru}`)
  }
  const calls = Math.ceil(broken.length / BATCH)
  console.log(`\nБудет ${calls} запрос(ов) к gpt-4o-mini по ${BATCH} пар (сверка, не слепая замена).`)
  console.log('Запустить починку: --apply')
  process.exit(0)
}

const client = await getOwnerClient(null)   // платформенный ключ
let fixed = 0, ok = 0, failed = 0

for (let i = 0; i < broken.length; i += BATCH) {
  const chunk = broken.slice(i, i + BATCH)
  try {
    const verdicts = await checkBatch(client, chunk)
    for (let k = 0; k < chunk.length; k++) {
      const v = verdicts[k]
      if (!v) { failed++; continue }
      if (v.toLowerCase() === 'ok') { ok++; continue }   // перевод соответствует — не трогаем
      await db.query(
        `UPDATE exercises SET payload = jsonb_set(payload, '{example_ru}', to_jsonb($1::text)) WHERE id = $2`,
        [v, chunk[k].id])
      console.log(`    починено #${chunk[k].id} (${chunk[k].word_de}): ${chunk[k].example_ru}  →  ${v}`)
      fixed++
    }
    console.log(`  ${Math.min(i + BATCH, broken.length)} / ${broken.length}`)
  } catch (e) {
    failed += chunk.length
    console.error(`  пачка с ${i}: ${e.message}`)
  }
}

console.log(`\nБыло в порядке: ${ok}, починено: ${fixed}, не удалось: ${failed}`)
process.exit(0)
