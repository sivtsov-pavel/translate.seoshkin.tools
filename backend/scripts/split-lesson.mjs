#!/usr/bin/env node
// Разбивка тяжёлого урока на несколько по темам.
//
// Причина: урок с одного разворота учебника бывает на 130–190 слов, где смешаны
// мебель, цвета и грамматика. Пройти такой за присест нельзя, и он стоит стеной.
//
// Что делает:
//   1) классифицирует слова урока по темам (gpt-4o, знание рода и смысла);
//   2) раскладывает темы по --parts корзинам примерно поровну;
//   3) ИСХОДНЫЙ УРОК ОСТАЁТСЯ ПЕРВОЙ ЧАСТЬЮ — его только переименовываем;
//   4) на остальные части заводит новые уроки и переносит туда слова
//      ВМЕСТЕ С УПРАЖНЕНИЯМИ (прогресс привязан к упражнениям, не к уроку);
//   5) предложения урока раздаёт по частям — той, чьи слова в них встречаются;
//   6) сдвигает номера последующих уроков, освобождая место;
//   7) дописывает новым частям переводы названия и описание на локали.
//
// ⚠️ Почему исходный урок НЕ удаляется (правка 28.09.2026). Прежняя версия
//    создавала N новых уроков и удаляла исходный. На нём висят ON DELETE CASCADE:
//    lesson_sentences, lesson_media, grammar_points, user_lesson_passed,
//    user_lesson_unlocked. Удаление уносило предложения урока и отметки о
//    прохождении вместе с ним — молча. Переиспользование исходного урока как
//    первой части убирает саму возможность такой потери.
//
// 💸 Тратит OpenAI: классификация (gpt-4o) ориентир $0.05 на 130 слов,
//    названия/описания новых частей (gpt-4o-mini) ~$0.002 на часть.
//    Без --apply печатает только план.
//
//   node scripts/split-lesson.mjs --lesson=38 --parts=3
//   node scripts/split-lesson.mjs --lesson=38 --parts=3 --apply
import fs from 'node:fs'
import { db } from '../src/db/index.js'
import { classifyWordsToThemes, generateLessonMeta, translateLessonMeta, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const arg = (name, def) => {
  const v = process.argv.find(a => a.startsWith(`--${name}=`))
  return v ? v.split('=')[1] : def
}
const LESSON_NUMBER = parseInt(arg('lesson', '0'), 10)
const PARTS = Math.max(2, parseInt(arg('parts', '3'), 10))
const LANG = arg('lang', 'de')

if (!LESSON_NUMBER) { console.error('Укажи урок: --lesson=38'); process.exit(1) }

const { rows: lessonRows } = await db.query(
  `SELECT id, lesson_number, title, target_lang, course_id, owner_id, school_id, textbook_id, date, status
   FROM lessons WHERE lesson_number = $1 AND target_lang = $2 AND is_set = false AND is_personal = false`,
  [LESSON_NUMBER, LANG])
if (lessonRows.length > 1) {
  console.error(`Уроков с номером ${LESSON_NUMBER} несколько — уточни вручную`); process.exit(1)
}
const lesson = lessonRows[0]
if (!lesson) { console.error(`Урок ${LESSON_NUMBER} (${LANG}) не найден`); process.exit(1) }

const { rows: words } = await db.query(
  `SELECT id, word_de, translation_ru, is_function_word FROM words WHERE lesson_id = $1 ORDER BY id`, [lesson.id])
console.log(`\nУрок ${lesson.lesson_number}: «${lesson.title}» — ${words.length} слов`)
if (words.length < 30) { console.log('Урок и так небольшой, разбивать нечего.'); process.exit(0) }

// Классификация кэшируется на диск. Две причины, обе важные:
//   1) gpt-4o недетерминирован — без кэша --apply разрезал бы урок ИНАЧЕ, чем
//      показал план, и глазами проверить план было бы нельзя;
//   2) каждый прогон стоит ~$0.05, а план обычно смотрят не один раз.
const CACHE = `/tmp/split-lesson-${LANG}-${LESSON_NUMBER}.json`
resetUsage()
let classified = null
if (fs.existsSync(CACHE)) {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    if (c.wordIds?.join(',') === words.map(w => w.id).join(',')) {
      classified = c.classified
      console.log(`(раскладка взята из ${CACHE} — та же, что показал план, OpenAI не вызывался)`)
    }
  } catch { /* битый кэш — просто переспросим модель */ }
}
if (!classified) {
  try {
    classified = await classifyWordsToThemes(
      words.map(w => ({ de: w.word_de, tr: w.translation_ru })), lesson.target_lang)
  } catch (e) {
    // Стек на пол-экрана не говорит человеку ничего. Самая частая причина —
    // кончился баланс OpenAI, и тогда ответ один: пополнить и повторить.
    const quota = /insufficient_quota|no credits remaining|credit_balance_exhausted/i.test(e.message || '')
    console.error(quota
      ? `\n💸 Баланс OpenAI кончился — классифицировать темы нечем.\n` +
        `   Пополнить: https://platform.openai.com/settings/organization/billing/\n` +
        `   Либо положить готовый раскрой в ${CACHE} и запустить снова — тогда вызова не будет.`
      : `\nКлассификация не удалась: ${e.message}`)
    process.exit(1)
  }
  if (classified.length !== words.length) {
    console.error(`⚠️ Классификатор вернул ${classified.length} из ${words.length} — не режу, повтори запуск`)
    process.exit(1)
  }
  fs.writeFileSync(CACHE, JSON.stringify({ wordIds: words.map(w => w.id), classified }))
}

