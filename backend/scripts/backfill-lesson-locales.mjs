#!/usr/bin/env node
// Переводы НАЗВАНИЯ и ОПИСАНИЯ урока на локали интерфейса.
//
// В списке уроков и на «Пути» ученик видит название на своём языке — если оно
// переведено. У 113 уроков переводов названия не было вовсе, и туркам, арабам,
// албанцам там светилась русская строка.
//
// Почему не backfill-lesson-descriptions.mjs: тот берёт только уроки БЕЗ
// описания (сейчас таких нет) и, посчитав переводы названия, выбрасывает их —
// пишет лишь описание. Здесь наоборот: описание не трогаем, дописываем локали.
//
// Номер из названия («Урок 38: Мебель») в перевод не тащим: translateLessonMeta
// про это предупреждён, а номер и так стоит в интерфейсе отдельно.
//
// 💸 Тратит OpenAI (gpt-4o-mini): 1 вызов на урок, ориентир $0.0005 за урок.
//    Без --apply печатает только смету.
//
//   node scripts/backfill-lesson-locales.mjs                    # смета по всем
//   node scripts/backfill-lesson-locales.mjs --ids=643,644 --apply
//   node scripts/backfill-lesson-locales.mjs --lang=de --apply
import { db } from '../src/db/index.js'
import { translateLessonMeta, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const WITH_SETS = process.argv.includes('--with-sets')
const LANG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || null
const IDS = (process.argv.find(a => a.startsWith('--ids='))?.split('=')[1] || '')
  .split(',').map(Number).filter(Boolean)
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
// --langs=de — перевести только на нужные локали вместо всех девяти.
// Названия и описания написаны ПО-РУССКИ, поэтому русский здесь источник, а не
// перевод: при «ру и нем» переводить остаётся один немецкий.
const LANGS = (process.argv.find(a => a.startsWith('--langs='))?.split('=')[1] || '')
  .split(',').map(s => s.trim()).filter(Boolean).filter(l => l !== 'ru')
const onlyLangs = LANGS.length ? LANGS : null

// Номер отрезаем: переводить «Урок 38» незачем, число и так видно
const bareTitle = (t) => String(t || '').replace(/^\s*(Урок|Lektion|Lesson|Lección)\s*\d+\s*[:.\-–]\s*/iu, '').trim()

const { rows } = await db.query(
  `SELECT id, lesson_number, title, description, target_lang, is_set,
          COALESCE(title_translations,'{}'::jsonb) AS tt,
          COALESCE(description_translations,'{}'::jsonb) AS dt
   FROM lessons
   WHERE NOT is_personal
     AND (COALESCE(title_translations,'{}'::jsonb) = '{}'::jsonb
          OR COALESCE(description_translations,'{}'::jsonb) = '{}'::jsonb)
     AND ($1::text IS NULL OR target_lang = $1)
     AND ($2::bool OR NOT is_set)
     AND ($3::int[] IS NULL OR id = ANY($3::int[]))
   ORDER BY target_lang, lesson_number NULLS LAST, id`, [LANG, WITH_SETS, IDS.length ? IDS : null])

const targets = LIMIT ? rows.slice(0, LIMIT) : rows
console.log(`\nУроков без полных локалей: ${rows.length}${LIMIT ? `, берём ${targets.length}` : ''}`)
const by = {}
for (const r of targets) by[r.target_lang] = (by[r.target_lang] || 0) + 1
for (const [lg, n] of Object.entries(by)) console.log(`   ${lg}: ${n}`)
for (const r of targets.slice(0, 8)) {
  const need = [r.tt === null || Object.keys(r.tt).length === 0 ? 'название' : null,
                Object.keys(r.dt).length === 0 ? 'описание' : null].filter(Boolean).join(' + ')
  console.log(`  #${r.id} ${r.title} → нет: ${need}`)
}
if (targets.length > 8) console.log(`  … и ещё ${targets.length - 8}`)
const langCount = onlyLangs ? onlyLangs.length : 9
console.log(`Смета: ~$${(targets.length * 0.0005 * langCount / 9).toFixed(3)} (gpt-4o-mini, ${langCount} яз., 1 вызов на урок)`)

if (!targets.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто смета — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/backfill-lesson-locales.mjs --apply`)
  process.exit(0)
}

resetUsage()
let done = 0, skipped = 0
for (const r of targets) {
  try {
    const tr = await translateLessonMeta(bareTitle(r.title), r.description || '', onlyLangs)
    const titleT = tr.title || {}, descT = tr.description || {}
    if (!Object.keys(titleT).length && !Object.keys(descT).length) { skipped++; continue }
    await db.query(
      `UPDATE lessons
          SET title_translations = COALESCE(title_translations,'{}'::jsonb) || $1::jsonb,
              description_translations = COALESCE(description_translations,'{}'::jsonb) || $2::jsonb
        WHERE id = $3`,
      [JSON.stringify(titleT), JSON.stringify(descT), r.id])
    done++
    if (done % 10 === 0) console.log(`  ${done}/${targets.length}`)
  } catch (e) { console.error(`  ✖ #${r.id}: ${e.message}`); skipped++ }
}

await logOperation({ kind: 'translate', status: 'ok', provider: 'openai', model: 'gpt-4o-mini',
  costUsd: usageCostUSD(), items: done,
  message: `Локали названий/описаний уроков: ${done}${onlyLangs ? ` (${onlyLangs.join(',')})` : ''}${skipped ? `, пропущено ${skipped}` : ''}` }).catch(() => {})
console.log(`\nГотово: ${done} из ${targets.length}${skipped ? `, пропущено ${skipped}` : ''}. Потрачено: $${usageCostUSD().toFixed(4)}`)
process.exit(0)
