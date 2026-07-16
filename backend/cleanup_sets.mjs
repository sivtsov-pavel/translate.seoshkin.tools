// Разовая уборка уроков и тематических наборов (июль 2026).
// Проблемы: 14 старых под-уроков от старого redistribute (Урок 2:/5:/8:/9:...),
// Урок 13 в двух кусках, кривое название Урока 3, слова наборов «не по теме»
// (das Dach в «Городах и странах»), артикли у стран (das Polen), дубли между наборами.
//
// Запуск в контейнере backend:
//   DRY_RUN=1 node cleanup_sets.mjs   — только показать план, БД не трогать
//   node cleanup_sets.mjs             — боевой прогон
// Перед боевым прогоном ОБЯЗАТЕЛЕН бэкап БД (pg_dump).
import { db } from './src/db/index.js'
import { classifyWordsToThemes, generateLessonMeta, translateLessonMeta, CANON_THEMES } from './src/services/claude.js'
import { enrichLesson, regenerateExercisesFromDb } from './src/services/processor.js'

const DRY = process.env.DRY_RUN === '1'
const SUB_LESSONS = [105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118]
const LESSON_13 = { keep: 122, drop: 123 }
const LESSON_3 = 30
const TARGET = 'de'

const bare = s => String(s).toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, '').trim()
const log = (...a) => console.log(...a)

const { rows: own } = await db.query('SELECT owner_id FROM lessons WHERE id=$1', [SUB_LESSONS[0]])
const ownerId = own[0]?.owner_id
if (!ownerId) { console.error('Не найден владелец под-уроков — уже удалены?'); process.exit(1) }
log(`Владелец: ${ownerId}. Режим: ${DRY ? 'DRY_RUN (без изменений)' : 'БОЕВОЙ'}\n`)

// ── Хелперы ──────────────────────────────────────────────────────────────────
const setCache = {}
async function ensureSet(theme) {
  if (setCache[theme]) return setCache[theme]
  const { rows } = await db.query(
    'SELECT id FROM lessons WHERE is_set AND set_theme=$1 AND owner_id=$2 ORDER BY id LIMIT 1', [theme, ownerId])
  let id = rows[0]?.id
  if (!id && !DRY) {
    const ins = await db.query(
      `INSERT INTO lessons (owner_id, title, target_lang, status, is_set, set_theme)
       VALUES ($1, $2, $3, 'done', true, $2) RETURNING id`, [ownerId, theme, TARGET])
    id = ins.rows[0].id
    log(`  + создан набор «${theme}» (#${id})`)
  }
  if (id) setCache[theme] = id
  return id || `(новый: ${theme})`
}

// Слить слово-дубль dup в слово survivor: упражнения и статусы переезжают, дубль удаляется
async function mergeWord(dupId, survivorId, targetLessonId) {
  if (DRY) return
  await db.query('UPDATE exercises SET word_id=$1, lesson_id=$2 WHERE word_id=$3', [survivorId, targetLessonId, dupId])
  await db.query(
    `UPDATE user_word_status SET word_id=$1 WHERE word_id=$2
       AND NOT EXISTS (SELECT 1 FROM user_word_status s WHERE s.word_id=$1 AND s.user_id=user_word_status.user_id)`,
    [survivorId, dupId])
  await db.query('DELETE FROM user_word_status WHERE word_id=$1', [dupId])
  await db.query('DELETE FROM words WHERE id=$1', [dupId])
}

// Классификация с батчами (лимит токенов ответа ~60 слов за вызов).
// Ключ мапы — bare-форма ВХОДНОГО слова: нормализация может менять форму
// («keinen» → «kein»), поэтому сопоставляем по позиции в батче, когда длины совпали.
async function classifyAll(words) {
  const map = {}
  for (let i = 0; i < words.length; i += 60) {
    const batch = words.slice(i, i + 60)
    const items = await classifyWordsToThemes(batch.map(w => ({ de: w.word_de, tr: w.translation_ru })), TARGET)
    if (items.length === batch.length) {
      items.forEach((it, j) => { map[bare(batch[j].word_de)] = it })
    } else {
      // модель что-то отфильтровала — фолбэк: совпадение по bare-форме выхода
      for (const it of items) { const k = bare(it.de); if (!map[k]) map[k] = it }
    }
    log(`  классифицировано ${Math.min(i + 60, words.length)}/${words.length}`)
  }
  return map
}

// ── ШАГ 1: слова под-уроков, которых нет в наборах → в наборы ────────────────
log('ШАГ 1 — перенос недостающих слов из под-уроков в наборы')
const { rows: missing } = await db.query(
  `SELECT DISTINCT ON (regexp_replace(lower(w.word_de), '^(der|die|das|ein|eine)\\s+', ''))
          w.id, w.word_de, w.translation_ru
   FROM words w WHERE w.lesson_id = ANY($1)
     AND NOT EXISTS (
       SELECT 1 FROM words s JOIN lessons ls ON ls.id=s.lesson_id AND ls.is_set AND ls.owner_id=$2
       WHERE regexp_replace(lower(s.word_de), '^(der|die|das|ein|eine)\\s+', '')
           = regexp_replace(lower(w.word_de), '^(der|die|das|ein|eine)\\s+', ''))
   ORDER BY 1, w.id`, [SUB_LESSONS, ownerId])
