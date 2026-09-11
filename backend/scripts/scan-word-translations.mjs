#!/usr/bin/env node
// Сплошная сверка словарных переводов: слово ↔ его русский перевод.
//
// Именно этот перевод ученик видит на флеш-карте, в «выбери ответ» и в диктанте —
// карточка берёт его из словаря, а не из упражнения. Значит ошибка в словаре
// размножается по всем типам сразу. Живой случай 11.09.2026: у «die Sprachen» в двух
// уроках стоял перевод «говорить» (а у «sprechen» — «языки»), при том что английский,
// турецкий и остальные локали были верны. Ученик заучивал неправду.
//
// Пачки по ПЯТЬ и структурированный ответ — по тем же граблям, что и со сверкой
// предложений: на двадцати парах модель перестаёт читать каждую строку и отвечает
// «всё хорошо» не глядя.
//
// Подсказка модели — остальные локали того же слова: если английский говорит
// «languages», а русский «говорить», расхождение видно сразу и без знания немецкого.
//
// ДВА ШАГА, и это не формальность: --scan складывает находки в JSON и в базу не пишет,
// --apply записывает вычитанное человеком и модель не вызывает. Модель ошибается в обе
// стороны, и «применить всё, что она пометила» — способ испортить нормальные переводы.
//
// 💸 Скан тратит платный ключ (gpt-4o-mini). Объём печатается перед стартом.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/scan-word-translations.mjs --scan
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/scan-word-translations.mjs --apply
//
// ⚠️ Файл находок лежит в /tmp контейнера и умрёт при пересборке образа — забрать сразу.
import { readFileSync, writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { getOwnerClient } from '../src/services/openaiClient.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const outArg = args.indexOf('--out')
const OUT = outArg > -1 ? args[outArg + 1] : '/tmp/word-translations-scan.json'
const BATCH = 5
const PARALLEL = 4

async function allWords() {
  const { rows } = await db.query(`
    SELECT w.id, w.word_de, w.translation_ru, l.lesson_number,
           w.translations->>'en' AS en, w.translations->>'uk' AS uk
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE l.target_lang = 'de' AND w.word_de IS NOT NULL
      AND w.translation_ru IS NOT NULL AND trim(w.translation_ru) <> ''
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
        'Ты проверяешь словарные переводы с немецкого на русский. На вход JSON: ' +
        '{"items":[{"i":0,"de":"немецкое слово","ru":"русский перевод","en":"английский перевод"}]}. ' +
        'Английский перевод дан как подсказка — он, как правило, верен. ' +
        'Для КАЖДОЙ записи реши, верен ли русский перевод немецкого слова. ' +
        'Разница в числе, роде, падеже или в полноте (краткий и развёрнутый вариант) — это ok. ' +
        'НЕ ok только когда перевод про другое понятие: другая часть речи по смыслу, ' +
        'другое значение, явный мусор или слово не на русском. ' +
        'Ответь строго JSON: {"result":[{"i":0,"ok":true},{"i":1,"ok":false,"ru":"верный перевод"}]}. ' +
        'Массив result обязан содержать по одному объекту на каждую входную запись.' },
      { role: 'user', content: JSON.stringify({ items: items.map((w, i) => ({ i, de: w.word_de, ru: w.translation_ru, en: w.en })) }) },
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
    if (!f.suggested || f.skip) continue      // skip:true проставляется руками при вычитке
    await db.query('UPDATE words SET translation_ru = $1 WHERE id = $2', [f.suggested, f.id])
    // Упражнения держат свою копию перевода — иначе карточка и диктант разъедутся со словарём
    await db.query(
      `UPDATE exercises SET payload = payload || jsonb_build_object('answer', $1::text)
       WHERE word_id = $2 AND type = 'flashcard'`, [f.suggested, f.id])
    await db.query(
      `UPDATE exercises SET payload = payload || jsonb_build_object('translation_ru', $1::text)
       WHERE word_id = $2 AND type IN ('dictation','speech','letter_fill','sentence_write','article','declension','conjugation')`,
      [f.suggested, f.id])
    done++
  }
  console.log(`Записано: ${done}`)
  process.exit(0)
}

// ── Скан ──────────────────────────────────────────────────────────────────────
const words = await allWords()
const batches = []
for (let i = 0; i < words.length; i += BATCH) batches.push(words.slice(i, i + BATCH))
console.log(`Слов на сверку: ${words.length}, пачек по ${BATCH}: ${batches.length}`)
console.log(`Модель gpt-4o-mini, ~${(batches.length * 0.00015).toFixed(2)}$ по прикидке.\n`)

const client = await getOwnerClient(null)
const found = []
let checked = 0, errors = 0

async function runBatch(chunk) {
  try {
    for (const v of await checkBatch(client, chunk)) {
      const w = chunk[v.i]
      if (!w) continue
      if (v.ok === false && v.ru && String(v.ru).trim() !== w.translation_ru) {
        found.push({
          id: w.id, lesson: w.lesson_number, word: w.word_de,
          current: w.translation_ru, suggested: String(v.ru).trim(), en: w.en,
        })
      }
    }
  } catch (e) {
    errors++
    if (errors <= 5) console.error(`  пачка ${chunk[0]?.id}: ${e.message}`)
  }
  checked += chunk.length
  if (checked % 250 < BATCH) console.log(`  ${checked} / ${words.length}, находок: ${found.length}`)
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
