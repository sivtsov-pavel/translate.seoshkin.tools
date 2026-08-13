#!/usr/bin/env node
// Разбивка тяжёлого урока на несколько по темам.
//
// Причина: урок 20 — это 187 слов с одного разворота учебника, где смешаны буквы,
// числа, еда и глаголы. Пройти такой за присест нельзя, и он стоит на дороге стеной.
//
// Что делает:
//   1) классифицирует слова урока по темам (gpt-4o-mini, дёшево);
//   2) сдвигает номера последующих уроков, освобождая место;
//   3) создаёт по уроку на тему и переносит туда слова ВМЕСТЕ С УПРАЖНЕНИЯМИ —
//      прогресс не теряется, он привязан к упражнениям, а не к уроку;
//   4) набор фраз исходного урока отдаёт первому из новых;
//   5) опустевший урок удаляет.
//
// 💸 Тратит OpenAI (gpt-4o-mini) на классификацию: ориентир $0.01 на 200 слов.
//    Без --apply печатает только план.
//
//   node scripts/split-lesson.mjs --lesson=20
//   node scripts/split-lesson.mjs --lesson=20 --apply
import { db } from '../src/db/index.js'
import { classifyWordsToThemes, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const LESSON_NUMBER = parseInt(process.argv.find(a => a.startsWith('--lesson='))?.split('=')[1] || '0', 10)
const MIN_WORDS = 8   // тему меньше этого не выделяем: получится урок из трёх слов

if (!LESSON_NUMBER) { console.error('Укажи урок: --lesson=20'); process.exit(1) }

const { rows: lessonRows } = await db.query(
  `SELECT id, lesson_number, title, target_lang, course_id, owner_id, school_id, status, is_set
   FROM lessons WHERE lesson_number = $1 AND target_lang = 'de' AND is_set = false`, [LESSON_NUMBER])
const lesson = lessonRows[0]
if (!lesson) { console.error(`Урок ${LESSON_NUMBER} не найден`); process.exit(1) }

const { rows: words } = await db.query(
  `SELECT id, word_de, translation_ru, source FROM words WHERE lesson_id = $1 ORDER BY id`, [lesson.id])
console.log(`\nУрок ${lesson.lesson_number}: «${lesson.title}» — ${words.length} слов`)
if (words.length < 30) { console.log('Урок и так небольшой, разбивать нечего.'); process.exit(0) }

resetUsage()
const classified = await classifyWordsToThemes(
  words.map(w => ({ de: w.word_de, tr: w.translation_ru })), lesson.target_lang)

// Группируем по теме, мелкие темы сливаем в «Разное»: урок из трёх слов бессмыслен
const byTheme = new Map()
classified.forEach((c, i) => {
  const theme = (c?.theme || 'Разное').trim()
  if (!byTheme.has(theme)) byTheme.set(theme, [])
  byTheme.get(theme).push(words[i])
})
const big = [...byTheme.entries()].filter(([, ws]) => ws.length >= MIN_WORDS)
const small = [...byTheme.entries()].filter(([, ws]) => ws.length < MIN_WORDS).flatMap(([, ws]) => ws)
if (small.length) {
  const rest = big.find(([t]) => t === 'Разное')
  if (rest) rest[1].push(...small)
  else big.push(['Разное', small])
}
big.sort((a, b) => b[1].length - a[1].length)

console.log(`\nПолучится уроков: ${big.length}`)
for (const [theme, ws] of big) {
  console.log(`  «${theme}» — ${ws.length} слов: ${ws.slice(0, 6).map(w => w.word_de).join(', ')}…`)
}
console.log(`\nНомера ${LESSON_NUMBER}…${LESSON_NUMBER + big.length - 1}, последующие уроки сдвинутся на ${big.length - 1}`)
console.log(`Потрачено на классификацию: $${usageCostUSD().toFixed(4)}`)

if (!APPLY) {
  console.log(`\nЭто только план — ничего не изменено.\n  node scripts/split-lesson.mjs --lesson=${LESSON_NUMBER} --apply`)
  process.exit(0)
}

// Освобождаем номера под новые уроки
const shift = big.length - 1
if (shift > 0) {
  await db.query(
    `UPDATE lessons SET lesson_number = lesson_number + $1
     WHERE target_lang = $2 AND is_set = false AND owner_id = $3 AND lesson_number > $4`,
    [shift, lesson.target_lang, lesson.owner_id, LESSON_NUMBER])
  console.log(`Сдвинуто последующих уроков: +${shift}`)
}

let firstNewId = null
for (const [i, [theme, ws]] of big.entries()) {
  const number = LESSON_NUMBER + i
  const title = `Урок ${number}: ${theme}`
  const { rows: created } = await db.query(
    `INSERT INTO lessons (lesson_number, title, target_lang, course_id, owner_id, school_id, status, is_set)
     VALUES ($1, $2, $3, $4, $5, $6, 'done', false) RETURNING id`,
    [number, title, lesson.target_lang, lesson.course_id, lesson.owner_id, lesson.school_id])
  const newId = created[0].id
  if (i === 0) firstNewId = newId

  const ids = ws.map(w => w.id)
  await db.query('UPDATE words SET lesson_id = $1 WHERE id = ANY($2::int[])', [newId, ids])
  // Упражнения переезжают вместе со словами — прогресс по ним сохраняется
  const ex = await db.query('UPDATE exercises SET lesson_id = $1 WHERE word_id = ANY($2::int[])', [newId, ids])
  console.log(`  ✓ ${title}: слов ${ids.length}, упражнений ${ex.rowCount}`)
}

// Набор фраз исходного урока отдаём первому новому
await db.query('UPDATE phrase_topics SET lesson_id = $1 WHERE lesson_id = $2', [firstNewId, lesson.id])

// Упражнения без слова (общие) — тоже первому
await db.query('UPDATE exercises SET lesson_id = $1 WHERE lesson_id = $2', [firstNewId, lesson.id])

// Опустевший урок убираем
const { rows: left } = await db.query('SELECT count(*)::int AS n FROM words WHERE lesson_id = $1', [lesson.id])
if (left[0].n === 0) {
  await db.query('DELETE FROM lessons WHERE id = $1', [lesson.id])
  console.log('Исходный урок удалён (пуст)')
} else {
  console.log(`⚠️ В исходном уроке осталось слов: ${left[0].n} — не удаляю`)
}

await logOperation({
  kind: 'cleanup', status: 'ok', costUsd: usageCostUSD(),
  message: `урок ${LESSON_NUMBER} разбит на ${big.length}`,
}).catch(() => {})
console.log(`\nГотово. Потрачено: $${usageCostUSD().toFixed(4)}`)
process.exit(0)
