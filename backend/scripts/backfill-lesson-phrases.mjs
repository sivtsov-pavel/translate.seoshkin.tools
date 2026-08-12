#!/usr/bin/env node
// Наборы фраз к существующим урокам. Идемпотентно: урок, у которого набор уже есть,
// пропускается — повторный запуск не платит второй раз.
//
// 💸 Тратит OpenAI (gpt-4o): один вызов на урок, ориентир $0.01 за урок.
//    Без --apply печатает только план и смету, ничего не меняя.
//
//   node scripts/backfill-lesson-phrases.mjs                         # план
//   node scripts/backfill-lesson-phrases.mjs --lang=de --apply --limit=3
//   node scripts/backfill-lesson-phrases.mjs --lang=de --apply       # все немецкие
//   node scripts/backfill-lesson-phrases.mjs --apply --level=A0
//
// Фильтры: --lang=de|en|es, --with-sets (включить уроки-наборы), --level=A0|A1|A2.
// Алфавитные уроки («Буква B») и уроки короче четырёх слов пропускаются всегда.
import { db } from '../src/db/index.js'
import { generateLessonPhrases } from '../src/services/phrases.js'
import { resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
const LEVEL = process.argv.find(a => a.startsWith('--level='))?.split('=')[1] || 'A1'
const LANG  = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || null
const WITH_SETS = process.argv.includes('--with-sets')

// Уроки-алфавит («Буква B» из пяти слов) исключаем: связных бытовых фраз из набора
// букв не выходит, а платить за них всё равно пришлось бы.
const { rows: lessons } = await db.query(`
  SELECT l.id, l.lesson_number, l.title, l.target_lang,
         (SELECT count(*)::int FROM words w WHERE w.lesson_id = l.id) AS words
  FROM lessons l
  WHERE l.status = 'done'
    AND NOT EXISTS (SELECT 1 FROM phrase_topics t WHERE t.lesson_id = l.id)
    AND (SELECT count(*) FROM words w WHERE w.lesson_id = l.id) >= 4
    AND l.title !~* '^(буква|letter|letra)\\s'
    AND ($1::text IS NULL OR l.target_lang = $1)
    AND ($2::bool OR l.is_set = false)
  ORDER BY l.lesson_number NULLS LAST, l.id`, [LANG, WITH_SETS])

const targets = LIMIT ? lessons.slice(0, LIMIT) : lessons
console.log(`\nУроков без набора фраз: ${lessons.length}${LIMIT ? `, берём ${targets.length}` : ''}`)
console.log(`Уровень: ${LEVEL}. Ориентир цены: $${(targets.length * 0.01).toFixed(2)}\n`)
for (const l of targets.slice(0, 20)) {
  console.log(`  урок ${l.lesson_number ?? '—'} (id ${l.id}) · ${l.words} слов · ${l.title || 'без названия'}`)
}
if (targets.length > 20) console.log(`  … и ещё ${targets.length - 20}`)

if (!APPLY) {
  console.log(`\nЭто только план — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/backfill-lesson-phrases.mjs --apply --limit=3`)
  process.exit(0)
}

resetUsage()
let done = 0, empty = 0, phrases = 0
for (const l of targets) {
  try {
    const r = await generateLessonPhrases(l.id, { level: LEVEL })
    if (r.saved) {
      done++; phrases += r.saved
      console.log(`  ✓ урок ${l.lesson_number ?? l.id}: фраз ${r.saved}, забраковано ${r.rejected.length}`)
      for (const bad of r.rejected.slice(0, 2)) console.log(`      ✗ «${bad.text}» — ${bad.problems.join('; ')}`)
    } else {
      empty++; console.log(`  · урок ${l.lesson_number ?? l.id}: пусто (${r.reason})`)
    }
  } catch (e) {
    empty++
    console.error(`  ✗ урок ${l.id}: ${e.message}`)
  }
}

const cost = usageCostUSD()
await logOperation({
  kind: 'phrases', status: 'ok', costUsd: cost,
  message: `наборы фраз: уроков ${done}, фраз ${phrases}, пусто ${empty}`,
}).catch(() => {})
console.log(`\nГотово: наборов ${done}, фраз ${phrases}, пропущено ${empty}. Потрачено: $${cost.toFixed(4)}`)
console.log(`Наборы созданы черновиками — публикуются после вычитки.`)
process.exit(0)
