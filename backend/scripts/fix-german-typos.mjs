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

// Замена может превратить слово в ДУБЛЬ уже существующего в том же уроке — база
// такого не допускает (уникальный индекс words_lesson_word_key), и первый прогон на
// этом упал. Живой случай: в наборе рядом лежали правильная «die Kursteilnehmerin» и
// битая «die Kursleitnehmerin». Битую не переименовываем, а убираем — но только если
// по ней никто не занимался; иначе оставляем и говорим об этом вслух.
async function findConflicts() {
  const out = []
  for (const [bad, good] of REPLACEMENTS) {
    const { rows } = await db.query(`
      SELECT w.id, w.lesson_id, w.word_de, replace(w.word_de, $1, $2) AS after,
             (SELECT count(*)::int FROM exercise_attempts a
                JOIN exercises e ON e.id = a.exercise_id WHERE e.word_id = w.id) AS attempts
      FROM words w
      WHERE w.word_de LIKE '%'||$1||'%'
        AND EXISTS (SELECT 1 FROM words w2
                     WHERE w2.lesson_id = w.lesson_id AND w2.id <> w.id
                       AND w2.word_de = replace(w.word_de, $1, $2))`, [bad, good])
    out.push(...rows)
  }
  return out
}

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

const conflicts = await findConflicts()
if (conflicts.length) {
  console.log('\nПосле замены станут дублями уже существующих слов:')
  for (const c of conflicts) {
    console.log(`  #${c.id} «${c.word_de}» → «${c.after}» (попыток ${c.attempts})` +
      (c.attempts ? '  — ОСТАВЛЯЕМ, по нему занимались' : '  — удаляем как дубль'))
  }
}

if (!apply) {
  console.log('\nПрименить: --apply')
  process.exit(0)
}

// Дубли убираем ДО замен, иначе UPDATE упрётся в уникальный индекс
for (const c of conflicts) {
  if (c.attempts) continue
  await db.query('DELETE FROM words WHERE id = $1', [c.id])
  console.log(`  удалён дубль #${c.id} «${c.word_de}»`)
}

// ── Правка ────────────────────────────────────────────────────────────────────
let wordsFixed = 0, exFixed = 0
for (const [bad, good] of REPLACEMENTS) {
  // Слово, у которого замена дала бы дубль, а попытки есть, не переименовываем —
  // пример внутри него всё равно чиним.
  const r1 = await db.query(
    `UPDATE words SET
       word_de = CASE WHEN EXISTS (SELECT 1 FROM words w2
                                    WHERE w2.lesson_id = words.lesson_id AND w2.id <> words.id
                                      AND w2.word_de = replace(words.word_de, $1, $2))
                      THEN word_de ELSE replace(word_de, $1, $2) END,
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