log(`  недостающих слов: ${missing.length}`)
const affectedSets = new Set()
if (missing.length) {
  const cls = await classifyAll(missing)
  for (const w of missing) {
    const it = cls[bare(w.word_de)]
    const theme = it?.theme || 'Разное'
    const de = it?.de || w.word_de
    const tr = it?.tr || w.translation_ru
    const setId = await ensureSet(theme)
    log(`  → «${de}» (${tr}) → ${theme}`)
    if (!DRY) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
         VALUES ($1, $2, $3, $4, 'camera') ON CONFLICT (lesson_id, word_de) DO NOTHING`,
        [setId, ownerId, de, tr])
      affectedSets.add(setId)
    }
  }
}

// ── ШАГ 2: реклассификация всех слов наборов ─────────────────────────────────
log('\nШАГ 2 — реклассификация слов наборов (темы + нормализация форм)')
const { rows: setWords } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru, w.lesson_id, l.set_theme,
          (w.image_url IS NOT NULL)::int*2 + (w.translations IS NOT NULL AND w.translations != '{}')::int
            + (w.example_sentence IS NOT NULL)::int AS score
   FROM words w JOIN lessons l ON l.id = w.lesson_id AND l.is_set AND l.owner_id=$1
   ORDER BY w.id`, [ownerId])
log(`  всего слов в наборах: ${setWords.length}`)

// Уникальные bare-формы классифицируем один раз — копии одного слова получат одну тему
const uniq = [...new Map(setWords.map(w => [bare(w.word_de), w])).values()]
const cls2 = await classifyAll(uniq)

let moved = 0, renamed = 0, merged = 0, kept = 0
for (const w of setWords) {
  // свежие данные (слово могло быть слито ранее в цикле)
  const { rows: cur } = await db.query('SELECT id, word_de, lesson_id FROM words WHERE id=$1', [w.id])
  if (!cur.length && !DRY) continue
  const it = cls2[bare(w.word_de)]
  if (!it) { kept++; continue }
  const theme = CANON_THEMES.includes(it.theme) ? it.theme : 'Разное'
  const targetId = await ensureSet(theme)
  const normDe = it.de
  const sameSet = targetId === w.lesson_id

  if (sameSet && normDe === w.word_de) { kept++; continue }

  // есть ли в целевом наборе другое слово с той же bare-формой?
  const { rows: dup } = await db.query(
    `SELECT w2.id, (w2.image_url IS NOT NULL)::int*2 + (w2.translations IS NOT NULL AND w2.translations != '{}')::int
              + (w2.example_sentence IS NOT NULL)::int AS score
     FROM words w2 WHERE w2.lesson_id=$1 AND w2.id != $2
       AND regexp_replace(lower(w2.word_de), '^(der|die|das|ein|eine)\\s+', '') = $3 LIMIT 1`,
    [typeof targetId === 'number' ? targetId : -1, w.id, bare(normDe)])

  if (dup.length) {
    // дубль: выживает более «богатое» слово
    const survivor = dup[0].score >= w.score ? dup[0].id : w.id
    const loser = survivor === w.id ? dup[0].id : w.id
    log(`  ⊕ merge «${w.word_de}» (${w.set_theme} → ${theme}): остаётся #${survivor}`)
    await mergeWord(loser, survivor, typeof targetId === 'number' ? targetId : w.lesson_id)
    if (!DRY && survivor === w.id) {
      await db.query('UPDATE words SET lesson_id=$1, word_de=$2 WHERE id=$3', [targetId, normDe, w.id])
      await db.query('UPDATE exercises SET lesson_id=$1 WHERE word_id=$2', [targetId, w.id])
    }
    merged++
  } else if (!sameSet) {
    log(`  → «${w.word_de}»: ${w.set_theme} → ${theme}${normDe !== w.word_de ? ` (форма: ${normDe})` : ''}`)
    if (!DRY) {
      await db.query('UPDATE words SET lesson_id=$1, word_de=$2 WHERE id=$3', [targetId, normDe, w.id])
      await db.query('UPDATE exercises SET lesson_id=$1 WHERE word_id=$2', [targetId, w.id])
    }
    moved++
  } else {
    log(`  ✎ форма: «${w.word_de}» → «${normDe}» (${theme})`)
    if (!DRY) await db.query('UPDATE words SET word_de=$1 WHERE id=$2', [normDe, w.id])
    renamed++
  }
}
log(`  итог: перемещено ${moved}, слито дублей ${merged}, исправлено форм ${renamed}, на месте ${kept}`)

// ── ШАГ 3: удалить опустевшие наборы ─────────────────────────────────────────
log('\nШАГ 3 — пустые наборы')
const { rows: empty } = await db.query(
  `SELECT l.id, l.title FROM lessons l WHERE l.is_set AND l.owner_id=$1
     AND NOT EXISTS (SELECT 1 FROM words w WHERE w.lesson_id=l.id)`, [ownerId])
for (const e of empty) {
  log(`  ✗ удаляю пустой набор «${e.title}» (#${e.id})`)
  if (!DRY) await db.query('DELETE FROM lessons WHERE id=$1', [e.id])
}

// ── ШАГ 4: удалить старые под-уроки (каскад: words/exercises/прогресс) ───────
log('\nШАГ 4 — удаление 14 под-уроков (105–118)')
const { rows: subs } = await db.query('SELECT id, title FROM lessons WHERE id = ANY($1)', [SUB_LESSONS])
for (const s of subs) log(`  ✗ «${s.title}» (#${s.id})`)
if (!DRY) await db.query('DELETE FROM lessons WHERE id = ANY($1)', [SUB_LESSONS])

// ── ШАГ 5: Урок 13 — слить 123 в 122 ─────────────────────────────────────────
log('\nШАГ 5 — объединение Урока 13 (122 + 123)')
const { rows: w123 } = await db.query('SELECT id, word_de FROM words WHERE lesson_id=$1', [LESSON_13.drop])
for (const w of w123) {
  const { rows: dup } = await db.query(
    `SELECT id FROM words WHERE lesson_id=$1
       AND regexp_replace(lower(word_de), '^(der|die|das|ein|eine)\\s+', '') = $2 LIMIT 1`,
    [LESSON_13.keep, bare(w.word_de)])
  if (dup.length) { log(`  ⊕ дубль «${w.word_de}» — сливаю`); await mergeWord(w.id, dup[0].id, LESSON_13.keep) }
  else if (!DRY) await db.query('UPDATE words SET lesson_id=$1 WHERE id=$2', [LESSON_13.keep, w.id])
}
if (!DRY) {
  await db.query('UPDATE exercises SET lesson_id=$1 WHERE lesson_id=$2', [LESSON_13.keep, LESSON_13.drop])
  await db.query('UPDATE lesson_sentences SET lesson_id=$1 WHERE lesson_id=$2', [LESSON_13.keep, LESSON_13.drop]).catch(() => {})
  await db.query('UPDATE grammar_points SET lesson_id=$1 WHERE lesson_id=$2', [LESSON_13.keep, LESSON_13.drop]).catch(() => {})
  await db.query('UPDATE lesson_media SET lesson_id=$1 WHERE lesson_id=$2', [LESSON_13.keep, LESSON_13.drop]).catch(() => {})
  await db.query('DELETE FROM lessons WHERE id=$1', [LESSON_13.drop])
}

// Название Урока 13 по фактическим словам
async function regenMeta(lessonId, num) {
  const { rows: ws } = await db.query('SELECT word_de, translation_ru FROM words WHERE lesson_id=$1 ORDER BY id', [lessonId])
  const meta = await generateLessonMeta(ws, [], TARGET)
  const title = `Урок ${num}: ${meta.title}`
  log(`  название: «${title}» — ${meta.description}`)
  if (DRY) return
  const tr = await translateLessonMeta(meta.title, meta.description)
  await db.query(
    `UPDATE lessons SET title=$1, description=$2, lesson_number=$5,
       title_translations=$3::jsonb, description_translations=$4::jsonb WHERE id=$6`,
    [title, meta.description, JSON.stringify(tr.title), JSON.stringify(tr.description), num, lessonId])
}
await regenMeta(LESSON_13.keep, 13)

// ── ШАГ 6: Урок 3 — честное название по реальным словам ──────────────────────
log('\nШАГ 6 — новое название Урока 3')
await regenMeta(LESSON_3, 3)

// ── ШАГ 7: дообогащение наборов, получивших новые слова ──────────────────────
log('\nШАГ 7 — обогащение затронутых наборов (переводы/картинки-банк/упражнения)')
if (!DRY) {
  for (const id of affectedSets) {
    log(`  обогащаю набор #${id}...`)
    try { await enrichLesson(id) } catch (e) { console.error('  enrich', id, e.message) }
    try { await regenerateExercisesFromDb(id) } catch (e) { console.error('  regen', id, e.message) }
  }
}

// ── Финальная сводка ─────────────────────────────────────────────────────────
const { rows: fin } = await db.query(
  `SELECT count(*) FILTER (WHERE NOT is_set AND NOT is_personal) AS lessons,
          count(*) FILTER (WHERE is_set) AS sets FROM lessons WHERE owner_id=$1`, [ownerId])
log(`\nГОТОВО. Уроков: ${fin[0].lessons}, наборов: ${fin[0].sets}${DRY ? ' (DRY_RUN — БД не менялась)' : ''}`)
process.exit(0)
