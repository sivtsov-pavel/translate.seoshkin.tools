#!/usr/bin/env node
// Починка орфографических ошибок в немецком материале, найденных сплошным аудитом
// (scripts/audit-german-spelling.mjs, прогон 10.09.2026).
//
// Ошибки пришли из распознавания фотографий тетради и разошлись по словам И по
// упражнениям: одно «Kursleitnehmerin» вместо «Kursteilnehmerin» сидело в двух десятках
// упражнений сразу. Ученик заучивал несуществующее слово.
//
// Две части, и это не одно и то же:
//
//   ЗАМЕНЫ — опечатка в остальном верного текста. Меняем подстроку везде, где встретим:
//   и в словах, и в payload упражнений. Идемпотентно: повторный запуск не находит ничего.
//
//   ПРИМЕРЫ — предложение сломано целиком и правкой букв не лечится. «Die Peschänke ist
//   nah» стояло у слова «подарки» и переводилось как «Пекарня близко»: ни слово, ни
//   перевод, ни смысл не сходятся. Такие переписаны вручную, каждый прочитан глазами.
//
// 💸 Денег не тратит: правки заданы текстом, модель не вызывается.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-german-typos.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-german-typos.mjs --apply
import { db } from '../src/db/index.js'

const apply = process.argv.includes('--apply')

// Опечатки: что → на что. Порядок важен, длинные формы первыми.
// «Kursleitnehmer» покрывает и «Kursleitnehmerin» — это одна подстрока.
const REPLACEMENTS = [
  ['Kursleitnehmer', 'Kursteilnehmer'],   // такого слова нет: участник курса — Kursteilnehmer
  ['Ocean', 'Ozean'],                     // английское написание
  ['Bretzel', 'Brezel'],                  // лишняя «t»
  ['Baume sind', 'Bäume sind'],           // потерян умлаут при распознавании
  ['Yogurt', 'Joghurt'],                  // английское написание
  ['radriere', 'radiere'],                // лишняя «r»
]

// Примеры, сломанные целиком: id слова → новый пример и его перевод.
// Каждый прочитан глазами; перевод приведён в соответствие с немецким.
const EXAMPLES = [
  { wordId: 6218, example: 'Die Geschenke sind schön.', ru: 'Подарки красивые.' },        // было «Die Peschänke ist nah» / «Пекарня близко»
  { wordId: 8166, example: 'Der Hamster ist klein.', ru: 'Хомяк маленький.' },            // было «Ich gebe Hommian einen.»
  { wordId: 8232, example: 'Die Löwen sind große Tiere.', ru: 'Львы — большие животные.' }, // было «Der Leu ist ein großes Tier.»
  { wordId: 8528, example: 'Oje, das ist schade!', ru: 'О нет, как жаль!' },              // было «Ich habe quje Ideen für das Projekt.»
]

// ── Что найдено ───────────────────────────────────────────────────────────────
const found = []
for (const [bad, good] of REPLACEMENTS) {
  const { rows: [w] } = await db.query(
    `SELECT count(*)::int AS n FROM words
     WHERE word_de LIKE '%'||$1||'%' OR example_sentence LIKE '%'||$1||'%'`, [bad])
  const { rows: [e] } = await db.query(
    `SELECT count(*)::int AS n FROM exercises WHERE payload::text LIKE '%'||$1||'%'`, [bad])
  found.push({ bad, good, words: w.n, exercises: e.n })
}

console.log('Опечатки:')
for (const f of found) console.log(`  ${f.bad} → ${f.good}: слов ${f.words}, упражнений ${f.exercises}`)
console.log(`\nПримеров переписать целиком: ${EXAMPLES.length}`)
for (const x of EXAMPLES) console.log(`  слово #${x.wordId}: «${x.example}» / «${x.ru}»`)

if (!apply) {
  console.log('\nПрименить: --apply')
  process.exit(0)
}

// ── Правка ────────────────────────────────────────────────────────────────────
let wordsFixed = 0, exFixed = 0
for (const [bad, good] of REPLACEMENTS) {
  const r1 = await db.query(
    `UPDATE words SET
       word_de = replace(word_de, $1, $2),
       example_sentence = replace(example_sentence, $1, $2)
     WHERE word_de LIKE '%'||$1||'%' OR example_sentence LIKE '%'||$1||'%'`, [bad, good])
  // Правим payload целиком как текст: подстрока может сидеть в любом поле —
  // в «options», в «masked», в «sentence», в «example».
  const r2 = await db.query(
    `UPDATE exercises SET payload = replace(payload::text, $1, $2)::jsonb
     WHERE payload::text LIKE '%'||$1||'%'`, [bad, good])
  wordsFixed += r1.rowCount
  exFixed += r2.rowCount
  console.log(`  ${bad} → ${good}: слов ${r1.rowCount}, упражнений ${r2.rowCount}`)
}

for (const x of EXAMPLES) {
  await db.query(
    `UPDATE words SET example_sentence = $1, example_sentence_ru = $2 WHERE id = $3`,
    [x.example, x.ru, x.wordId])
  // У упражнений «напиши предложение» пример живёт своей копией в payload
  const r = await db.query(
    `UPDATE exercises
     SET payload = payload || jsonb_build_object('example', $1::text, 'example_ru', $2::text)
     WHERE word_id = $3 AND type = 'sentence_write'`, [x.example, x.ru, x.wordId])
  console.log(`  слово #${x.wordId}: пример обновлён, упражнений ${r.rowCount}`)
}

console.log(`\nИтого: слов ${wordsFixed}, упражнений ${exFixed} + примеры`)
console.log('⚠️ После этого пересобрать маски «вставь букву»: node scripts/fix-letter-fill-masks.mjs --apply')
process.exit(0)
