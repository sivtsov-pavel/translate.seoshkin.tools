#!/usr/bin/env node
// Примеры, в которых нет изучаемого слова.
//
// У слова есть «пример в предложении» — его показывает флеш-карта и по нему строится
// упражнение «напиши предложение». Если слова в примере нет, упражнение не тренирует
// ничего: у «anschauen» пример «Sehen Sie die Bilder an» — другое слово.
//
// ОТБОР детерминированный: ищем корень слова (без артикля, с запасом в две буквы на
// окончание) внутри примера. Даёт ~110 кандидатов на 2494 слова, но ТРЕТЬ из них
// ложные — немецкий отделяет приставку, и «rausgehen» → «Wir gehen raus» совершенно
// правилен. Отделить одно от другого регуляркой нельзя, поэтому кандидатов смотрит
// модель, а её ответы — человек.
//
// ДВА ШАГА: --scan копит находки в JSON и в базу не пишет, --apply записывает
// вычитанное и модель не вызывает. Это не формальность: на сверке словарных переводов
// модель выдала 208 «находок» на 5 настоящих (см. docs/OPERATIONS.md).
//
// 💸 Скан тратит платный ключ (gpt-4o-mini). Объём печатается перед стартом.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/scan-example-mismatch.mjs --scan
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/scan-example-mismatch.mjs --apply
import { readFileSync, writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { getOwnerClient } from '../src/services/openaiClient.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const outArg = args.indexOf('--out')
const OUT = outArg > -1 ? args[outArg + 1] : '/tmp/example-mismatch.json'
const BATCH = 5
const PARALLEL = 4

// Кандидаты: корень слова не встречается в примере. Две буквы с конца отбрасываем —
// это дёшево покрывает окончания (Bücher → Büch), не разбирая немецкую морфологию.
async function candidates() {
  const { rows } = await db.query(`
    WITH w AS (
      SELECT id, lesson_id, word_de, example_sentence, example_sentence_ru,
             regexp_replace(lower(trim(word_de)), '^(der|die|das|ein|eine)\\s+', '') AS bare
      FROM words WHERE example_sentence IS NOT NULL AND word_de IS NOT NULL)
    SELECT w.id, w.word_de, w.example_sentence, w.example_sentence_ru, l.lesson_number
    FROM w JOIN lessons l ON l.id = w.lesson_id
    WHERE l.target_lang = 'de'
      AND position(left(bare, greatest(length(bare) - 2, 3)) in lower(example_sentence)) = 0
    ORDER BY l.lesson_number NULLS LAST, w.id`)
  return rows
}

async function checkBatch(client, items) {
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content:
        'Ты проверяешь учебные примеры по немецкому. На вход JSON: ' +
        '{"items":[{"i":0,"word":"немецкое слово","example":"пример","ru":"перевод примера"}]}. ' +
        'Для КАЖДОЙ записи реши, встречается ли слово в примере В ЛЮБОЙ ФОРМЕ. ' +
        'ВАЖНО: у немецких глаголов приставка отделяется — «rausgehen» в «Wir gehen raus» ПРИСУТСТВУЕТ, ' +
        'это ok. Спряжение, склонение, множественное число, умлаут — тоже ok. ' +
        'НЕ ok только когда слова в примере нет вовсе или пример бессмысленный. ' +
        'Если НЕ ok — придумай НОВЫЙ короткий пример уровня A1 с этим словом и его русский перевод. ' +
        'Ответь строго JSON: {"result":[{"i":0,"ok":true},' +
        '{"i":1,"ok":false,"example":"новый пример","ru":"его перевод"}]}. ' +
        'Массив result обязан содержать по одному объекту на каждую входную запись.' },
      { role: 'user', content: JSON.stringify({ items: items.map((w, i) => ({ i, word: w.word_de, example: w.example_sentence, ru: w.example_sentence_ru })) }) },
    ],
  })
  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  if (!Array.isArray(parsed.result)) throw new Error('модель вернула не массив result')
  return parsed.result
}

// ── Запись вычитанного ────────────────────────────────────────────────────────
if (apply) {
  const found = JSON.parse(readFileSync(OUT, 'utf8'))
  console.log(`Читаю находки из ${OUT}: ${found.length}`)
  let done = 0
  for (const f of found) {
    if (!f.example || f.skip) continue      // skip:true проставляется руками при вычитке
    await db.query(
      'UPDATE words SET example_sentence = $1, example_sentence_ru = $2 WHERE id = $3',
      [f.example, f.ru ?? null, f.id])
    // «Напиши предложение» держит свою копию примера — иначе оно останется со старым
    const r = await db.query(
      `UPDATE exercises
       SET payload = payload || jsonb_build_object('example', $1::text, 'example_ru', $2::text)
       WHERE word_id = $3 AND type = 'sentence_write'`, [f.example, f.ru ?? '', f.id])
    console.log(`  #${f.id} ${f.word}: «${f.example}» (упражнений ${r.rowCount})`)
    done++
  }
  console.log(`Записано слов: ${done}`)
  process.exit(0)
}

// ── Скан ──────────────────────────────────────────────────────────────────────
const rows = await candidates()
const batches = []
for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH))
console.log(`Кандидатов: ${rows.length}, пачек по ${BATCH}: ${batches.length}`)
console.log(`Модель gpt-4o-mini, ~${(batches.length * 0.0002).toFixed(3)}$ по прикидке.\n`)

const client = await getOwnerClient(null)
const found = []
let checked = 0, errors = 0

async function runBatch(chunk) {
  try {
    for (const v of await checkBatch(client, chunk)) {
      const w = chunk[v.i]
      if (!w) continue
      if (v.ok === false && v.example) {
        found.push({
          id: w.id, lesson: w.lesson_number, word: w.word_de,
          old: w.example_sentence, oldRu: w.example_sentence_ru,
          example: String(v.example).trim(), ru: v.ru ? String(v.ru).trim() : null,
        })
      }
    }
  } catch (e) {
    errors++
    if (errors <= 5) console.error(`  пачка ${chunk[0]?.id}: ${e.message}`)
  }
  checked += chunk.length
  if (checked % 25 < BATCH) console.log(`  ${checked} / ${rows.length}, находок: ${found.length}`)
}

for (let i = 0; i < batches.length; i += PARALLEL) {
  await Promise.all(batches.slice(i, i + PARALLEL).map(runBatch))
}

found.sort((a, b) => (a.lesson ?? 999) - (b.lesson ?? 999) || a.id - b.id)
writeFileSync(OUT, JSON.stringify(found, null, 1))
console.log(`\nПроверено: ${checked}, находок: ${found.length}, сбоев пачек: ${errors}`)
console.log(`Находки: ${OUT}`)
console.log('Прочитать глазами, лишнее пометить "skip": true, затем --apply')
process.exit(0)
