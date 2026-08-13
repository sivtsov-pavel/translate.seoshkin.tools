#!/usr/bin/env node
// Дописывает ОПИСАНИЯ урокам, у которых их нет (просьба Павла, 13.08.2026).
//
// Откуда дыры: генератор описаний срабатывает только на дефолтных названиях
// («Урок N»), а уроки, разбитые из большого скриптом, получили готовые названия
// («Урок 20: Глаголы») и шаг описания проскочили.
//
// Название урока НЕ трогаем — только description + его переводы на локали
// (в списке уроков описание показывается на языке ученика).
//
// 💸 OpenAI: gpt-4o-mini, 2 вызова на урок (описание + переводы) ≈ $0.001/урок.
//    Без --apply печатает план и не тратит ничего.
//
//   node scripts/backfill-lesson-descriptions.mjs            # план
//   node scripts/backfill-lesson-descriptions.mjs --apply    # дописать
import { db } from '../src/db/index.js'
import { generateLessonMeta, translateLessonMeta, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')

const { rows: lessons } = await db.query(`
  SELECT l.id, l.title, l.target_lang
  FROM lessons l
  WHERE (l.description IS NULL OR trim(l.description) = '')
    AND l.status = 'done'
    AND EXISTS (SELECT 1 FROM words w WHERE w.lesson_id = l.id)
  ORDER BY l.id`)

console.log(`\nУроков без описания: ${lessons.length}`)
lessons.forEach(l => console.log(`   #${l.id} ${l.title}`))
console.log(`\nСмета: ~$${(lessons.length * 0.001).toFixed(3)} (gpt-4o-mini, 2 вызова/урок)`)

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено, OpenAI не вызывался.`)
  console.log(`  node scripts/backfill-lesson-descriptions.mjs --apply`)
  process.exit(0)
}

let done = 0
for (const l of lessons) {
  try {
    const { rows: ws } = await db.query(
      'SELECT word_de, translation_ru FROM words WHERE lesson_id=$1 ORDER BY id', [l.id])
    if (ws.length < 3) continue
    // Предложения урока — чтобы описание упомянуло тренируемые буквы («Буквы: Pf, J, Y»)
    const { rows: sents } = await db.query(
      `SELECT DISTINCT e.payload->>'sentence' AS text FROM exercises e
       WHERE e.lesson_id = $1 AND e.type = 'fill_blank' AND e.payload->>'sentence' <> '' LIMIT 12`, [l.id])
    const meta = await generateLessonMeta(ws, [], l.target_lang, sents.map(s => s.text))
    if (!meta?.description) continue
    const tr = await translateLessonMeta(l.title, meta.description)
    await db.query(
      `UPDATE lessons SET description = $1,
              description_translations = COALESCE(description_translations, '{}'::jsonb) || $2::jsonb
       WHERE id = $3 AND (description IS NULL OR trim(description) = '')`,
      [meta.description, JSON.stringify(tr.description || {}), l.id])
    done++
    console.log(`   ✔ #${l.id}: ${meta.description.slice(0, 90)}`)
  } catch (e) { console.error(`   ✖ #${l.id}: ${e.message}`) }
}

await logOperation({ kind: 'enrich', status: 'ok', provider: 'openai', model: 'gpt-4o-mini',
  costUsd: usageCostUSD(), items: done,
  message: `Описания уроков дописаны: ${done} из ${lessons.length}` }).catch(() => {})

console.log(`\nГотово: описаний дописано ${done} из ${lessons.length}`)
process.exit(0)
