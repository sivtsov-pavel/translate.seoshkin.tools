#!/usr/bin/env node
// Чистка словаря после загрузки учебника и тетради в один урок (жалоба Павла 22.08.2026:
// «набор в упражнениях по 2 источникам — книга и тетрадь, из-за этого дубли»).
//
// Трогаем только то, что определяется однозначно, без ИИ и без догадок:
//
//   1) ЗАДАНИЯ ИЗ УЧЕБНИКА — «Verbinden Sie» («Соедините»), «Kreuzen», «trennbares», «z.B.».
//      Это подписи к упражнениям на странице, а не слова. Удаляем вместе с упражнениями.
//   2) ДУБЛЬ С АРТИКЛЕМ И БЕЗ — «Bäume» (учебник) и «die Bäume» (тетрадь) в одном уроке.
//      Оставляем запись с артиклем (она полнее), прогресс ученика переносим на неё.
//   3) ФОРМА ГЛАГОЛА С МЕСТОИМЕНИЕМ — «ich backe», «du backst», «wir backen» при том, что
//      инфинитив «backen» в этом же уроке уже есть. Спряжение — дело упражнения
//      «спряжение», а не пяти отдельных карточек. Удаляем ТОЛЬКО когда инфинитив рядом:
//      если его нет («ich übersetze» без «übersetzen»), запись остаётся и попадает
//      в отчёт для вычитки — автоматически выводить инфинитив нельзя (nimmt → nehmen).
//   4) НЕТ КАРТОЧКИ И «ВЫБЕРИ ОТВЕТ» — дособираем недостающие из самого слова и переводов
//      других слов урока (дистракторы). Без OpenAI: карточка это word_de + перевод,
//      «выбери ответ» — тот же вопрос с тремя чужими переводами.
//
// Чего скрипт НЕ делает: не трогает записи-предложения («ich bin dreißig.») — у них есть
// учебная ценность, им место в наборах фраз; не расставляет артикли и не правит переводы —
// это требует немецкого, а не регулярки (см. отчёт в конце прогона).
//
// Идемпотентный, без --apply только печатает план. 💸 OpenAI не трогает: $0.
// Бэкап в /tmp контейнера — сразу забрать на хост:
//   docker cp translate-backend-1:/tmp/clean-dictionary-rollback-2026-08-22.json /home/seosite/translate-backups/
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'
import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')
const rollbackIdx = process.argv.indexOf('--rollback')
const ROLLBACK = rollbackIdx > -1 ? process.argv[rollbackIdx + 1] : null
const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp'

const noArticle = (s) => String(s || '').replace(/^(der|die|das)\s+/i, '').trim()
const PRONOUN_FORM = /^(ich|du|er|sie|es|wir|ihr)\s+([a-zäöüß]+)$/i

// Основа глагола для сверки формы с инфинитивом: «backe/backst/backt/backen» → «back»
const stemOf = (v) => String(v || '').toLowerCase().replace(/(en|st|et|t|e|n)$/, '')

async function rollback(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const w of d.words) {
    await db.query(
      `INSERT INTO words (id, lesson_id, user_id, word_de, translation_ru, example_sentence,
                          easiness_factor, interval_days, repetitions, next_review_date, status,
                          created_at, image_url, example_sentence_ru, translations, source, media_id, is_function_word)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.lesson_id, w.user_id, w.word_de, w.translation_ru, w.example_sentence, w.easiness_factor,
       w.interval_days, w.repetitions, w.next_review_date, w.status, w.created_at, w.image_url,
       w.example_sentence_ru, w.translations, w.source, w.media_id, w.is_function_word])
  }
  for (const e of d.exercises) {
    await db.query(
      `INSERT INTO exercises (id, lesson_id, word_id, type, payload, easiness_factor, interval_days,
                              repetitions, next_review_date, created_at, image_url, payload_translations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.lesson_id, e.word_id, e.type, e.payload, e.easiness_factor, e.interval_days,
       e.repetitions, e.next_review_date, e.created_at, e.image_url, e.payload_translations])
  }
  for (const id of (d.created_exercise_ids || [])) {
    await db.query('DELETE FROM exercises WHERE id = $1', [id])
  }
  await db.query(`SELECT setval('words_id_seq', (SELECT max(id) FROM words))`)
  await db.query(`SELECT setval('exercises_id_seq', (SELECT max(id) FROM exercises))`)
  console.log(`Откат: восстановлено слов ${d.words.length}, упражнений ${d.exercises.length}, снято созданных ${(d.created_exercise_ids || []).length}`)
}

