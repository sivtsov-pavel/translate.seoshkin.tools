#!/usr/bin/env node
// Починка «выбери ответ» без привязки к слову (word_id NULL) на проде.
//
// Найдено 07.08.2026: 28 multiple_choice-упражнений не привязаны к слову — карточка
// выходит без картинки и перевода. У части из них генератор вдобавок подставил в вопрос
// РУССКИЙ перевод вместо слова курса («Wie heißt das auf Russisch: разговор?») — вопрос
// сам показывает ответ. Проверки на это добавлены в services/lessonAudit.js, этот скрипт
// лечит УЖЕ НАКОПЛЕННЫЕ данные.
//
// Что делает (детерминированно, по словарю того же урока):
//   • слово вопроса совпало с word_de (с артиклем/без, без учёта регистра) → привязываем word_id;
//   • вопрос по-русски и совпал с translation_ru → привязываем word_id и
//     пересобираем вопрос со словом курса;
//   • вопрос по-русски и слова нет в уроке → удаляем (упражнение бессмысленно);
//   • слово курса, но точного совпадения нет (словоформы «backe», «packst») → НЕ трогаем,
//     печатаем на ручной разбор. Угадывать лемму эвристикой не пытаемся — правило с
//     исключениями хуже, чем его отсутствие (см. docs/OPERATIONS.md).
//
// 💸 ДЕНЕГ НЕ ТРАТИТ: ИИ не вызывается, всё по словарю урока.
//
//   node scripts/fix-orphan-mc.mjs            # показать, что будет изменено
//   node scripts/fix-orphan-mc.mjs --apply    # записать в прод
//
import { execFileSync, spawn } from 'child_process'

const apply = process.argv.includes('--apply')
const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
const DB_IP = process.env.PROD_DB_IP || '172.19.0.2'
const PORT = 55432

function prodSql(sql) {
  return execFileSync('ssh', [SSH_HOST,
    `cd ${PROD_DIR} && docker compose -f docker-compose.prod.yml exec -T db ` +
    `psql -U german_app -d german_learning -t -A -c ${JSON.stringify(sql.replace(/\s+/g, ' ').trim())}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

// ── Данные ────────────────────────────────────────────────────────────────────
const orphans = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT e.id, e.lesson_id, e.type, e.payload, l.target_lang
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
    WHERE e.type = 'multiple_choice' AND e.word_id IS NULL) t`))

const lessonIds = [...new Set(orphans.map(o => o.lesson_id))]
const words = lessonIds.length ? JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT id, lesson_id, word_de, translation_ru FROM words
    WHERE lesson_id IN (${lessonIds.join(',')})) t`)) : []

const byLesson = new Map()
for (const w of words) {
  if (!byLesson.has(w.lesson_id)) byLesson.set(w.lesson_id, [])
  byLesson.get(w.lesson_id).push(w)
}

// Слово из вопроса: «Wie heißt das auf Russisch: X?» → X (после последнего двоеточия)
const questionWord = (q) => String(q || '').split(':').pop().replace(/[?？]/g, '').trim()
const stripArticle = (s) => String(s || '').replace(/^(der|die|das|the|el|la|los|las|un|una)\s+/i, '').trim()
const norm = (s) => stripArticle(s).toLowerCase()
const isCyr = (s) => /[Ѐ-ӿ]/.test(String(s || ''))

// ── План ──────────────────────────────────────────────────────────────────────
const link = []      // привязать word_id
const rewrite = []   // привязать + пересобрать вопрос
const remove = []    // удалить
const manual = []    // на ручной разбор

for (const o of orphans) {
  const qWord = questionWord(o.payload?.question)
  const lessonWords = byLesson.get(o.lesson_id) || []
  if (isCyr(qWord)) {
    const w = lessonWords.find(x => String(x.translation_ru || '').trim().toLowerCase() === qWord.toLowerCase())
    if (w) {
      const question = String(o.payload.question).replace(qWord, w.word_de)
      rewrite.push({ ...o, word: w, question })
    } else {
      remove.push({ ...o, qWord })
    }
  } else {
    const w = lessonWords.find(x =>
      String(x.word_de).toLowerCase() === qWord.toLowerCase() || norm(x.word_de) === qWord.toLowerCase())
    if (w) link.push({ ...o, word: w })
    else manual.push({ ...o, qWord })
  }
}

console.log(`Сирот multiple_choice (word_id NULL): ${orphans.length}`)
console.log(`Привязать слово: ${link.length}`)
for (const f of link) console.log(`  🔗 ${f.id} урок ${f.lesson_id}: «${questionWord(f.payload.question)}» → слово #${f.word.id} «${f.word.word_de}»`)
console.log(`Привязать + переписать русский вопрос: ${rewrite.length}`)
for (const f of rewrite) console.log(`  ✏️ ${f.id} урок ${f.lesson_id}: «${f.payload.question}» → «${f.question}» (слово #${f.word.id})`)
console.log(`Удалить (русское слово, в уроке его нет): ${remove.length}`)
for (const f of remove) console.log(`  🗑 ${f.id} урок ${f.lesson_id}: «${f.payload.question}»`)
console.log(`Ручной разбор (словоформы, точного слова нет): ${manual.length}`)
for (const f of manual) console.log(`  ✋ ${f.id} урок ${f.lesson_id}: «${f.qWord}»`)

if (!apply) {
  console.log(`\nЭто пробный прогон. Записать: --apply`)
  process.exit(0)
}

// ── Запись через ssh-туннель (порт наружу не публикуется) ─────────────────────
const password = execFileSync('ssh', [SSH_HOST,
  `grep -m1 '^POSTGRES_PASSWORD=' ${PROD_DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()

// Файл отката: полные строки удаляемых и старые payload изменяемых.
const { writeFileSync } = await import('fs')
const rollback = `orphan-mc-rollback-${orphans.length}.json`
writeFileSync(rollback, JSON.stringify({
  removed: remove,
  relinked: [...link, ...rewrite].map(f => ({ id: f.id, payload: f.payload, word_id: null })),
}, null, 1))
console.log(`Откат сохранён: ${rollback}`)

const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
const tunnel = spawn('ssh', ['-N', '-L', `${PORT}:${DB_IP}:5432`, SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))

const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'german_app', database: 'german_learning', password })
try {
  await client.connect()
  for (const f of link) {
    await client.query('UPDATE exercises SET word_id = $1 WHERE id = $2 AND word_id IS NULL', [f.word.id, f.id])
  }
  for (const f of rewrite) {
    await client.query(
      `UPDATE exercises SET word_id = $1, payload = jsonb_set(payload, '{question}', to_jsonb($2::text))
       WHERE id = $3 AND word_id IS NULL`,
      [f.word.id, f.question, f.id])
  }
  for (const f of remove) {
    await client.query('DELETE FROM exercises WHERE id = $1 AND word_id IS NULL', [f.id])
  }
  console.log(`Привязано: ${link.length}, переписано: ${rewrite.length}, удалено: ${remove.length}`)
} finally {
  await client.end().catch(() => {})
  tunnel.kill()
}
