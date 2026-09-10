#!/usr/bin/env node
// Сплошная проверка немецкой орфографии по всей базе: слова и примеры к ним.
//
// Слова приходят с фотографии тетради через распознавание, и ошибка распознавания
// становится учебным материалом: ученик заучивает «Ocean» вместо «Ozean». Этот прогон
// показывает, сколько такого накопилось, и даёт список для правки.
//
// 💸 ДЕНЕГ НЕ ТРАТИТ: проверка идёт по словарю (services/germanSpell.js), модель не
// вызывается ни разу. Можно гонять хоть каждый день.
//
// Ничего не меняет — только читает и печатает. Правка отдельным шагом, руками или
// скриптом, после того как список прочитан глазами: словарь не знает трёхсоставных
// слов и редких терминов, поэтому часть находок будет ложной.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/audit-german-spelling.mjs
//   ... --out /tmp/spell.json   — сложить находки в файл (забрать docker cp)
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { isGermanWord, suggestGerman, unknownWordsIn } from '../src/services/germanSpell.js'

const outArg = process.argv.indexOf('--out')
const OUT = outArg > -1 ? process.argv[outArg + 1] : null

const { rows } = await db.query(`
  SELECT w.id, w.word_de, w.translation_ru, w.example_sentence,
         l.lesson_number, l.title AS lesson_title
  FROM words w JOIN lessons l ON l.id = w.lesson_id
  WHERE l.target_lang = 'de' AND l.is_set = false AND w.word_de IS NOT NULL
  ORDER BY l.lesson_number NULLS LAST, w.id`)

console.log(`Слов в немецких уроках: ${rows.length}\n`)

const badWords = []      // само слово словарю неизвестно
const badExamples = []   // слово в порядке, ошибка внутри примера

for (const r of rows) {
  // Артикль отделяем: проверять надо существительное, «der» словарь и так знает
  const bare = String(r.word_de).replace(/^(der|die|das|ein|eine)\s+/i, '').trim()
  // Многословные записи проверяем по каждому слову отдельно
  const parts = bare.split(/\s+/).filter(p => p.length >= 3)
  const unknown = parts.filter(p => !isGermanWord(p))
  if (unknown.length) {
    badWords.push({
      id: r.id, lesson: r.lesson_number, word: r.word_de, ru: r.translation_ru,
      unknown: unknown.map(u => ({ word: u, suggest: suggestGerman(u) })),
    })
  }
  if (r.example_sentence) {
    const bad = unknownWordsIn(r.example_sentence)
      // слово из самого словаря не считаем ошибкой примера — о нём уже сказано выше
      .filter(b => !parts.some(p => p.toLowerCase() === b.word.toLowerCase()))
    if (bad.length) {
      badExamples.push({ id: r.id, lesson: r.lesson_number, word: r.word_de, example: r.example_sentence, bad })
    }
  }
}

const show = (title, list, render) => {
  console.log(`\n── ${title}: ${list.length} ──`)
  for (const x of list.slice(0, 25)) console.log(render(x))
  if (list.length > 25) console.log(`  … и ещё ${list.length - 25}`)
}

show('Слова, неизвестные словарю', badWords, (x) =>
  `  урок ${x.lesson ?? '—'} · «${x.word}» (${x.ru})` +
  x.unknown.map(u => `\n      ${u.word}${u.suggest.length ? ' → ' + u.suggest.join(', ') : ' → вариантов нет'}`).join(''))

show('Ошибки внутри примеров', badExamples, (x) =>
  `  урок ${x.lesson ?? '—'} · «${x.word}»\n      ${x.example}` +
  x.bad.map(b => `\n      ✗ ${b.word}${b.suggest.length ? ' → ' + b.suggest.join(', ') : ''}`).join(''))

console.log(`\nИтого: слов с ошибкой ${badWords.length}, примеров с ошибкой ${badExamples.length}, проверено ${rows.length}`)
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ badWords, badExamples }, null, 1))
  console.log(`Находки: ${OUT}`)
}
process.exit(0)