// Группируем по темам
const byTheme = new Map()
classified.forEach((c, i) => {
  const theme = (c?.theme || 'Разное').trim()
  if (!byTheme.has(theme)) byTheme.set(theme, [])
  byTheme.get(theme).push(words[i])
})

// Режем урок ПО ПОРЯДКУ УЧЕБНИКА, а не по размеру тем. Темы выстраиваем в том
// порядке, в каком они впервые встречаются на развороте, и делим этот ряд на
// PARTS подряд идущих кусков, максимально ровных по числу слов.
//
// Почему не «самую крупную тему в самую пустую корзину»: так в один урок попадают
// «Глаголы, Эмоции, Цвета» — размер ровный, а учить по такому нельзя. Разворот
// учебника уже разложен осмысленно, и порядок слов в нём — готовая подсказка.
const order = new Map()
classified.forEach((c, i) => {
  const theme = (c?.theme || 'Разное').trim()
  if (!order.has(theme)) order.set(theme, i)
})
const themes = [...byTheme.entries()].sort((a, b) => order.get(a[0]) - order.get(b[0]))

// Перебираем все способы разрезать ряд тем на PARTS кусков, берём тот, где самый
// большой кусок минимален (тем всегда меньше двух десятков — перебор мгновенный)
function bestCuts(sizes, parts) {
  const n = sizes.length
  if (parts > n) return null
  let best = null
  const walk = (start, left, cuts) => {
    if (left === 1) {
      const all = [...cuts, n]
      let prev = 0, mx = 0, ok = true
      for (const c of all) {
        const sum = sizes.slice(prev, c).reduce((a, b) => a + b, 0)
        if (sum === 0) ok = false
        mx = Math.max(mx, sum); prev = c
      }
      if (ok && (!best || mx < best.mx)) best = { mx, cuts: all }
      return
    }
    for (let c = start + 1; c <= n - (left - 1); c++) walk(c, left - 1, [...cuts, c])
  }
  walk(0, parts, [])
  return best
}
const cut = bestCuts(themes.map(([, ws]) => ws.length), PARTS)
if (!cut) { console.error(`Тем всего ${themes.length} — на ${PARTS} частей не делится`); process.exit(1) }

const buckets = []
let from = 0
for (const to of cut.cuts) {
  const slice = themes.slice(from, to)
  buckets.push({ themes: slice.map(([t]) => t), words: slice.flatMap(([, ws]) => ws) })
  from = to
}
// Сохраняем порядок слов как в учебнике
buckets.forEach(b => b.words.sort((x, y) => x.id - y.id))

// Название части — её темы. Служебную «Разное» в заголовок не тащим, если есть
// содержательные соседи: «Дом и быт, Разное» читается как недоделка.
const titleOf = (b) => {
  const named = b.themes.filter(t => t !== 'Разное')
  return (named.length ? named : b.themes).slice(0, 3).join(', ')
}

