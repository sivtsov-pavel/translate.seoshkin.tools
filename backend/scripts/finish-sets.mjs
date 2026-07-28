#!/usr/bin/env node
// Дорисовка наборов: переводы на локали и упражнения для слов, у которых их ещё нет.
//
// distributeWordsToSets возвращает ответ сразу, а обогащение запускает фоном — так задумано
// для кнопки «В наборы»: учитель не ждёт. Но у фонового куска нет владельца: когда процесс,
// который его начал, завершается, недоделанная работа умирает вместе с ним. При раскладке
// целого курса (589 английских слов) это заметно — набор остаётся в статусе «processing»,
// слова есть, упражнений нет, и ученику там делать нечего.
//
// Этот проход доводит такие наборы до конца и ставит им «done». Идемпотентен: enrichLesson
// и regenerateExercisesFromDb бьют только по недостающему, повторный запуск ничего не портит.
//
// 💸 gpt-4o-mini (упражнения + переводы). Картинки не генерируются: платная генерация
//    выключена в супер-админке, берутся только готовые из банка.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/finish-sets.mjs --lang en
//
import { db } from '../src/db/index.js'
import { enrichLesson, regenerateExercisesFromDb } from '../src/services/processor.js'
import { resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation, textProvider } from '../src/services/opLog.js'

const args = process.argv.slice(2)
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null

const { rows: sets } = await db.query(`
  SELECT l.id, l.set_theme, l.target_lang,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id = w.id)) AS todo
    FROM lessons l JOIN words w ON w.lesson_id = l.id
   WHERE l.is_set AND ($1::text IS NULL OR l.target_lang = $1)
   GROUP BY l.id
  HAVING count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id = w.id)) > 0
   ORDER BY l.id`, [lang])

console.log(`Наборов к дорисовке: ${sets.length}, слов без упражнений: ${sets.reduce((s, r) => s + Number(r.todo), 0)}`)
if (!sets.length) process.exit(0)

resetUsage()
const t0 = Date.now()
let ok = 0, failed = 0

for (const s of sets) {
  process.stdout.write(`  [${s.target_lang}] ${s.set_theme} — ${s.todo} слов… `)
  try {
    await enrichLesson(s.id)
    await regenerateExercisesFromDb(s.id)
    await db.query("UPDATE lessons SET status='done', progress='Готово.' WHERE id=$1", [s.id])
    ok++
    console.log('готово')
  } catch (e) {
    failed++
    console.log(`ошибка: ${e.message}`)
  }
}

const cost = usageCostUSD()
console.log(`\nДорисовано наборов: ${ok}, с ошибками: ${failed}, цена $${cost.toFixed(4)}`)
await logOperation({
  kind: 'sets', provider: textProvider(), model: 'gpt-4o-mini',
  status: failed ? 'partial' : 'ok', items: ok, costUsd: cost, durationMs: Date.now() - t0,
  message: `дорисовка наборов${lang ? ' ' + lang : ''}: готово ${ok}, ошибок ${failed}`,
  meta: { lang },
})
process.exit(0)
