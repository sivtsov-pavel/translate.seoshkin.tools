#!/usr/bin/env node
// Пересадка УЖЕ СОЗДАННЫХ упражнений на реальные предложения урока.
//
// «Заполни пропуск» и «Напиши предложение» должны строиться на фразах со страниц учебника
// и тетради: в них падеж, порядок слов и спряжение, которые класс разбирал. Промпт об этом
// просил, но модель просьбу регулярно игнорировала — замер по уроку 19 дал 5% упражнений
// на живых фразах при потолке 33%. Новая генерация теперь подставляет их кодом, а этот
// скрипт делает то же самое для упражнений, созданных раньше.
//
// 💸 НЕ ТРАТИТ НИ ЦЕНТА: ИИ не вызывается, это работа со строками. Пересоздавать упражнения
//    заново через модель не нужно — текст пересобирается из того, что уже есть в базе.
//
// Прогресс учеников не теряется: у упражнения меняется только payload, id остаётся прежним,
// а расписание повторений привязано к id.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/ground-existing.mjs           # план
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/ground-existing.mjs --apply
//   ... --lang de --lesson 571
//
import { db } from '../src/db/index.js'
import { groundFillBlank, groundSentenceWrite } from '../src/services/grounding.js'
import { logOperation } from '../src/services/opLog.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null
const only = args.includes('--lesson') ? parseInt(args[args.indexOf('--lesson') + 1]) : null

const { rows: lessons } = await db.query(`
  SELECT l.id, l.lesson_number, l.target_lang, COALESCE(l.set_theme, l.title) AS title
    FROM lessons l
   WHERE EXISTS (SELECT 1 FROM lesson_sentences s WHERE s.lesson_id = l.id)
     AND ($1::text IS NULL OR l.target_lang = $1)
     AND ($2::int  IS NULL OR l.id = $2)
   ORDER BY l.target_lang, l.lesson_number NULLS LAST, l.id`, [lang, only])

console.log(`Уроков с предложениями: ${lessons.length}`)
let checked = 0, changed = 0
const perLesson = []

for (const L of lessons) {
  const { rows: sents } = await db.query('SELECT text FROM lesson_sentences WHERE lesson_id=$1 ORDER BY id', [L.id])
  const bank = sents.map(s => s.text)
  const { rows: ex } = await db.query(
    `SELECT id, type, payload FROM exercises WHERE lesson_id=$1 AND type IN ('fill_blank','sentence_write')`, [L.id])

  let n = 0
  for (const e of ex) {
    checked++
    const next = e.type === 'fill_blank'
      ? groundFillBlank(e.payload, bank, L.target_lang)
      : groundSentenceWrite(e.payload, bank, L.target_lang)
    if (next === e.payload) continue
    n++
    if (apply) await db.query('UPDATE exercises SET payload=$1 WHERE id=$2', [JSON.stringify(next), e.id])
  }
  if (n) {
    changed += n
    perLesson.push(`  ${L.target_lang} урок ${L.lesson_number ?? '—'} «${String(L.title).slice(0, 30)}»: ${n} из ${ex.length} (фраз ${bank.length})`)
  }
}

console.log(perLesson.join('\n'))
console.log(`\nПроверено упражнений: ${checked}, пересажено на реальные фразы: ${changed}`)
if (!apply) { console.log('\nЭто план, база не менялась. Выполнить: --apply'); process.exit(0) }

await logOperation({
  kind: 'exercises', provider: 'none', model: null, status: 'ok', items: changed, costUsd: 0,
  message: `пересажено на реальные предложения урока: ${changed}`,
  meta: { lang, lesson: only },
})
process.exit(0)
