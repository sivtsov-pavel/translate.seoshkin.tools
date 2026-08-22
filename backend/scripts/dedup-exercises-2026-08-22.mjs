#!/usr/bin/env node
// Дедупликация упражнений: одно слово — одно упражнение каждого типа.
//
// Баг Павла от 22.08.2026: «почему разное количество упражнений? 59/59, 0/63, 0/66».
// Знаменатели разъезжались, потому что на одно слово попадало по несколько упражнений
// одного типа: в уроке 19 у «backen» четыре «вставь слово», три «выбери ответ» и три
// «вставь букву». Генератор вставлял всё, что вернула модель, не проверяя, что для этой
// пары (слово, тип) упражнение уже есть, а wordIdFor к тому же схлопывает формы глагола
// на словарное слово («du backst» → backen).
//
// Что оставляем в группе (lesson_id, word_id, type):
//   1) упражнение, по которому уже есть прогресс учеников (не теряем пройденное);
//   2) при равенстве — то, чей ответ совпадает со словарным словом, а не со словоформой;
//   3) при равенстве — самое старое (меньший id).
//
// Скрипт идемпотентный: повторный прогон ничего не находит. Без --apply только печатает план.
// Бэкап удаляемых строк (вместе с прогрессом) — в JSON, откат: --rollback <файл>.
// 💸 OpenAI не трогает вообще: $0.
//
//   node scripts/dedup-exercises-2026-08-22.mjs            # план
//   node scripts/dedup-exercises-2026-08-22.mjs --apply    # удалить лишние
//
// Бэкап пишется в /tmp КОНТЕЙНЕРА — сразу после прогона забрать на хост:
//   docker cp translate-backend-1:/tmp/dedup-exercises-rollback-2026-08-22.json /home/seosite/translate-backups/
// (отчёты аудита 13.08 потеряли ровно потому, что остались в /tmp контейнера).
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const rollbackIdx = process.argv.indexOf('--rollback')
const ROLLBACK = rollbackIdx > -1 ? process.argv[rollbackIdx + 1] : null
const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp'

// Словарная форма без артикля — как в processor.js (wordKeyNorm)
const norm = (s) => String(s || '').toLowerCase()
  .replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/, '').trim()

// Ключевое поле ответа у каждого типа упражнения
function answerOf(type, payload) {
  const p = payload || {}
  switch (type) {
    case 'letter_fill': return p.answer ?? p.word_de
    case 'fill_blank': return p.blank
    case 'flashcard':
    case 'dictation':
    case 'speech': return p.word_de
    case 'multiple_choice': return Array.isArray(p.options) ? p.options[p.correct] : null
    default: return p.word_de ?? p.answer ?? null
  }
}

// Чем упражнение лучше: сначала прогресс учеников, потом соответствие словарной форме, потом возраст
function rank(ex, wordDe) {
  const answer = answerOf(ex.type, ex.payload)
  const exact = answer && norm(answer) === norm(wordDe) ? 1 : 0
  // Для «выбери ответ» и «напиши предложение» ответ — перевод/предложение, там сверяем вопрос
  const mentions = JSON.stringify(ex.payload || {}).toLowerCase().includes(norm(wordDe)) ? 1 : 0
  return [ex.progress_count, exact, mentions, -ex.id]
}
const better = (a, b) => {
  const ra = rank(a, a._word), rb = rank(b, b._word)
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i]
  return false
}

