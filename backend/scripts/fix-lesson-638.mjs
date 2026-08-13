#!/usr/bin/env node
// Точечная починка урока 638 — находки первой боевой автопроверки (13.08.2026).
//
// 1. Упражнение #184834: «er, sie, es ___ ... zu» — строка таблицы спряжения
//    просочилась в «заполни пропуск» и не привязана к слову. Делаем нормальную
//    фразу про zumachen и привязываем к этому слову.
// 2. Словарная запись «Rauche» (курю) — личная форма с заглавной вместо
//    инфинитива. Чиним на «rauchen — курить» (тот же класс, что fix-dictionary,
//    но 1-е лицо, которое проверка «-st» не ловит).
//
// Идемпотентный: план → --apply; повторный запуск ничего не меняет.
// 💸 OpenAI: только перевод одной исправленной фразы (~$0.0002).
import { db } from '../src/db/index.js'
import { translateExercisePayloads, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')

const { rows: exRows } = await db.query(
  `SELECT id, payload, word_id FROM exercises WHERE id = 184834`)
const ex = exRows[0]
const exNeeds = ex && String(ex.payload?.sentence || '').includes('er, sie, es')

const { rows: wRows } = await db.query(
  `SELECT id, word_de, translation_ru FROM words WHERE lesson_id = 638 AND word_de = 'Rauche'`)
const rauche = wRows[0]

const { rows: zuRows } = await db.query(
  `SELECT id FROM words WHERE lesson_id = 638 AND word_de = 'zumachen'`)
const zumachen = zuRows[0]

console.log(`#184834: ${ex ? (exNeeds ? `чинить («${ex.payload.sentence}»)` : 'уже исправлено') : 'не найдено'}`)
console.log(`слово «Rauche»: ${rauche ? `чинить (#${rauche.id})` : 'уже исправлено / не найдено'}`)

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено.`)
  console.log(`  node scripts/fix-lesson-638.mjs --apply`)
  process.exit(0)
}

if (exNeeds) {
  const next = { ...ex.payload, sentence: 'Er ___ die Tür zu.', blank: 'macht',
    options: ['macht', 'machst', 'machen'] }
  await db.query(
    `UPDATE exercises SET payload = $1, word_id = COALESCE($2, word_id),
            payload_translations = '{}'::jsonb WHERE id = 184834`,
    [JSON.stringify(next), zumachen?.id || null])
  // Перевод новой фразы на локали — иначе подсказка останется от старой строки
  const results = await translateExercisePayloads(
    [{ id: 184834, type: 'fill_blank', payload: next }])
  for (const [id, langs] of Object.entries(results)) {
    await db.query(`UPDATE exercises SET payload_translations = payload_translations || $1::jsonb WHERE id = $2`,
      [JSON.stringify(langs), parseInt(id)])
  }
  console.log('✔ #184834 → «Er ___ die Tür zu.» (слово zumachen)')
}

if (rauche) {
  await db.query(
    `UPDATE words SET word_de = 'rauchen', translation_ru = 'курить', translations = '{}'::jsonb
     WHERE id = $1`, [rauche.id])
  // В карточке/диктанте/озвучке слово лежит и внутри payload — меняем точной строкой
  await db.query(
    `UPDATE exercises SET payload = replace(replace(payload::text, '"Rauche"', '"rauchen"'), '"курю"', '"курить"')::jsonb
     WHERE word_id = $1`, [rauche.id])
  console.log('✔ «Rauche» → «rauchen — курить» (и его упражнения)')
}

await logOperation({ kind: 'cleanup', status: 'ok', provider: 'openai', model: 'gpt-4o-mini',
  costUsd: usageCostUSD(),
  message: `Урок 638: сирота #184834 привязана к zumachen, «Rauche» → «rauchen»` }).catch(() => {})

console.log(`\nГотово.`)
process.exit(0)
