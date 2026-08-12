#!/usr/bin/env node
// Чистка «слов через слэш» — записей вида «sie/Sie möchten», «Kunde/Kundin», «sie / Sie».
// Наследие ручного наполнения: в словарь попали строки таблицы спряжения и склеенные пары.
//
// Три класса, три разных лечения (см. IDEAS.md, спринт от 12.08.2026):
//
//   A. Форма спряжения — «er/sie/es hofft», «sie/Sie backen», «er/sie/es kreuzt an».
//      Это не слово: картинки нет, в предложение не вставляется, карточка бессмысленна.
//      Формы не теряем — перед удалением gen-conjugation.mjs кладёт их в упражнение
//      «Склонение» к инфинитиву (rule-based, без OpenAI). Удаляем ТОЛЬКО если инфинитив
//      реально найден в базе и конъюгатор подтвердил, что форма — его: не нашли, значит
//      не поняли, значит не трогаем.
//
//   B. Местоимение — «sie/Sie» (они/Вы), «er/sie/es», «mein / meine». Это нормальные
//      учебные единицы, НЕ удаляем: sie и Sie — разные местоимения, вежливую форму терять
//      нельзя. Лечим только дубли одного и того же с разными пробелами («sie / Sie» рядом
//      с «sie/Sie») и приводим запись к виду без пробелов вокруг слэша.
//
//   C. Пара слов в одной карточке — «der Lehrer / der Kursleiter», «Kunde/Kundin»,
//      «wood/wooden». Разделяем на два слова: первой половиной становится существующая
//      запись, вторая создаётся рядом. Обеим нужны свои упражнения → ЭТО ТРАТИТ OpenAI.
//
// 💸 Деньги: стадии --apply (A и B) не вызывают OpenAI вообще, 0$. Стадия --apply-pairs
//    генерирует упражнения для ~12 слов через gpt-4o-mini — ориентир до $0.02.
//    Одобрено Павлом 12.08.2026. Картинки новым словам догоняются воркером отдельно ($0).
//
// Прогресс учеников: удаляемые слова уносят свои упражнения и прогресс по ним — поэтому
// пишем файл отката со словами, упражнениями и записями прогресса.
//
// Запуск в backend-контейнере:
//   node scripts/fix-slash-words.mjs                # план, ничего не меняет
//   node scripts/fix-slash-words.mjs --apply        # классы A и B, без OpenAI
//   node scripts/fix-slash-words.mjs --apply-pairs  # класс C, тратит OpenAI
//
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { conjugatePresent } from '../src/services/germanConjugator.js'
import { generateExercises, translateWordsToAllLangs, translateExercisePayloads, CORE_EXERCISE_TYPES, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const MODE = process.argv.includes('--apply-pairs') ? 'pairs'
  : process.argv.includes('--apply') ? 'apply' : 'plan'
const ROLLBACK = '/tmp/slash-words-rollback.json'

// ── Классификация ─────────────────────────────────────────────────────────────

const PRON = '(?:ich|du|er|sie|es|wir|ihr|Sie)'
const POSS = '(?:mein|meine|meinen|dein|deine|sein|seine|ihr|ihre|Ihr|Ihre|unser|unsere)'
// A: местоимения через слэш + пробел + глагольная форма («sie/Sie möchten»)
const A_RE = new RegExp(`^(${PRON}(?:\\s*/\\s*${PRON})+)\\s+(.+)$`)
// B: строка целиком состоит из местоимений/притяжательных через слэш («sie / Sie»)
const B_RE = new RegExp(`^(?:${PRON}|${POSS})(?:\\s*/\\s*(?:${PRON}|${POSS}))+$`)

// Немецкое существительное без артикля — половина слова: в исходной записи артикля нет
// («Kunde/Kundin»), а восстановить его правилом нельзя. Такие пары задаём явно.
const PAIR_OVERRIDES = {
  'Kunde/Kundin': [
    { word_de: 'der Kunde',  translation_ru: 'клиент' },
    { word_de: 'die Kundin', translation_ru: 'клиентка' },
  ],
}

const classify = (de) => {
  const s = String(de || '').trim()
  if (B_RE.test(s)) return 'B'
  if (A_RE.test(s)) return 'A'
  return 'C'
}
// «sie / Sie» → «sie/Sie»: пробелы вокруг слэша не несут смысла, а дубли плодят
const normalizeSlashes = (s) => String(s || '').trim().replace(/\s*\/\s*/g, '/')

// ── Поиск инфинитива для формы спряжения ──────────────────────────────────────
// Форму сверяем не эвристикой, а тем же конъюгатором, что генерирует упражнения:
// инфинитив подходит, если одна из его форм Präsens совпала с нашей.
// Отделяемые приставки («kreuzt an») конъюгатор отдаёт слитно («ankreuzt») — склеиваем.
function formVariants(form) {
  const f = String(form || '').trim().toLowerCase()
  const parts = f.split(/\s+/)
  const out = new Set([f])
  if (parts.length === 2) out.add(parts[1] + parts[0]) // kreuzt an → ankreuzt
  return [...out]
}

function findInfinitive(form, verbIndex) {
  for (const v of formVariants(form)) {
    const hit = verbIndex.get(v)
    if (hit) return hit
  }
  return null
}

// ── Данные ────────────────────────────────────────────────────────────────────

const { rows: slashWords } = await db.query(`
  SELECT w.id, w.lesson_id, w.user_id, w.word_de, w.translation_ru, w.source,
         l.lesson_number, l.target_lang,
         (SELECT count(*)::int FROM exercises e WHERE e.word_id = w.id) AS ex_count
  FROM words w LEFT JOIN lessons l ON l.id = w.lesson_id
  WHERE w.word_de LIKE '%/%'
  ORDER BY l.lesson_number NULLS LAST, w.id`)

// Индекс «форма Präsens → слово-инфинитив» по всем немецким словам базы
const { rows: allWords } = await db.query(`
  SELECT w.id, w.lesson_id, w.word_de FROM words w
  JOIN lessons l ON l.id = w.lesson_id
  WHERE l.target_lang = 'de' AND w.word_de NOT LIKE '%/%'`)

const verbIndex = new Map()
for (const w of allWords) {
  const inf = String(w.word_de || '').trim()
  if (!/^[a-zäöüß]{3,}(en|eln|ern)$/.test(inf)) continue
  const forms = conjugatePresent(inf)
  if (!forms) continue
  for (const f of Object.values(forms)) {
    const key = String(f).toLowerCase()
    if (!verbIndex.has(key)) verbIndex.set(key, { id: w.id, lesson_id: w.lesson_id, infinitive: inf })
  }
}

// ── Разбор по классам ─────────────────────────────────────────────────────────

const planA = []   // формы спряжения на удаление
const skipA = []   // формы, чей инфинитив не найден — не трогаем
const planB = []   // дубли местоимений на схлопывание + переименования
const planC = []   // пары на разделение

for (const w of slashWords) {
  const klass = classify(w.word_de)
  if (klass === 'A') {
    const m = A_RE.exec(String(w.word_de).trim())
    const inf = findInfinitive(m[2], verbIndex)
    if (inf) planA.push({ ...w, form: m[2], infinitive: inf.infinitive, inf_word_id: inf.id, inf_lesson_id: inf.lesson_id })
    else skipA.push({ ...w, form: m[2] })
  } else if (klass === 'C') {
    const override = PAIR_OVERRIDES[String(w.word_de).trim()]
    const parts = String(w.word_de).split('/').map(s => s.trim()).filter(Boolean)
    const trParts = String(w.translation_ru || '').split('/').map(s => s.trim()).filter(Boolean)
    if (override) {
      planC.push({ ...w, keep: override[0], create: override[1] })
    } else if (parts.length === 2) {
      planC.push({
        ...w,
        keep:   { word_de: parts[0], translation_ru: trParts.length === 2 ? trParts[0] : w.translation_ru },
        create: { word_de: parts[1], translation_ru: trParts.length === 2 ? trParts[1] : w.translation_ru },
      })
    } else skipA.push({ ...w, form: '(больше двух частей — руками)' })
  }
}

// B: группируем по уроку и нормализованной записи — внутри группы оставляем одного
const bGroups = new Map()
for (const w of slashWords) {
  if (classify(w.word_de) !== 'B') continue
  const key = `${w.lesson_id}|${normalizeSlashes(w.word_de)}`
  if (!bGroups.has(key)) bGroups.set(key, [])
  bGroups.get(key).push(w)
}
for (const [key, group] of bGroups) {
  // остаётся тот, у кого больше упражнений (при равенстве — старший, меньший id)
  const sorted = [...group].sort((a, b) => b.ex_count - a.ex_count || a.id - b.id)
  const keep = sorted[0]
  const drop = sorted.slice(1)
  const target = normalizeSlashes(keep.word_de)
  if (drop.length || keep.word_de !== target) {
    planB.push({ keep, drop, rename: keep.word_de !== target ? target : null, key })
  }
}

// ── План ──────────────────────────────────────────────────────────────────────

const exSum = (arr) => arr.reduce((n, w) => n + (w.ex_count || 0), 0)

console.log(`\nСлов со слэшем: ${slashWords.length}\n`)

console.log(`A. Формы спряжения на удаление: ${planA.length} слов, ${exSum(planA)} упражнений`)
for (const w of planA.slice(0, 50)) {
  console.log(`   урок ${w.lesson_number ?? '—'} · ${w.word_de} → инфинитив «${w.infinitive}» (слово ${w.inf_word_id}), упражнений ${w.ex_count}`)
}
if (skipA.length) {
  console.log(`\n   ⚠️  НЕ трогаем — инфинитив не найден: ${skipA.length}`)
  for (const w of skipA) console.log(`      ${w.word_de} (форма «${w.form}»)`)
}

console.log(`\nB. Местоимения: ${planB.length} групп с дублями/пробелами`)
for (const g of planB) {
  const dropTxt = g.drop.length ? `удалить ${g.drop.map(d => `${d.id} «${d.word_de}» (${d.ex_count} упр.)`).join(', ')}` : 'дублей нет'
  console.log(`   оставляем ${g.keep.id} «${g.keep.word_de}» (${g.keep.ex_count} упр.) · ${dropTxt}${g.rename ? ` · переименовать в «${g.rename}»` : ''}`)
}

console.log(`\nC. Пары на разделение: ${planC.length} (тратит OpenAI, стадия --apply-pairs)`)
for (const w of planC) {
  console.log(`   урок ${w.lesson_number ?? '—'} · «${w.word_de}» → «${w.keep.word_de}» + «${w.create.word_de}» (упражнений сейчас ${w.ex_count})`)
}

if (MODE === 'plan') {
  console.log(`\nЭто только план — ничего не изменено.`)
  console.log(`  node scripts/fix-slash-words.mjs --apply         # A и B, без OpenAI (0$)`)
  console.log(`  node scripts/fix-slash-words.mjs --apply-pairs   # C, тратит OpenAI (~$0.02)`)
  process.exit(0)
}

// ── Откат ─────────────────────────────────────────────────────────────────────
// Пишем ДО изменений: слово, его упражнения и прогресс учеников по ним.
async function snapshot(wordIds) {
  if (!wordIds.length) return { words: [], exercises: [], progress: [] }
  const { rows: words } = await db.query('SELECT * FROM words WHERE id = ANY($1)', [wordIds])
  const { rows: exercises } = await db.query('SELECT * FROM exercises WHERE word_id = ANY($1)', [wordIds])
  const exIds = exercises.map(e => e.id)
  const { rows: progress } = exIds.length
    ? await db.query('SELECT * FROM user_exercise_progress WHERE exercise_id = ANY($1)', [exIds])
    : { rows: [] }
  return { words, exercises, progress }
}

// ── Применение A и B ──────────────────────────────────────────────────────────

if (MODE === 'apply') {
  const doomed = [...planA.map(w => w.id), ...planB.flatMap(g => g.drop.map(d => d.id))]
  const snap = await snapshot(doomed)
  writeFileSync(ROLLBACK, JSON.stringify(snap, null, 2))
  console.log(`\nОткат записан: ${ROLLBACK} (слов ${snap.words.length}, упражнений ${snap.exercises.length}, записей прогресса ${snap.progress.length})`)

  // A: удаляем формы спряжения (упражнения уходят каскадом по FK)
  if (planA.length) {
    const { rowCount } = await db.query('DELETE FROM words WHERE id = ANY($1)', [planA.map(w => w.id)])
    console.log(`A: удалено слов ${rowCount}`)
  }

  // B: сначала сносим дубли, потом нормализуем запись оставшегося
  let bDropped = 0, bRenamed = 0
  for (const g of planB) {
    if (g.drop.length) {
      const { rowCount } = await db.query('DELETE FROM words WHERE id = ANY($1)', [g.drop.map(d => d.id)])
      bDropped += rowCount
    }
    if (g.rename) {
      // UNIQUE (lesson_id, word_de): если целевая запись каким-то образом занята — пропускаем
      const busy = await db.query('SELECT 1 FROM words WHERE lesson_id = $1 AND word_de = $2 AND id <> $3',
        [g.keep.lesson_id, g.rename, g.keep.id])
      if (busy.rowCount) { console.log(`   B: «${g.rename}» уже занято в уроке ${g.keep.lesson_id} — переименование пропущено`); continue }
      await db.query('UPDATE words SET word_de = $1 WHERE id = $2', [g.rename, g.keep.id])
      // тот же текст лежит копией внутри payload упражнений — синхронизируем
      await db.query(
        `UPDATE exercises SET payload = jsonb_set(payload, '{word_de}', to_jsonb($1::text))
         WHERE word_id = $2 AND payload ? 'word_de'`, [g.rename, g.keep.id])
      bRenamed++
    }
  }
  console.log(`B: удалено дублей ${bDropped}, переименовано ${bRenamed}`)

  await logOperation({
    kind: 'cleanup', status: 'ok', costUsd: 0,
    message: `слэш-слова: удалено форм спряжения ${planA.length}, дублей местоимений ${bDropped}`,
    meta: { rollback: ROLLBACK, skipped: skipA.length },
  }).catch(() => {})

  console.log(`\nГотово. OpenAI не вызывался (0$). Формы спряжения перед этим должны быть`)
  console.log(`перенесены в «Склонение»: node scripts/gen-conjugation.mjs`)
  process.exit(0)
}

// ── Применение C: разделение пар (тратит OpenAI) ──────────────────────────────

if (MODE === 'pairs') {
  if (!planC.length) { console.log('\nПар для разделения нет.'); process.exit(0) }

  const snap = await snapshot(planC.map(w => w.id))
  writeFileSync(ROLLBACK, JSON.stringify(snap, null, 2))
  console.log(`\nОткат записан: ${ROLLBACK}`)

  resetUsage()
  const touched = [] // слова, которым нужны свежие упражнения

  for (const p of planC) {
    // Половина первая — переименовываем существующую запись (id сохраняется)
    await db.query('UPDATE words SET word_de = $1, translation_ru = $2, translations = \'{}\'::jsonb WHERE id = $3',
      [p.keep.word_de, p.keep.translation_ru, p.id])

    // Половина вторая — новая запись в том же уроке
    const ins = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (lesson_id, word_de) DO NOTHING
       RETURNING id`,
      [p.lesson_id, p.user_id, p.create.word_de, p.create.translation_ru, p.source || 'textbook'])
    const newId = ins.rows[0]?.id || null
    if (!newId) console.log(`   «${p.create.word_de}» уже есть в уроке ${p.lesson_id} — новая запись не создавалась`)

    // Старые упражнения половины первой держат в payload склеенный текст — сносим,
    // сгенерируем заново вместе с упражнениями для новой половины.
    await db.query('DELETE FROM exercises WHERE word_id = $1', [p.id])

    touched.push({ lesson_id: p.lesson_id, target_lang: p.target_lang || 'de',
      words: [{ id: p.id, ...p.keep }, ...(newId ? [{ id: newId, ...p.create }] : [])] })
  }

  // Генерация упражнений — по урокам, чтобы промпт видел контекст урока
  const byLesson = new Map()
  for (const t of touched) {
    if (!byLesson.has(t.lesson_id)) byLesson.set(t.lesson_id, { target_lang: t.target_lang, words: [] })
    byLesson.get(t.lesson_id).words.push(...t.words)
  }

  for (const [lessonId, { target_lang, words }] of byLesson) {
    // Диктант и произношение — детерминированно, без ИИ
    for (const w of words) {
      for (const type of ['dictation', 'speech']) {
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [lessonId, w.id, type, JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })])
      }
    }
    // Core-типы — через ИИ, с той же валидацией, что у штатной генерации
    const generated = await generateExercises(
      words.map(w => ({ word_de: w.word_de, translation_ru: w.translation_ru })), [], target_lang, [])
    const byKey = new Map(words.map(w => [w.word_de.toLowerCase().replace(/^(der|die|das|the)\s+/, '').trim(), w.id]))
    const seen = new Set()
    let inserted = 0
    for (const ex of generated) {
      const key = String(ex.word_de || '').toLowerCase().replace(/^(der|die|das|the)\s+/, '').trim()
      const wid = byKey.get(key)
      if (!wid || !CORE_EXERCISE_TYPES.includes(ex.type)) continue
      if (seen.has(`${wid}|${ex.type}`)) continue
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, wid, ex.type, JSON.stringify(ex.payload)])
      seen.add(`${wid}|${ex.type}`)
      inserted++
    }
    console.log(`   урок ${lessonId}: слов ${words.length}, упражнений создано ${inserted + words.length * 2}`)

    // Переводы слов и упражнений на локали
    try {
      const { rows: wRows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE id = ANY($1)', [words.map(w => w.id)])
      const tr = await translateWordsToAllLangs(wRows)
      for (const [id, langs] of Object.entries(tr || {})) {
        await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2',
          [JSON.stringify(langs), parseInt(id)])
      }
      const { rows: exRows } = await db.query(
        `SELECT id, type, payload FROM exercises WHERE word_id = ANY($1)
           AND type IN ('multiple_choice','fill_blank','sentence_write')`, [words.map(w => w.id)])
      if (exRows.length) {
        const res = await translateExercisePayloads(exRows)
        for (const [id, langs] of Object.entries(res || {})) {
          await db.query(`UPDATE exercises SET payload_translations = COALESCE(payload_translations, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify(langs), parseInt(id)])
        }
      }
    } catch (e) { console.error('   переводы:', e.message) }
  }

  const cost = usageCostUSD()
  await logOperation({
    kind: 'cleanup', status: 'ok', costUsd: cost,
    message: `слэш-слова: разделено пар ${planC.length}`,
    meta: { rollback: ROLLBACK },
  }).catch(() => {})

  console.log(`\nГотово. Потрачено на OpenAI: $${cost.toFixed(4)}`)
  console.log(`Картинки новым словам догоняются воркером отдельно ($0).`)
  process.exit(0)
}
