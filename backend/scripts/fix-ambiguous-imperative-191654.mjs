#!/usr/bin/env node
// Упражнение #191654: два правильных ответа вместо одного.
//
// После перегенерации 29.09.2026 вышло «___ auf die Hausaufgaben!» с вариантами
// Achte / Achten / Achtet. Ответом считается «Achte» (императив для du), но
// «Achtet auf die Hausaufgaben!» — императив для ihr — точно такой же верный
// немецкий. Ученик выбирает правильное и получает ошибку.
//
// Аудит такого не видит: формально пропуск есть, ответ среди вариантов, повторов
// нет. Ловится только чтением глазами.
//
// Чиним переводом в изъявительное наклонение с явным подлежащим: при «Ich»
// подходит ровно одна форма. Тот же приём, что у соседнего #191469 («Ich ___
// die Schokolade» → liebe).
//
// 💸 OpenAI НЕ вызывается — цена $0. Идемпотентен: повторный запуск видит, что
//    уже поставлено, и ничего не делает.
import { db } from '../src/db/index.js'
import { checkExercise } from '../src/services/lessonAudit.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ID = 191654
const WANT = {
  sentence: 'Ich ___ auf die Hausaufgaben.',
  blank: 'achte',
  options: ['achte', 'achten', 'achtet'],
}

const { rows } = await db.query('SELECT id, type, word_id, payload FROM exercises WHERE id = $1', [ID])
const ex = rows[0]
if (!ex) { console.error(`Упражнение #${ID} не найдено`); process.exit(1) }

// Сравнение с сортировкой ключей: jsonb возвращает их в своём порядке, и
// сравнение сырых строк всегда даёт «различаются» — скрипт перестаёт быть
// идемпотентным и переписывает одно и то же при каждом запуске.
const stable = (o) => JSON.stringify(o, Object.keys(o).sort())
const same = stable(ex.payload) === stable(WANT)
console.log(`\n#${ID}`)
console.log(`  сейчас: ${JSON.stringify(ex.payload)}`)
console.log(`  станет: ${JSON.stringify(WANT)}`)
if (same) { console.log('\nУже стоит — делать нечего.'); process.exit(0) }

// Проверяем новое теми же правилами, что и всё остальное
const issues = checkExercise({ id: ID, type: 'fill_blank', word_id: ex.word_id, payload: WANT, target_lang: 'de' })
if (issues.length) {
  console.error(`\n✖ новое упражнение само не проходит аудит: ${issues.map(i => i.text).join('; ')}`)
  process.exit(1)
}
console.log('  аудит нового: чисто')

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено.\n  node scripts/fix-ambiguous-imperative-191654.mjs --apply`)
  process.exit(0)
}

// payload_translations сбрасываем: там перевод СТАРОГО предложения
await db.query('UPDATE exercises SET payload = $1, payload_translations = NULL WHERE id = $2',
  [JSON.stringify(WANT), ID])
await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0, items: 1,
  message: `#${ID}: убрана двусмысленность императива (Achte/Achtet)` }).catch(() => {})
console.log('\nГотово. Переводы payload сброшены — их допишет translate-скрипт.')
process.exit(0)
