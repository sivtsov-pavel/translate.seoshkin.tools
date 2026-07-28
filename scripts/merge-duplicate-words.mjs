#!/usr/bin/env node
// Слияние дублей слов ВНУТРИ одного урока.
//
// Откуда берутся: одно и то же слово попадает в урок с разных сканов — «das Auge» и «Auge»,
// «die Frau» и «Frau». Словарь их схлопывает и выглядит нормально, а в самом уроке ученик
// видит слово дважды, причём у пустышки нет ни картинки, ни упражнений.
//
// Что делает: выбирает канонический вариант, переносит на него всё ценное (картинку,
// переводы, пример, статусы, недостающие типы упражнений) и удаляет пустышку.
// 💸 Картинки НЕ ПЕРЕРИСОВЫВАЮТСЯ — переносится ссылка на уже готовую. Денег не тратит.
//
// ⚠️ Удаляет строки из words. Перед этим пишет файл отката с полным содержимым.
// Каскад: удаление слова уносит его exercises и user_word_status — поэтому всё нужное
// переносим на канон ЗАРАНЕЕ.
//
//   node scripts/merge-duplicate-words.mjs           # показать план
//   node scripts/merge-duplicate-words.mjs --apply   # выполнить
//
import { writeFileSync } from 'fs'
import { execFileSync, spawn } from 'child_process'

const apply = process.argv.includes('--apply')
const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
const DC = 'docker compose -f docker-compose.prod.yml'

// Ключ дедупа — как в словаре: без артикля, регистр первой буквы значим («essen» и
// «das Essen» — РАЗНЫЕ слова, глагол и существительное, их сливать нельзя).
const B = `regexp_replace(w.word_de, '^(der|die|das|ein|eine|el|la|los|las|the)\\s+', '', 'i')`
const KEY = `(left(${B}, 1) || lower(substr(${B}, 2)))`

