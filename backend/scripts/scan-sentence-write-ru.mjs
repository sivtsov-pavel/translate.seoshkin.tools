#!/usr/bin/env node
// Сплошная сверка пар «предложение ↔ русский перевод» в упражнении «напиши предложение».
//
// В payload лежат «example» (предложение на изучаемом языке) и «example_ru» — именно
// перевод показывается ученику как задание. Если они не про одно и то же, ученик пишет
// одно, а эталон про другое, и проверить себя невозможно:
//
//   example:    Das ist mein Handy      (это мой телефон)
//   example_ru: Это моя книга.          ← про другое
//
// ПОЧЕМУ ПАЧКАМИ ПО ПЯТЬ. Предыдущая версия сверяла по 20 пар за запрос: на 184 парах
// нашла ОДНО несоответствие и пропустила четыре очевидных, а вместо «ok» возвращала тот
// же текст. Модель в длинном списке перестаёт читать каждую строку. Пять пар и
// структурированный ответ с индексом — тот минимум, на котором она отвечает по делу.
//
// ДВА ШАГА, и это не формальность: находки читает человек. Модель ошибается в обе стороны,
// и «починить всё, что она пометила» — верный способ испортить нормальные переводы
// (10.09.2026 грубый признак чуть не переписал 146 согласованных пар).
//
//   --scan   пройти все упражнения, находки сложить в JSON. В базу НЕ пишет.
//   --apply  записать проверенные находки из этого JSON. Модель не вызывает.
//
// 💸 Скан тратит платный ключ (gpt-4o-mini, дешёвая модель). Объём и оценка печатаются
// перед стартом. --apply не стоит ничего.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/scan-sentence-write-ru.mjs --scan
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/scan-sentence-write-ru.mjs --apply
//
// ⚠️ Файл находок лежит в /tmp контейнера и умрёт при пересборке образа — забрать сразу:
//   docker cp $(docker ps -qf name=translate-backend):/tmp/sentence-ru-scan.json ./
import { readFileSync, writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { getOwnerClient } from '../src/services/openaiClient.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const OUT = args[args.indexOf('--out') + 1]?.startsWith('/') ? args[args.indexOf('--out') + 1] : '/tmp/sentence-ru-scan.json'
const BATCH = 5          // больше — модель перестаёт читать каждую строку (см. шапку)
const PARALLEL = 4       // пачек одновременно: 800+ запросов подряд идут слишком долго

async function allPairs() {
  const { rows } = await db.query(`
    SELECT e.id, e.payload->>'example' AS example, e.payload->>'example_ru' AS example_ru,
           w.word_de, l.lesson_number, l.target_lang
    FROM exercises e
    JOIN words w ON w.id = e.word_id
    JOIN lessons l ON l.id = e.lesson_id
    WHERE e.type = 'sentence_write'
      AND e.payload->>'example' IS NOT NULL
      AND e.payload->>'example_ru' IS NOT NULL
    ORDER BY e.id`)
  return rows
}

// Пачка на сверку. Ответ — массив объектов по числу пар: {i, ok, ru}.
// ru заполняется только когда ok=false — это и есть предложенное исправление.
async function checkBatch(client, pairs) {
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content:
        'Ты сверяешь перевод. На вход JSON: {"pairs":[{"i":0,"original":"...","ru":"..."}]}. ' +
        'original — предложение на иностранном языке, ru — его русский перевод. ' +
        'Для КАЖДОЙ пары определи, передаёт ли ru смысл original. ' +
        'Расхождение в стиле, порядке слов или пунктуации — это ok. ' +
        'НЕ ok только когда речь о разных вещах (другой предмет, другое действие, ' +
        'противоположный смысл, обращение к другому лицу). ' +
        'Ответь строго JSON: {"result":[{"i":0,"ok":true},{"i":1,"ok":false,"ru":"верный перевод"}]}. ' +
        'Массив result обязан содержать по одному объекту на каждую входную пару.' },
      { role: 'user', content: JSON.stringify({ pairs: pairs.map((p, i) => ({ i, original: p.example, ru: p.example_ru })) }) },
    ],
  })
  const parsed = JSON.parse(res.choices[0]?.message?.content || '{}')
  const out = parsed.result
  if (!Array.isArray(out)) throw new Error('модель вернула не массив result')
  return out
}

// ── Запись проверенных находок ────────────────────────────────────────────────
if (apply) {
  const found = JSON.parse(readFileSync(OUT, 'utf8'))
  console.log(`Читаю находки из ${OUT}: ${found.length}`)
  let done = 0
  for (const f of found) {
    if (!f.suggested || f.skip) continue     // skip:true проставляется руками при вычитке
    await db.query(
      `UPDATE exercises SET payload = jsonb_set(payload, '{example_ru}', to_jsonb($1::text)) WHERE id = $2`,
      [f.suggested, f.id])
    done++
  }
  console.log(`Записано: ${done}`)
  process.exit(0)
}

// ── Скан ──────────────────────────────────────────────────────────────────────
const pairs = await allPairs()
const batches = []
for (let i = 0; i < pairs.length; i += BATCH) batches.push(pairs.slice(i, i + BATCH))
console.log(`Пар на сверку: ${pairs.length}, пачек по ${BATCH}: ${batches.length}`)
console.log(`Модель gpt-4o-mini, ~${(batches.length * 0.00015).toFixed(2)}$ по прикидке. Поехали.\n`)

const client = await getOwnerClient(null)
const found = []
let checked = 0, errors = 0

async function runBatch(chunk) {
  try {
    const verdicts = await checkBatch(client, chunk)
    for (const v of verdicts) {
      const p = chunk[v.i]
      if (!p) continue
      if (v.ok === false && v.ru && String(v.ru).trim() !== p.example_ru) {
        found.push({
          id: p.id, lesson: p.lesson_number, lang: p.target_lang, word: p.word_de,
          example: p.example, current: p.example_ru, suggested: String(v.ru).trim(),
        })
      }
    }
  } catch (e) {
    errors++
    if (errors <= 5) console.error(`  пачка ${chunk[0]?.id}: ${e.message}`)
  }
  checked += chunk.length
  if (checked % 200 < BATCH) console.log(`  ${checked} / ${pairs.length}, находок: ${found.length}`)
}

for (let i = 0; i < batches.length; i += PARALLEL) {
  await Promise.all(batches.slice(i, i + PARALLEL).map(runBatch))
}

found.sort((a, b) => a.lesson - b.lesson || a.id - b.id)
writeFileSync(OUT, JSON.stringify(found, null, 1))
console.log(`\nПроверено: ${checked}, находок: ${found.length}, сбоев пачек: ${errors}`)
console.log(`Находки: ${OUT}`)
console.log('Прочитать глазами, лишнее пометить "skip": true, затем --apply')
process.exit(0)
