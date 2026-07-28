#!/usr/bin/env node
// Чистка ПОВТОРОВ слов между уроками одного курса.
//
// Проблема: учебник повторяет лексику от урока к уроку, и на каждое повторное вхождение
// система создавала полный комплект упражнений. В немецком курсе на 661 уникальное слово
// пришлось 317 повторов и 2260 упражнений: слово «die Frau» встречается в 9 уроках, и
// ученик за день проходит его трижды в разных уроках. Это не интервальное повторение —
// интервалы обеспечивает SRS, — а дублирование, из-за которого уроки превращаются в свалку.
//
// Правило: оставляем ПЕРВОЕ вхождение слова (по порядку уроков), переносим на него
// картинку и переводы, повторы удаляем вместе с их упражнениями.
//
// ⚠️ Урок НЕ чистим, если после чистки в нём осталось бы меньше MIN_WORDS слов: такая
// страница учебника по смыслу повторительная, и вычищать её нечего. Слова между уроками
// НЕ переносим — урок должен соответствовать своей странице, иначе учитель не поймёт,
// откуда в нём взялась лексика из другого раздела.
//
// 💸 Денег не тратит: только переносы и удаления, ИИ не вызывается.
//
//   node scripts/dedup-words-across-lessons.mjs                 # план
//   node scripts/dedup-words-across-lessons.mjs --apply         # выполнить
//   node scripts/dedup-words-across-lessons.mjs --lang de       # только один язык
//
import { writeFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null
// --sets: чистим НАБОРЫ вместо уроков. Там та же болезнь — слово попадает сразу
// в несколько тем («Sprache» в «Языки» и в «Общение»), и на каждое вхождение
// создаётся свой комплект упражнений.
const sets = args.includes('--sets')
const MIN_WORDS = sets ? 3 : 12

const SSH = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const DIR = process.env.PROD_DIR || '/home/seosite/translate'
const prodSql = (sql) => execFileSync('ssh', [SSH,
  `cd ${DIR} && docker compose -f docker-compose.prod.yml exec -T db psql -U german_app -d german_learning -t -A -c ` +
  JSON.stringify(sql.replace(/\s+/g, ' ').trim()),
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()

const langFilter = lang ? `AND l.target_lang = '${lang.replace(/[^a-z]/gi, '')}'` : ''

// Ключ слова — без артикля и регистронезависимо, как в словаре.
const rows = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT w.id, w.word_de, w.lesson_id, l.target_lang, l.owner_id,
           COALESCE(l.lesson_number, 9999) AS lesson_number,
           COALESCE(l.set_theme, l.title) AS title,
           (COALESCE(l.set_theme, '') = 'Разное') AS is_misc,
           (w.image_url IS NOT NULL) AS has_image,
           lower(regexp_replace(w.word_de, '^(der|die|das|ein|eine|el|la|los|las|the|a|an)\\s+', '', 'i')) AS key
      FROM words w JOIN lessons l ON l.id = w.lesson_id
     WHERE l.is_set = ${sets} ${langFilter}
     ORDER BY l.target_lang, l.owner_id,
              (COALESCE(l.set_theme,'') = 'Разное'),
              lesson_number, w.id) t`))
// Порядок сортировки важен: набор «Разное» идёт последним, поэтому при дубле слово
// остаётся в тематическом наборе, а удаляется из свалки. Комментарий держим в JS —
// внутри SQL его нельзя: запрос схлопывается в одну строку и «--» съедает остаток.

// Первое вхождение в рамках (владелец + язык): по порядку уроков, затем по id.
const seen = new Map()
const dups = []
for (const r of rows) {
  const scope = `${r.owner_id}|${r.target_lang}|${r.key}`
  if (!seen.has(scope)) { seen.set(scope, r); continue }
  dups.push({ ...r, canon: seen.get(scope) })
}

// Сколько слов останется в уроке, если удалить все его повторы
const totalByLesson = {}, dupByLesson = {}
for (const r of rows) totalByLesson[r.lesson_id] = (totalByLesson[r.lesson_id] || 0) + 1
for (const d of dups) dupByLesson[d.lesson_id] = (dupByLesson[d.lesson_id] || 0) + 1

const skipped = new Set()
for (const [lid, dup] of Object.entries(dupByLesson)) {
  if (totalByLesson[lid] - dup < MIN_WORDS) skipped.add(Number(lid))
}
const plan = dups.filter(d => !skipped.has(d.lesson_id))

console.log(`Слов всего: ${rows.length}, уникальных: ${seen.size}, повторов: ${dups.length}`)
console.log(`К удалению: ${plan.length}. Пропущено уроков (осталось бы <${MIN_WORDS} слов): ${skipped.size}`)

const byLesson = {}
for (const d of plan) (byLesson[d.lesson_id] ||= { title: d.title, n: 0, num: d.lesson_number }).n++
for (const [lid, v] of Object.entries(byLesson).sort((a, b) => a[1].num - b[1].num)) {
  console.log(`  урок ${v.num} «${String(v.title).slice(0, 34)}»: ${totalByLesson[lid]} → ${totalByLesson[lid] - v.n} (минус ${v.n})`)
}
for (const lid of skipped) console.log(`  ⏭ урок ${lid}: пропущен, осталось бы ${totalByLesson[lid] - dupByLesson[lid]}`)

if (!apply) { console.log('\nЭто план. Выполнить: --apply'); process.exit(0) }
if (!plan.length) process.exit(0)

// ── Выполнение ────────────────────────────────────────────────────────────────
const password = execFileSync('ssh', [SSH, `grep -m1 '^POSTGRES_PASSWORD=' ${DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()
const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
const tunnel = spawn('ssh', ['-N', '-L', '55432:172.19.0.2:5432', SSH], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const db = new pg.Client({ host: '127.0.0.1', port: 55432, user: 'german_app', database: 'german_learning', password })
await db.connect()

let moved = 0, deleted = 0
try {
  const ids = plan.map(d => d.id)
  const { rows: bw } = await db.query('SELECT * FROM words WHERE id = ANY($1::int[])', [ids])
  const { rows: be } = await db.query('SELECT * FROM exercises WHERE word_id = ANY($1::int[])', [ids])
  const { rows: bp } = await db.query(
    `SELECT p.* FROM user_exercise_progress p JOIN exercises e ON e.id = p.exercise_id
      WHERE e.word_id = ANY($1::int[])`, [ids])
  const file = `dedup-words-rollback-${ids.length}.json`
  writeFileSync(file, JSON.stringify({ words: bw, exercises: be, progress: bp }, null, 1))
  console.log(`Откат: ${file} (слов ${bw.length}, упражнений ${be.length}, прогресса ${bp.length})`)

  for (const d of plan) {
    // Ценное с повтора переносим на первое вхождение, если там пусто
    await db.query(
      `UPDATE words c SET image_url = COALESCE(c.image_url, x.image_url),
              example_sentence = COALESCE(c.example_sentence, x.example_sentence),
              translations = COALESCE(x.translations, '{}'::jsonb) || COALESCE(c.translations, '{}'::jsonb)
         FROM words x WHERE c.id = $1 AND x.id = $2`, [d.canon.id, d.id])
    moved++
  }
  const { rowCount } = await db.query('DELETE FROM words WHERE id = ANY($1::int[])', [ids])
  deleted = rowCount
} finally {
  await db.end().catch(() => {})
  tunnel.kill()
}
console.log(`Готово: перенесено данных с ${moved} повторов, удалено слов ${deleted}`)
