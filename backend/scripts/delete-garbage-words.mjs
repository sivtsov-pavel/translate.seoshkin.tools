#!/usr/bin/env node
// Удаление мусорных словарных записей и мусорных примеров (решение Павла, 13.08.2026).
//
// Слова — следы кривых загрузок, чинить нечего:
//   «die Schark» (628)  — несуществующее слово, в переводе так и написано;
//   «ge» (338, 626)     — обломок приставки прошедшего времени, карточкой не учится;
//   «Mull» (570)        — опечатка, рядом в том же уроке уже есть «der Müll».
// Удаляются вместе со своими упражнениями (иначе останутся сироты).
//
// Примеры — строки «null», «Plural: …» и прочее, что фразой не является
// (критерий тот же, что у правила example_broken в systemCheck.js). Такие
// затираются в NULL: пустой пример лучше, чем «null» на карточке.
//
// 💸 OpenAI НЕ вызывается — цена $0.
//
//   node scripts/delete-garbage-words.mjs            # план
//   node scripts/delete-garbage-words.mjs --apply    # удалить
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = '/tmp/garbage-words-rollback.json'

const GARBAGE_WORDS = ['die Schark', 'ge', 'Mull']

// ── Что нашли ────────────────────────────────────────────────────────────────
const { rows: words } = await db.query(
  `SELECT w.*, (SELECT count(*) FROM exercises e WHERE e.word_id = w.id) AS ex
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = 'de' AND w.word_de = ANY($1::text[]) ORDER BY w.lesson_id`,
  [GARBAGE_WORDS])

const { rows: examples } = await db.query(
  `SELECT w.id, w.lesson_id, w.word_de, w.example_sentence, w.example_sentence_ru
   FROM words w WHERE w.example_sentence <> ''
     AND (lower(trim(w.example_sentence)) IN ('null','undefined','-','—')
          OR w.example_sentence ~* '^(plural|singular|pl\\.|sg\\.)\\s*:'
          OR w.example_sentence !~ '[a-zäöüßA-ZÄÖÜ]{2}')
   ORDER BY w.lesson_id`)

console.log(`\nМусорных слов: ${words.length} (упражнений при них: ${words.reduce((s, w) => s + Number(w.ex), 0)})`)
words.forEach(w => console.log(`   урок ${w.lesson_id} #${w.id}: «${w.word_de}» (${w.translation_ru}) — ${w.ex} упр.`))
console.log(`\nМусорных примеров: ${examples.length}`)
examples.forEach(e => console.log(`   урок ${e.lesson_id} «${e.word_de}» → «${String(e.example_sentence).slice(0, 40)}»`))

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено, OpenAI не вызывался.`)
  console.log(`  node scripts/delete-garbage-words.mjs --apply`)
  process.exit(0)
}

// Откат: полные строки слов и затираемые примеры
const { rows: wordExercises } = await db.query(
  `SELECT * FROM exercises WHERE word_id = ANY($1::int[])`, [words.map(w => w.id)])
writeFileSync(ROLLBACK, JSON.stringify({ words, exercises: wordExercises, examples }, null, 1))
console.log(`\nОткат записан: ${ROLLBACK} (забрать из контейнера сразу!)`)

// ── Удаление ─────────────────────────────────────────────────────────────────
let exDeleted = 0
if (words.length) {
  const ids = words.map(w => w.id)
  exDeleted = (await db.query('DELETE FROM exercises WHERE word_id = ANY($1::int[])', [ids])).rowCount
  await db.query('DELETE FROM words WHERE id = ANY($1::int[])', [ids])
}
let exCleared = 0
if (examples.length) {
  exCleared = (await db.query(
    `UPDATE words SET example_sentence = NULL, example_sentence_ru = NULL
     WHERE id = ANY($1::int[])`, [examples.map(e => e.id)])).rowCount
}

await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0,
  message: `Мусор из загрузок: слов удалено ${words.length} (с ними ${exDeleted} упражнений), примеров затёрто ${exCleared}`,
  meta: { rollback: ROLLBACK } }).catch(() => {})

console.log(`\nГотово ($0): слов удалено ${words.length}, упражнений с ними ${exDeleted}, примеров затёрто ${exCleared}`)
process.exit(0)