const raw = execFileSync('ssh', [SSH_HOST,
  `cd ${PROD_DIR} && ${DC} exec -T db psql -U german_app -d german_learning -t -A -c ` +
  JSON.stringify(`
    SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
      SELECT w.id, w.lesson_id, w.word_de, w.translation_ru, w.image_url,
             (w.word_de ~* '^(der|die|das|ein|eine|el|la|los|las|the)\\s') AS has_article,
             (SELECT count(*) FROM exercises e WHERE e.word_id = w.id)::int AS ex_count,
             ${KEY} AS kkey
      FROM words w
      WHERE (w.lesson_id, ${KEY}) IN (
        SELECT w2.lesson_id, ${KEY.replace(/w\./g, 'w2.')} FROM words w2
        GROUP BY w2.lesson_id, ${KEY.replace(/w\./g, 'w2.')} HAVING count(*) > 1)
      ORDER BY w.lesson_id, kkey, w.id) t`.replace(/\s+/g, ' ')),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

const rows = JSON.parse(raw)
const groups = new Map()
for (const r of rows) {
  const k = `${r.lesson_id}|${r.kkey}`
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

const ART = /^(der|die|das|ein|eine|el|la|los|las|the)\s+/i
const articleOf = (w) => (w.match(ART)?.[1] || '').toLowerCase()
// Фраза («Auf Wiedersehen») — артикля у неё быть не должно вовсе.
const isPhrase = (w) => /\s/.test(w.replace(ART, '').trim())

// Канон: с артиклем → больше упражнений → есть картинка → меньший id.
// Артикль первым приоритетом: «das Auge» информативнее голого «Auge» для ученика.
const pickCanon = (g) => [...g].sort((a, b) =>
  Number(b.has_article) - Number(a.has_article) ||
  b.ex_count - a.ex_count ||
  Number(!!b.image_url) - Number(!!a.image_url) ||
  a.id - b.id)[0]

// Спорные группы НЕ трогаем — их должен посмотреть человек:
//  • разные артикли («die Unterschrift» и «der Unterschrift» — один из них ошибка,
//    и правило «с артиклем главнее» вслепую выберет неправильный);
//  • артикль приклеен к фразе («der Auf Wiedersehen») — это мусор, а не канон.
function disputed(g) {
  const arts = new Set(g.map(w => articleOf(w.word_de)).filter(Boolean))
  if (arts.size > 1) return 'разные артикли'
  if (g.some(w => articleOf(w.word_de) && isPhrase(w.word_de))) return 'артикль у фразы'
  return null
}

const plan = []
const skipped = []
for (const [, g] of groups) {
  const why = disputed(g)
  if (why) { skipped.push({ g, why }); continue }
  const canon = pickCanon(g)
  for (const d of g) if (d.id !== canon.id) plan.push({ canon, dup: d })
}

console.log(`Групп дублей: ${groups.size}, к слиянию записей: ${plan.length}`)
for (const { canon, dup } of plan.slice(0, 25)) {
  console.log(`  урок ${canon.lesson_id}: «${dup.word_de}» (${dup.ex_count} упр)  →  «${canon.word_de}» (${canon.ex_count} упр)`)
}
if (plan.length > 25) console.log(`  … и ещё ${plan.length - 25}`)

if (skipped.length) {
  console.log(`\n⚠️ Пропущено ${skipped.length} групп — нужно решение человека:`)
  for (const { g, why } of skipped) {
    console.log(`  урок ${g[0].lesson_id} [${why}]: ${g.map(w => `«${w.word_de}» (${w.ex_count} упр)`).join('  vs  ')}`)
  }
}
if (!apply) { console.log('\nЭто план. Выполнить: --apply'); process.exit(0) }
if (!plan.length) process.exit(0)

// ── Выполнение через туннель ──────────────────────────────────────────────────
const password = execFileSync('ssh', [SSH_HOST,
  `grep -m1 '^POSTGRES_PASSWORD=' ${PROD_DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()
const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
const tunnel = spawn('ssh', ['-N', '-L', '55432:172.19.0.2:5432', SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const db = new pg.Client({ host: '127.0.0.1', port: 55432, user: 'german_app', database: 'german_learning', password })
await db.connect()

let merged = 0, movedEx = 0, movedImg = 0
try {
  // Файл отката: полное содержимое удаляемых слов и их упражнений.
  const dupIds = plan.map(p => p.dup.id)
  const { rows: backupWords } = await db.query('SELECT * FROM words WHERE id = ANY($1::int[])', [dupIds])
  const { rows: backupEx } = await db.query('SELECT * FROM exercises WHERE word_id = ANY($1::int[])', [dupIds])
  const file = `merge-words-rollback-${plan.length}.json`
  writeFileSync(file, JSON.stringify({ words: backupWords, exercises: backupEx }, null, 1))
  console.log(`Откат сохранён: ${file} (${backupWords.length} слов, ${backupEx.length} упражнений)`)

  for (const { canon, dup } of plan) {
    await db.query('BEGIN')
    try {
      // 1) Картинка — только если у канона её нет. НЕ перерисовываем, переносим ссылку.
      const { rows: [c] } = await db.query('SELECT image_url, example_sentence, translations FROM words WHERE id=$1', [canon.id])
      const { rows: [d] } = await db.query('SELECT image_url, example_sentence, translations FROM words WHERE id=$1', [dup.id])
      if (!c.image_url && d.image_url) {
        await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [d.image_url, canon.id]); movedImg++
      }
      if (!c.example_sentence && d.example_sentence) {
        await db.query('UPDATE words SET example_sentence=$1 WHERE id=$2', [d.example_sentence, canon.id])
      }
      // Переводы: то, чего у канона нет, берём у дубля (канон в приоритете).
      if (d.translations) {
        await db.query(`UPDATE words SET translations = $1::jsonb || COALESCE(translations,'{}'::jsonb) WHERE id=$2`,
          [JSON.stringify(d.translations), canon.id])
      }
      // 2) Упражнения: переносим только типы, которых у канона НЕТ — иначе у слова
      //    появятся два одинаковых упражнения. Остальные уйдут вместе с дублем.
      const { rows: moved } = await db.query(
        `UPDATE exercises SET word_id = $1
          WHERE word_id = $2 AND type NOT IN (SELECT type FROM exercises WHERE word_id = $1)
          RETURNING id`, [canon.id, dup.id])
      movedEx += moved.length
      // 3) Статус слова у ученика — переносим тот, которого у канона нет.
      await db.query(
        `INSERT INTO user_word_status (user_id, word_id, status)
         SELECT user_id, $1, status FROM user_word_status WHERE word_id = $2
         ON CONFLICT (user_id, word_id) DO NOTHING`, [canon.id, dup.id])
      // 4) Удаляем дубль (каскадом уйдут его оставшиеся упражнения и статусы).
      await db.query('DELETE FROM words WHERE id = $1', [dup.id])
      await db.query('COMMIT')
      merged++
    } catch (e) {
      await db.query('ROLLBACK')
      console.error(`  ✗ урок ${canon.lesson_id} «${dup.word_de}»: ${e.message}`)
    }
  }
} finally {
  await db.end().catch(() => {})
  tunnel.kill()
}
console.log(`\nСлито: ${merged}, перенесено упражнений: ${movedEx}, картинок: ${movedImg}`)
