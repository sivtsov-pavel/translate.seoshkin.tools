#!/usr/bin/env node
// Удаление словарных записей, написанных КИРИЛЛИЦЕЙ в курсе на латинице.
//
// Откуда берутся: разбор фото учебника иногда принимает за изучаемое слово его
// же русский перевод из соседней колонки. В уроке 42 так оказались
// «предложение», «Где» и «доска» — карточка предлагает выучить русское слово
// как немецкое (решение Павла на удаление, 29.09.2026).
//
// Признак общий, а не список id: правило само найдёт такие же записи в
// следующий раз. Курсы с кириллическим алфавитом (если появятся) правило
// не затронет — оно смотрит на язык курса.
//
// Слово уходит вместе со своими упражнениями (FK ON DELETE CASCADE), поэтому
// перед удалением пишем файл отката со всем содержимым строк.
//
// 💸 OpenAI НЕ вызывается — цена $0. Идемпотентен: повторный запуск находит 0.
//
//   node scripts/delete-cyrillic-words.mjs            # план
//   node scripts/delete-cyrillic-words.mjs --apply    # удалить
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = `/tmp/cyrillic-words-rollback-${new Date().toISOString().slice(0, 10)}.json`
// Языки, которые пишутся латиницей: кириллица в слове такого курса — заведомо брак
const LATIN_COURSES = ['de', 'en', 'es', 'fr', 'it', 'pt']

const { rows: words } = await db.query(
  `SELECT w.*, l.lesson_number, l.target_lang,
          (SELECT count(*)::int FROM exercises e WHERE e.word_id = w.id) AS ex,
          (SELECT count(*)::int FROM user_word_status u WHERE u.word_id = w.id) AS progress
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = ANY($1::text[]) AND w.word_de ~ '[А-Яа-яЁё]'
   ORDER BY l.lesson_number NULLS LAST, w.id`, [LATIN_COURSES])

console.log(`\nСлов кириллицей в латинских курсах: ${words.length}`)
for (const w of words) {
  console.log(`  #${w.id} урок ${w.lesson_number ?? '—'} (${w.target_lang}): «${w.word_de}» — ${w.translation_ru}` +
              ` · упражнений ${w.ex}${w.progress ? `, прогресс у ${w.progress} чел.` : ''}`)
}

if (!words.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто план — ничего не удалено.\n  node scripts/delete-cyrillic-words.mjs --apply`)
  process.exit(0)
}

// Файл отката пишем ДО удаления: восстановить строку из ничего нельзя
const { rows: exercises } = await db.query(
  'SELECT * FROM exercises WHERE word_id = ANY($1::int[])', [words.map(w => w.id)])
writeFileSync(ROLLBACK, JSON.stringify({ at: new Date().toISOString(), words, exercises }, null, 2))
console.log(`\nОткат записан: ${ROLLBACK} (слов ${words.length}, упражнений ${exercises.length})`)

const res = await db.query('DELETE FROM words WHERE id = ANY($1::int[])', [words.map(w => w.id)])
console.log(`Удалено слов: ${res.rowCount}, вместе с ними упражнений: ${exercises.length}`)

await logOperation({
  kind: 'cleanup', status: 'ok', costUsd: 0, items: res.rowCount,
  message: `Удалены слова кириллицей: ${words.map(w => w.word_de).join(', ')}`,
}).catch(() => {})
process.exit(0)