async function rollback(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  let restored = 0
  for (const ex of data.exercises) {
    await db.query(
      `INSERT INTO exercises (id, lesson_id, word_id, type, payload, easiness_factor, interval_days,
                              repetitions, next_review_date, created_at, image_url, payload_translations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [ex.id, ex.lesson_id, ex.word_id, ex.type, ex.payload, ex.easiness_factor, ex.interval_days,
       ex.repetitions, ex.next_review_date, ex.created_at, ex.image_url, ex.payload_translations])
    restored++
  }
  for (const p of data.progress) {
    await db.query(
      `INSERT INTO user_exercise_progress (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [p.user_id, p.exercise_id, p.easiness_factor, p.interval_days, p.repetitions, p.next_review_date])
  }
  await db.query(`SELECT setval('exercises_id_seq', (SELECT max(id) FROM exercises))`)
  console.log(`Откат: восстановлено упражнений ${restored}, записей прогресса ${data.progress.length}`)
}

async function main() {
  if (ROLLBACK) { await rollback(ROLLBACK); return }

  // Все группы «слово + тип», где больше одного упражнения
  const { rows } = await db.query(`
    SELECT e.id, e.lesson_id, e.word_id, e.type, e.payload, w.word_de,
           l.lesson_number, l.target_lang,
           (SELECT count(*) FROM user_exercise_progress uep WHERE uep.exercise_id = e.id)::int AS progress_count
    FROM exercises e
    JOIN words w ON w.id = e.word_id
    JOIN lessons l ON l.id = e.lesson_id
    WHERE e.word_id IS NOT NULL
      AND (e.lesson_id, e.word_id, e.type) IN (
        SELECT lesson_id, word_id, type FROM exercises
        WHERE word_id IS NOT NULL GROUP BY 1,2,3 HAVING count(*) > 1)
    ORDER BY e.lesson_id, e.word_id, e.type, e.id`)

  const groups = new Map()
  for (const r of rows) {
    const key = `${r.lesson_id}|${r.word_id}|${r.type}`
    r._word = r.word_de
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }

  const toDelete = []
  for (const [, list] of groups) {
    let keep = list[0]
    for (const ex of list.slice(1)) if (better(ex, keep)) keep = ex
    for (const ex of list) if (ex.id !== keep.id) toDelete.push({ ...ex, _keep: keep.id })
  }

  console.log(`Групп «слово + тип» с дублями: ${groups.size}`)
  console.log(`Лишних упражнений к удалению: ${toDelete.length}`)
  const withProgress = toDelete.filter(e => e.progress_count > 0).length
  console.log(`Из них с прогрессом учеников: ${withProgress} (прогресс сохраняется на оставленном упражнении того же типа)`)

  // Разбивка по урокам — чтобы было видно, где чинится счётчик
  const byLesson = new Map()
  for (const e of toDelete) {
    const k = `${e.target_lang} · урок ${e.lesson_number ?? '—'} (id ${e.lesson_id})`
    byLesson.set(k, (byLesson.get(k) || 0) + 1)
  }
  console.log('\nПо урокам:')
  for (const [k, n] of [...byLesson].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${k}: ${n}`)

  console.log('\nПримеры (первые 10):')
  for (const e of toDelete.slice(0, 10)) {
    console.log(`  урок ${e.lesson_number} · ${e.word_de} · ${e.type} · удаляем id=${e.id} (оставляем ${e._keep})`)
    console.log(`      ${JSON.stringify(e.payload).slice(0, 130)}`)
  }

  if (!toDelete.length) { console.log('\nДублей нет — ничего делать не нужно.'); return }
  if (!APPLY) { console.log('\nЭто ПЛАН. Запусти с --apply, чтобы применить.'); return }

  // Бэкап перед удалением: сами упражнения + прогресс по ним
  const ids = toDelete.map(e => e.id)
  const { rows: fullRows } = await db.query('SELECT * FROM exercises WHERE id = ANY($1)', [ids])
  const { rows: progRows } = await db.query('SELECT * FROM user_exercise_progress WHERE exercise_id = ANY($1)', [ids])
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, 'dedup-exercises-rollback-2026-08-22.json')
  fs.writeFileSync(file, JSON.stringify({ exercises: fullRows, progress: progRows }, null, 1))
  console.log(`\nБэкап: ${file} (упражнений ${fullRows.length}, прогресса ${progRows.length})`)

  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1)', [ids])
  console.log(`Удалено упражнений: ${rowCount}`)
  console.log(`Откат: node scripts/dedup-exercises-2026-08-22.mjs --rollback ${file}`)

  await logOperation({
    kind: 'cleanup', status: 'ok', costUsd: 0, items: rowCount,
    message: `Дедупликация упражнений: одно слово — одно упражнение каждого типа (${rowCount} лишних удалено)`,
    meta: { script: 'dedup-exercises-2026-08-22', backup: file, groups: groups.size, with_progress: withProgress },
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