async function main() {
  if (ROLLBACK) { await rollback(ROLLBACK); return }

  const { rows: words } = await db.query(`
    SELECT w.id, w.lesson_id, w.word_de, w.translation_ru, w.source, w.is_function_word,
           l.lesson_number, l.target_lang
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    ORDER BY w.lesson_id, w.id`)

  const byLesson = new Map()
  for (const w of words) {
    if (!byLesson.has(w.lesson_id)) byLesson.set(w.lesson_id, [])
    byLesson.get(w.lesson_id).push(w)
  }

  const delInstructions = [], delDuplicates = [], delVerbForms = [], keepForms = []

  const INSTRUCTION = /^(verbinden|ergänzen|kreuzen|ankreuzen|markieren|ordnen|unterstreichen|hören|schreiben|sprechen|lesen)\s+Sie\b/i
  const TERMS = new Set(['kreuzen', 'trennbar', 'trennbares', 'getrennt', 'plural', 'singular', 'z.b.', 'usw.', 'bzw.'])

  for (const [, list] of byLesson) {
    const de = list[0].target_lang === 'de'

    for (const w of list) {
      // 1) задания из учебника
      if (de && (INSTRUCTION.test(w.word_de) || TERMS.has(w.word_de.toLowerCase()))) {
        delInstructions.push(w); continue
      }
      // 3) форма глагола с местоимением — только если инфинитив есть в этом же уроке
      const m = de && PRONOUN_FORM.exec(w.word_de)
      if (m) {
        const stem = stemOf(m[2])
        const infinitive = list.find(o => o.id !== w.id && /^[a-zäöüß]+en$/i.test(o.word_de) && stemOf(o.word_de) === stem)
        if (infinitive) delVerbForms.push({ ...w, _infinitive: infinitive.word_de })
        else keepForms.push(w)
        continue
      }
    }

    // 2) дубль «X» и «der X» в одном уроке — оставляем запись с артиклем
    const groups = new Map()
    for (const w of list) {
      const k = noArticle(w.word_de).toLowerCase()
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(w)
    }
    for (const [, g] of groups) {
      if (g.length < 2) continue
      const withArticle = g.find(w => /^(der|die|das)\s/i.test(w.word_de))
      const keep = withArticle || g[0]
      for (const w of g) if (w.id !== keep.id) delDuplicates.push({ ...w, _keep: keep.id, _keepWord: keep.word_de })
    }
  }

  const toDelete = [...delInstructions, ...delDuplicates, ...delVerbForms]
  const delIds = [...new Set(toDelete.map(w => w.id))]

  // 4) слова без карточки и «выбери ответ» — после удалений, по оставшимся
  const { rows: noCore } = await db.query(`
    SELECT w.id, w.lesson_id, w.word_de, w.translation_ru, w.translations, l.lesson_number
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE NOT w.is_function_word
      AND NOT (w.id = ANY($1))
      AND EXISTS (SELECT 1 FROM exercises e WHERE e.lesson_id = w.lesson_id)
      AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id = w.id AND e.type IN ('flashcard','multiple_choice'))
      AND w.translation_ru <> ''
      AND w.word_de !~ '[.!?]'
    ORDER BY w.lesson_id, w.id`, [delIds])

  console.log('ПЛАН ЧИСТКИ СЛОВАРЯ')
  console.log(`  задания из учебника → удалить: ${delInstructions.length}`)
  for (const w of delInstructions) console.log(`      урок ${w.lesson_number ?? '—'}: «${w.word_de}» (${w.translation_ru})`)
  console.log(`  дубли «с артиклем / без» → слить: ${delDuplicates.length}`)
  for (const w of delDuplicates.slice(0, 10)) console.log(`      урок ${w.lesson_number ?? '—'}: «${w.word_de}» → оставляем «${w._keepWord}»`)
  console.log(`  формы глагола при живом инфинитиве → удалить: ${delVerbForms.length}`)
  for (const w of delVerbForms.slice(0, 12)) console.log(`      урок ${w.lesson_number ?? '—'}: «${w.word_de}» (инфинитив «${w._infinitive}» на месте)`)
  console.log(`  формы глагола БЕЗ инфинитива в уроке → оставляем, нужна вычитка: ${keepForms.length}`)
  for (const w of keepForms.slice(0, 12)) console.log(`      урок ${w.lesson_number ?? '—'}: «${w.word_de}» (${w.translation_ru})`)
  console.log(`  слов без карточки и «выбери ответ» → дособрать упражнения: ${noCore.length}`)
  for (const w of noCore.slice(0, 10)) console.log(`      урок ${w.lesson_number ?? '—'}: «${w.word_de}» (${w.translation_ru})`)

  if (!APPLY) { console.log('\nЭто ПЛАН. Запусти с --apply, чтобы применить.'); return }

  // Бэкап: сами слова и все их упражнения (уйдут каскадом)
  const { rows: wordRows } = await db.query('SELECT * FROM words WHERE id = ANY($1)', [delIds])
  const { rows: exRows } = await db.query('SELECT * FROM exercises WHERE word_id = ANY($1)', [delIds])
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(BACKUP_DIR, 'clean-dictionary-rollback-2026-08-22.json')

  // Прогресс по удаляемым дублям переносим на оставшуюся запись — иначе ученик
  // «потеряет» пройденное слово и урок снова перестанет закрываться.
  let moved = 0
  for (const w of delDuplicates) {
    const { rows: pairs } = await db.query(`
      SELECT src.id AS src_id, dst.id AS dst_id
      FROM exercises src JOIN exercises dst
        ON dst.word_id = $2 AND dst.type = src.type AND dst.lesson_id = src.lesson_id
      WHERE src.word_id = $1`, [w.id, w._keep])
    for (const p of pairs) {
      const { rowCount } = await db.query(`
        INSERT INTO user_exercise_progress (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
        SELECT user_id, $2, easiness_factor, interval_days, repetitions, next_review_date
        FROM user_exercise_progress WHERE exercise_id = $1
        ON CONFLICT DO NOTHING`, [p.src_id, p.dst_id])
      moved += rowCount
    }
  }

  const { rowCount: deleted } = await db.query('DELETE FROM words WHERE id = ANY($1)', [delIds])

  // Дособираем карточку и «выбери ответ» там, где их нет
  const createdIds = []
  const LOCALES = ['uk', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']
  for (const w of noCore) {
    // Карточка: перевод на языке ученика фронт берёт из самого слова (words.translations),
    // поэтому в payload достаточно русской пары — карточка сразу мультилокальна.
    const payloadFc = JSON.stringify({ question: w.word_de, answer: w.translation_ru })
    const r1 = await db.query(
      `INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,'flashcard',$3)
       ON CONFLICT DO NOTHING RETURNING id`, [w.lesson_id, w.id, payloadFc])
    if (r1.rows[0]) createdIds.push(r1.rows[0].id)

    // «Выбери ответ»: дистракторы — переводы трёх других слов урока. Берём только слова
    // с готовыми переводами на 10 локалей, тогда payload_translations собирается прямо
    // здесь и бесплатно — без прогона через OpenAI.
    const { rows: distract } = await db.query(`
      SELECT translation_ru, translations FROM words
      WHERE lesson_id = $1 AND id <> $2 AND translation_ru <> '' AND NOT is_function_word
        AND translations <> '{}'::jsonb
      ORDER BY random() LIMIT 3`, [w.lesson_id, w.id])
    if (distract.length < 3) continue

    // Правильный ответ на случайной позиции: если всегда ставить последним, ученик
    // выучит позицию, а не слово.
    const pos = Math.floor(Math.random() * 4)
    const pool = distract.map(d => d)
    const options = []
    for (let i = 0, j = 0; i < 4; i++) options.push(i === pos ? null : pool[j++])
    const payloadMc = JSON.stringify({
      question: `Wie heißt das auf Russisch: ${w.word_de}?`,
      options: options.map(o => o ? o.translation_ru : w.translation_ru),
      correct: pos,
    })
    // Те же четыре варианта на остальных локалях — там, где перевод есть у всех четырёх
    const tr = {}
    for (const loc of LOCALES) {
      const line = options.map(o => (o ? o.translations?.[loc] : w.translations?.[loc]))
      if (line.every(Boolean)) tr[loc] = line
    }
    const r2 = await db.query(
      `INSERT INTO exercises (lesson_id, word_id, type, payload, payload_translations)
       VALUES ($1,$2,'multiple_choice',$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
      [w.lesson_id, w.id, payloadMc, JSON.stringify(tr)])
    if (r2.rows[0]) createdIds.push(r2.rows[0].id)
  }

  fs.writeFileSync(file, JSON.stringify({ words: wordRows, exercises: exRows, created_exercise_ids: createdIds }, null, 1))
  console.log(`\nБэкап: ${file} (слов ${wordRows.length}, их упражнений ${exRows.length})`)
  console.log(`Удалено слов: ${deleted}; перенесено записей прогресса: ${moved}; создано упражнений: ${createdIds.length}`)
  console.log(`Откат: node scripts/clean-dictionary-2026-08-22.mjs --rollback ${file}`)

  await logOperation({
    kind: 'cleanup', status: 'ok', costUsd: 0, items: deleted,
    message: `Чистка словаря: удалено ${deleted} записей (задания учебника, дубли, формы глаголов), создано ${createdIds.length} упражнений`,
    meta: { script: 'clean-dictionary-2026-08-22', backup: file, moved_progress: moved },
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