console.log(`\nПолучится частей: ${PARTS}`)
buckets.forEach((b, i) => {
  console.log(`  ${LESSON_NUMBER + i}. «${titleOf(b)}» — ${b.words.length} слов`)
  console.log(`      ${b.words.slice(0, 8).map(w => w.word_de).join(', ')}…`)
})

// Предложения урока — отдаём той части, чьих слов в предложении больше
const { rows: sentences } = await db.query(
  `SELECT id, text FROM lesson_sentences WHERE lesson_id = $1 ORDER BY id`, [lesson.id])
const bare = (s) => String(s || '').replace(/^(der|die|das|ein|eine)\s+/i, '').trim().toLowerCase()
// Считаем только по СОДЕРЖАТЕЛЬНЫМ словам. Служебные («ist», «und», «Ich») стоят
// почти в каждом предложении: по ним всё сваливается в ту часть, куда попала
// «Грамматика», и остальные остаются пустыми. Короткие слова отбрасываем тоже —
// «alt» находится внутри «Gestalt».
const isContent = (w) => !w.is_function_word && bare(w.word_de).length > 3
const hits = (low, w) => new RegExp(`(^|[^\\p{L}])${bare(w.word_de).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(low)
const sentencePlan = sentences.map(s => {
  const low = s.text.toLowerCase()
  const scores = buckets.map(b => b.words.filter(w => isContent(w) && hits(low, w)).length)
  const max = Math.max(...scores)
  return { id: s.id, text: s.text, part: max > 0 ? scores.indexOf(max) : 0 }
})
console.log(`\nПредложений урока: ${sentences.length} → ` +
  buckets.map((_, i) => `часть ${LESSON_NUMBER + i}: ${sentencePlan.filter(p => p.part === i).length}`).join(', '))
console.log(`Медиа, грамматика, набор фраз и отметки о прохождении остаются у части ${LESSON_NUMBER} (это тот же урок).`)
console.log(`\nНомера ${LESSON_NUMBER}…${LESSON_NUMBER + PARTS - 1}, последующие уроки сдвинутся на +${PARTS - 1}`)
console.log(`Потрачено на классификацию: $${usageCostUSD().toFixed(4)}`)

if (!APPLY) {
  console.log(`\nЭто только план — ничего не изменено.\n  node scripts/split-lesson.mjs --lesson=${LESSON_NUMBER} --parts=${PARTS} --apply`)
  process.exit(0)
}

// Освобождаем номера под новые части
const shift = PARTS - 1
await db.query(
  `UPDATE lessons SET lesson_number = lesson_number + $1
   WHERE target_lang = $2 AND is_set = false AND is_personal = false AND lesson_number > $3`,
  [shift, lesson.target_lang, LESSON_NUMBER])
console.log(`Сдвинуто последующих уроков: +${shift}`)

// Номер продублирован внутри названия («Урок 39: Языки»), и после сдвига урок с
// номером 41 продолжал называться «Урок 39» — на «Пути» это два разных урока 39.
// Правим прямо здесь, а не отдельным забываемым скриптом.
const TITLE_NUM = /^(\s*(?:Урок|Lektion|Lesson|Lección)\s*)(\d+)(\s*[:.\-–])/iu
const { rows: shifted } = await db.query(
  `SELECT id, lesson_number, title, COALESCE(title_translations,'{}'::jsonb) AS tt
   FROM lessons WHERE target_lang = $1 AND is_set = false AND is_personal = false
     AND lesson_number > $2`, [lesson.target_lang, LESSON_NUMBER + shift])
for (const l of shifted) {
  const m = TITLE_NUM.exec(l.title || '')
  if (!m || Number(m[2]) === l.lesson_number) continue
  const tt = {}
  for (const [lang, val] of Object.entries(l.tt)) {
    if (typeof val === 'string' && TITLE_NUM.test(val)) tt[lang] = val.replace(TITLE_NUM, `$1${l.lesson_number}$3`)
  }
  await db.query(
    `UPDATE lessons SET title = $1, title_translations = COALESCE(title_translations,'{}'::jsonb) || $2::jsonb
     WHERE id = $3`, [l.title.replace(TITLE_NUM, `$1${l.lesson_number}$3`), JSON.stringify(tt), l.id])
  console.log(`  ✓ номер в названии: #${l.id} → «Урок ${l.lesson_number}…»`)
}

