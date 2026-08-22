#!/usr/bin/env node
// Упражнения без слова (word_id IS NULL) — почему счётчики разъезжаются даже после дедупа.
//
// Генератор вставляет упражнение с word_id = wordIdFor(map, ex.word_de), и когда модель
// вернула упражнение на СЛОВОФОРМУ («backe», «packst», «übersetzen»), которой нет в словаре
// урока, сопоставление даёт null — упражнение всё равно вставляется, но уже ничьё.
// Такое упражнение показывается ученику, раздувает знаменатель типа (в уроке 19 «вставь
// слово» — 61 штука на 51 слово) и при этом не засчитывается ни одному слову.
// Всего на бою 166 таких: уроки 19 (31), 28 (23), 298 (44) и др.
//
// Что делает скрипт:
//   1) привязывает сироту к слову урока — точное совпадение ключевого слова, иначе
//      совпадение по словоформе внутри записи («backe» → «ich backe»);
//   2) если у этого слова упражнение такого типа уже есть — сирота удаляется как дубль;
//   3) не привязанные ни к чему — удаляются (это словоформы, которых в словаре нет,
//      и без слова они всё равно не участвуют в прогрессе).
//
// Идемпотентный, без --apply только печатает план. 💸 OpenAI не трогает: $0.
// Бэкап удаляемых — в /tmp контейнера, сразу забрать на хост:
//   docker cp translate-backend-1:/tmp/orphan-exercises-rollback-2026-08-22.json /home/seosite/translate-backups/
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const rollbackIdx = process.argv.indexOf('--rollback')
const ROLLBACK = rollbackIdx > -1 ? process.argv[rollbackIdx + 1] : null
const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp'

const norm = (s) => String(s || '').toLowerCase()
  .replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/, '').trim()

// Ключевое поле ответа у каждого типа (то же, что в dedup-exercises)
function answerOf(type, payload) {
  const p = payload || {}
  switch (type) {
    case 'letter_fill': return p.answer ?? p.word_de
    case 'fill_blank': return p.blank
    case 'multiple_choice': {
      // «Wie heißt das auf Russisch: backe?» — слово стоит в вопросе
      const m = String(p.question || '').match(/:\s*([^?]+)\?/)
      return m ? m[1] : p.word_de
    }
    default: return p.word_de ?? p.answer ?? null
  }
}

async function rollback(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const ex of data.deleted) {
    await db.query(
      `INSERT INTO exercises (id, lesson_id, word_id, type, payload, easiness_factor, interval_days,
                              repetitions, next_review_date, created_at, image_url, payload_translations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [ex.id, ex.lesson_id, ex.word_id, ex.type, ex.payload, ex.easiness_factor, ex.interval_days,
       ex.repetitions, ex.next_review_date, ex.created_at, ex.image_url, ex.payload_translations])
  }
  for (const l of (data.linked || [])) {
    await db.query('UPDATE exercises SET word_id = NULL WHERE id = $1', [l.id])
  }
  await db.query(`SELECT setval('exercises_id_seq', (SELECT max(id) FROM exercises))`)
  console.log(`Откат: восстановлено ${data.deleted.length}, отвязано обратно ${(data.linked || []).length}`)
}

async function main() {
  if (ROLLBACK) { await rollback(ROLLBACK); return }

  const { rows: orphans } = await db.query(`
    SELECT e.id, e.lesson_id, e.type, e.payload, l.lesson_number, l.target_lang
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
    WHERE e.word_id IS NULL ORDER BY e.lesson_id, e.type, e.id`)

  if (!orphans.length) { console.log('Упражнений без слова нет — чинить нечего.'); return }

  // Словарь уроков, которых касаемся, + какие типы у каждого слова уже заняты
  const lessonIds = [...new Set(orphans.map(o => o.lesson_id))]
  const { rows: words } = await db.query(
    'SELECT id, lesson_id, word_de FROM words WHERE lesson_id = ANY($1)', [lessonIds])
  const { rows: taken } = await db.query(
    'SELECT lesson_id, word_id, type FROM exercises WHERE lesson_id = ANY($1) AND word_id IS NOT NULL', [lessonIds])
  const takenSet = new Set(taken.map(t => `${t.lesson_id}|${t.word_id}|${t.type}`))

  const byLessonWords = new Map()
  for (const w of words) {
    if (!byLessonWords.has(w.lesson_id)) byLessonWords.set(w.lesson_id, [])
    byLessonWords.get(w.lesson_id).push(w)
  }

  const toLink = [], toDeleteDup = [], toDeleteOrphan = []
  for (const o of orphans) {
    const key = norm(answerOf(o.type, o.payload))
    const list = byLessonWords.get(o.lesson_id) || []
    let word = key ? list.find(w => norm(w.word_de) === key) : null
    // «backe» → «ich backe»: ключ стоит отдельным словом внутри записи словаря
    if (!word && key) word = list.find(w => norm(w.word_de).split(/\s+/).includes(key))
    if (!word) { toDeleteOrphan.push(o); continue }
    const slot = `${o.lesson_id}|${word.id}|${o.type}`
    if (takenSet.has(slot)) { toDeleteDup.push({ ...o, _word: word.word_de }); continue }
    takenSet.add(slot) // два сироты на один слот — второй уйдёт в дубли
    toLink.push({ ...o, _wordId: word.id, _word: word.word_de })
  }

  console.log(`Упражнений без слова: ${orphans.length}`)
  console.log(`  → привязать к слову: ${toLink.length}`)
  console.log(`  → удалить как дубль (у слова этот тип уже есть): ${toDeleteDup.length}`)
  console.log(`  → удалить (слова нет в словаре урока): ${toDeleteOrphan.length}`)

  console.log('\nПримеры привязки:')
  for (const e of toLink.slice(0, 8)) {
    console.log(`  урок ${e.lesson_number} · ${e.type} · «${answerOf(e.type, e.payload)}» → слово «${e._word}»`)
  }
  console.log('\nПримеры удаления (слова нет в словаре):')
  for (const e of toDeleteOrphan.slice(0, 8)) {
    console.log(`  урок ${e.lesson_number} · ${e.type} · «${answerOf(e.type, e.payload)}» · ${JSON.stringify(e.payload).slice(0, 110)}`)
  }

  if (!APPLY) { console.log('\nЭто ПЛАН. Запусти с --apply, чтобы применить.'); return }

  const delIds = [...toDeleteDup, ...toDeleteOrphan].map(e => e.id)
  const { rows: fullRows } = await db.query('SELECT * FROM exercises WHERE id = ANY($1)', [delIds])
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, 'orphan-exercises-rollback-2026-08-22.json')
  fs.writeFileSync(file, JSON.stringify({ deleted: fullRows, linked: toLink.map(e => ({ id: e.id })) }, null, 1))
  console.log(`\nБэкап: ${file}`)

  for (const e of toLink) await db.query('UPDATE exercises SET word_id = $1 WHERE id = $2', [e._wordId, e.id])
  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1)', [delIds])
  console.log(`Привязано: ${toLink.length}, удалено: ${rowCount}`)
  console.log(`Откат: node scripts/fix-orphan-exercises-2026-08-22.mjs --rollback ${file}`)

  await logOperation({
    kind: 'cleanup', status: 'ok', costUsd: 0, items: toLink.length + rowCount,
    message: `Упражнения без слова: привязано ${toLink.length}, удалено ${rowCount}`,
    meta: { script: 'fix-orphan-exercises-2026-08-22', backup: file },
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
