#!/usr/bin/env node
// Аудит всей базы: ищем упражнения, которые ученик не может пройти, и формальные
// грамматические ошибки. Приложение проверяет каждый урок сразу после создания
// (auditLessonAndLog в processor.js), а этот скрипт прогоняет ту же проверку по проду.
//
// ⚠️ Логика проверок ОДНА — services/lessonAudit.js. Раньше скрипт держал собственную
// копию правил, и они успели разойтись: опечатку в маркерах языка поправили в сервисе,
// а в скрипте нет — отчёты стали противоречить друг другу. Своих правил тут быть не должно.
//
// Повод, ради которого всё затевалось: 27–28.07.2026 нашлось, что 31% упражнений
// «Добавь букву» нерешаемы (маска не сходится с ответом), 70 «Заполни пропуск» шли без
// пропуска, а в базе лежали «verb: kochen» и «Enthschuldigung». Это существовало
// месяцами и всплывало, только когда на него натыкался живой ученик.
//
// 💸 Ничего не тратит и ничего не меняет: только читает и печатает отчёт.
//
//   node scripts/audit-exercises.mjs            # весь отчёт
//   node scripts/audit-exercises.mjs --lang de  # только один язык
//
import { execFileSync } from 'child_process'
import { checkExercise, checkWord } from '../backend/src/services/lessonAudit.js'

const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const lang = argOf('--lang', null)
const SSH_HOST = process.env.PROD_SSH_HOST || 'seoshkin-tools-core'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'

const prodSql = (sql) => execFileSync('ssh', [SSH_HOST,
  `cd ${PROD_DIR} && docker compose -f docker-compose.prod.yml exec -T db ` +
  `psql -U german_app -d german_learning -t -A -c ` + JSON.stringify(sql.replace(/\s+/g, ' ').trim()),
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()

const langFilter = lang ? `AND l.target_lang = '${lang.replace(/[^a-z]/gi, '')}'` : ''

const exercises = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT e.id, e.type, e.payload, e.word_id, e.lesson_id, l.target_lang, w.translation_ru
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
    LEFT JOIN words w ON w.id = e.word_id
    WHERE TRUE ${langFilter}) t`))

const words = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT w.id, w.word_de, w.lesson_id, l.target_lang
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE TRUE ${langFilter}) t`))

const issues = [
  ...exercises.flatMap(e => checkExercise(e).map(i => ({ ...i, where: `упр#${e.id} урок ${e.lesson_id}` }))),
  ...words.flatMap(w => checkWord(w).map(i => ({ ...i, where: `слово#${w.id} урок ${w.lesson_id}` }))),
]

const byKind = {}
for (const i of issues) (byKind[`${i.level}|${i.kind}`] ||= []).push(i)

console.log(`Проверено: упражнений ${exercises.length}, слов ${words.length}${lang ? ` (язык ${lang})` : ''}`)
console.log(`Найдено проблем: ${issues.length}\n`)

for (const [level, title] of [['blocker', '🔴 БЛОКЕРЫ — упражнение нельзя пройти'],
                              ['warn', '🟡 ВАЖНО — можно пройти, но учит неверно']]) {
  const keys = Object.keys(byKind).filter(k => k.startsWith(level)).sort((a, b) => byKind[b].length - byKind[a].length)
  if (!keys.length) continue
  console.log(title)
  for (const k of keys) {
    const list = byKind[k]
    console.log(`\n  ${k.split('|')[1]} — ${list.length}`)
    for (const i of list.slice(0, 8)) console.log(`     ${i.where}: ${i.text}`)
    if (list.length > 8) console.log(`     … и ещё ${list.length - 8}`)
  }
  console.log()
}
if (!issues.length) console.log('✅ Проблем не найдено.')