const partIds = [lesson.id]

// Часть 1 — это сам исходный урок: меняем только название.
//
// Описание и его локали НЕ обнуляем здесь. Прежняя версия стирала их сразу, а
// заполняла ниже — и если шаг меты падал (например, кончился баланс OpenAI),
// урок оставался вообще без описания, то есть хуже, чем до разбивки.
// Ниже они перезаписываются целиком — но только когда есть чем.
await db.query(`UPDATE lessons SET title = $1 WHERE id = $2`,
  [`Урок ${LESSON_NUMBER}: ${titleOf(buckets[0])}`, lesson.id])
console.log(`  ✓ Урок ${LESSON_NUMBER}: ${titleOf(buckets[0])} (исходный, слов ${buckets[0].words.length})`)

// Части 2..N — новые уроки
for (let i = 1; i < PARTS; i++) {
  const b = buckets[i]
  const number = LESSON_NUMBER + i
  const title = `Урок ${number}: ${titleOf(b)}`
  const { rows: created } = await db.query(
    `INSERT INTO lessons (lesson_number, title, target_lang, course_id, owner_id, school_id, textbook_id, date, status, is_set)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'done',false) RETURNING id`,
    [number, title, lesson.target_lang, lesson.course_id, lesson.owner_id, lesson.school_id, lesson.textbook_id, lesson.date])
  const newId = created[0].id
  partIds.push(newId)

  const ids = b.words.map(w => w.id)
  await db.query('UPDATE words SET lesson_id = $1 WHERE id = ANY($2::int[])', [newId, ids])
  const ex = await db.query('UPDATE exercises SET lesson_id = $1 WHERE word_id = ANY($2::int[])', [newId, ids])
  console.log(`  ✓ ${title}: слов ${ids.length}, упражнений ${ex.rowCount}`)
}

// Предложения по частям
for (let i = 1; i < PARTS; i++) {
  const ids = sentencePlan.filter(p => p.part === i).map(p => p.id)
  if (!ids.length) continue
  await db.query('UPDATE lesson_sentences SET lesson_id = $1 WHERE id = ANY($2::int[])', [partIds[i], ids])
  console.log(`  ✓ предложений в часть ${LESSON_NUMBER + i}: ${ids.length}`)
}

// Названия и описания новых частей на локали — иначе в списке уроков у ученика
// с нерусским интерфейсом висит русская строка
for (let i = 0; i < PARTS; i++) {
  const id = partIds[i]
  try {
    const { rows: ws } = await db.query('SELECT word_de, translation_ru FROM words WHERE lesson_id=$1 ORDER BY id', [id])
    const { rows: sents } = await db.query('SELECT text FROM lesson_sentences WHERE lesson_id=$1 LIMIT 12', [id])
    const meta = await generateLessonMeta(ws, [], lesson.target_lang, sents.map(s => s.text))
    const title = `Урок ${LESSON_NUMBER + i}: ${titleOf(buckets[i])}`
    const tr = await translateLessonMeta(titleOf(buckets[i]), meta?.description || '')
    // Перезаписываем ЦЕЛИКОМ, а не сливаем: у первой части в этих полях лежит
    // описание прежнего большого урока, и слияние оставило бы чужие локали.
    await db.query(
      `UPDATE lessons SET description = COALESCE($1, description),
              title_translations = $2::jsonb,
              description_translations = $3::jsonb
       WHERE id = $4`,
      [meta?.description || null, JSON.stringify(tr.title || {}), JSON.stringify(tr.description || {}), id])
    console.log(`  ✓ описание и локали: ${title}`)
  } catch (e) {
    console.error(`  ✖ мета части ${LESSON_NUMBER + i}: ${e.message}`)
    console.error(`     описание осталось прежним — впишите вручную или повторите шаг позже`)
  }
}

await logOperation({
  kind: 'cleanup', status: 'ok', provider: 'openai', costUsd: usageCostUSD(),
  message: `урок ${LESSON_NUMBER} разбит на ${PARTS} (исходный стал первой частью)`,
}).catch(() => {})
console.log(`\nГотово. Потрачено: $${usageCostUSD().toFixed(4)}`)
process.exit(0)
