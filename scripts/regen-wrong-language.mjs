#!/usr/bin/env node
// Перегенерация упражнений, написанных НЕ НА ТОМ ЯЗЫКЕ.
//
// Причина была в генераторе: примеры внутри промпта всегда оставались немецкими, и
// модель копировала их язык. В испанском курсе появлялись предложения «Die abeja ist
// klein», в английском — ответ «camera» при вариантах [Kamera, Fernglas, Linse].
// Генератор починен 28.07.2026, но уже созданное он не переписывает — это делает скрипт.
//
// ⚠️ Удаляем ТОЧЕЧНО — только заражённые упражнения, а не весь урок. На этих уроках есть
// прогресс учеников, а удаление упражнения уносит прогресс по нему (каскад). Полная
// перегенерация урока стёрла бы и то, что работает нормально.
// Недостающее потом досоздаёт enrichLesson — уже исправленным промптом.
//
// 💸 Тратит OpenAI на догенерацию (gpt-4o-mini, порядка $0.0002 за слово).
//
//   node scripts/regen-wrong-language.mjs            # показать план
//   node scripts/regen-wrong-language.mjs --apply    # выполнить
//
import { writeFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'
import { checkExercise } from '../backend/src/services/lessonAudit.js'

const apply = process.argv.includes('--apply')
const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
const DC = 'docker compose -f docker-compose.prod.yml'

const prodSql = (sql) => execFileSync('ssh', [SSH_HOST,
  `cd ${PROD_DIR} && ${DC} exec -T db psql -U german_app -d german_learning -t -A -c ` +
  JSON.stringify(sql.replace(/\s+/g, ' ').trim()),
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()

const rows = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT e.id, e.type, e.payload, e.word_id, e.lesson_id, l.target_lang
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
    WHERE l.target_lang IN ('en','es')) t`))

// Берём только упражнения, забракованные именно за чужой язык — остальные дефекты
// лечатся другими инструментами и трогать их тут незачем.
const bad = rows.filter(e => checkExercise(e).some(i => i.text.startsWith('текст не на языке курса')))
const lessons = [...new Set(bad.map(e => e.lesson_id))].sort((a, b) => a - b)

console.log(`Упражнений на чужом языке: ${bad.length}, уроков: ${lessons.length}`)
const byLesson = {}
for (const e of bad) byLesson[e.lesson_id] = (byLesson[e.lesson_id] || 0) + 1
for (const [id, n] of Object.entries(byLesson)) console.log(`  урок ${id}: ${n}`)

if (!apply) { console.log('\nЭто план. Выполнить: --apply'); process.exit(0) }
if (!bad.length) process.exit(0)

const password = execFileSync('ssh', [SSH_HOST,
  `grep -m1 '^POSTGRES_PASSWORD=' ${PROD_DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()
const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
const tunnel = spawn('ssh', ['-N', '-L', '55432:172.19.0.2:5432', SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const db = new pg.Client({ host: '127.0.0.1', port: 55432, user: 'german_app', database: 'german_learning', password })
await db.connect()

try {
  const ids = bad.map(e => e.id)
  // Откат: сохраняем удаляемое целиком, включая прогресс, который уйдёт каскадом.
  const { rows: backup } = await db.query('SELECT * FROM exercises WHERE id = ANY($1::int[])', [ids])
  const { rows: prog } = await db.query('SELECT * FROM user_exercise_progress WHERE exercise_id = ANY($1::int[])', [ids])
  const file = `regen-wrong-language-rollback-${ids.length}.json`
  writeFileSync(file, JSON.stringify({ exercises: backup, progress: prog }, null, 1))
  console.log(`Откат сохранён: ${file} (${backup.length} упражнений, ${prog.length} записей прогресса)`)

  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1::int[])', [ids])
  console.log(`Удалено: ${rowCount}`)
} finally {
  await db.end().catch(() => {})
  tunnel.kill()
}

console.log(`\nТеперь догенерировать недостающее уже исправленным промптом:`)
console.log(`  уроки: ${lessons.join(', ')}`)
console.log(`  на сервере: enrichLesson по каждому из них`)
