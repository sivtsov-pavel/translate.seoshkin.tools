#!/usr/bin/env node
// Перегенерация упражнений для слов, которые мы починили или которые аудит
// уличил в настоящей ошибке.
//
// Берём точечно, а не целыми уроками: у слова «hoffst» упражнения построены
// вокруг спрягаемой формы («Ich hoffst…»), и после правки слова на «hoffen» их
// надо пересобрать — но соседние слова урока трогать незачем, они в порядке.
//
// Кого перегенерируем:
//   1. Слова, исправленные fix-dictionary.mjs (список в /tmp/dictionary-rollback.json).
//   2. Находки аудита из НАДЁЖНЫХ категорий: «грамматическая ошибка» и «пример не
//      про слово». Категория «ответ не подходит» намеренно пропущена — вычитка
//      показала, что там больше половины придирок к нормальным фразам
//      («Das Glas ist voll», «Du fängst das Spiel an»), и чинить их значит портить.
//
// Генерация идёт штатным generateExercises с валидацией, поэтому неважно, была ли
// претензия аудита точной: новое упражнение строится по правилам, а не по жалобе.
//
// 💸 Тратит OpenAI (gpt-4o-mini). Без --run печатает смету. Одобрено Павлом 13.08.2026.
//
//   node scripts/regen-fixed-words.mjs           # смета
//   node scripts/regen-fixed-words.mjs --run     # перегенерация
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { db } from '../src/db/index.js'
import { generateExercises, translateExercisePayloads, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const RUN = process.argv.includes('--run')
const DICT = '/tmp/dictionary-rollback.json'
const AUDIT = '/tmp/ai-audit-2026-08-13-verified.json'
const ROLLBACK = '/tmp/regen-rollback.json'

// Типы, которые строит generateExercises. dictation/speech не трогаем: они берут
// само слово и после правки словаря уже корректны.
const TEXT_TYPES = ['flashcard', 'multiple_choice', 'fill_blank', 'sentence_write', 'letter_fill']

// ── Кого чиним ───────────────────────────────────────────────────────────────
const wordIds = new Set()

if (existsSync(DICT)) {
  const d = JSON.parse(readFileSync(DICT, 'utf8'))
  for (const v of d.verbs || []) wordIds.add(v.id)
  for (const a of d.artFix || []) wordIds.add(a.id)
}

// Надёжные категории аудита
const RELIABLE = /грамматическ|не связан|не относится|не про |не соответствует значению|не иллюстрир|бессмысленн/i
let auditIds = []
if (existsSync(AUDIT)) {
  const a = JSON.parse(readFileSync(AUDIT, 'utf8'))
  auditIds = (a.confirmed || []).filter(c => RELIABLE.test(c.problem)).map(c => c.id)
}

// Слова за находками аудита (у части слов их может уже не быть — почищены)
const { rows: auditWords } = auditIds.length
  ? await db.query(`SELECT DISTINCT e.word_id FROM exercises e
                    JOIN words w ON w.id = e.word_id JOIN lessons l ON l.id = w.lesson_id
                    WHERE e.id = ANY($1::int[]) AND e.word_id IS NOT NULL
                      AND l.target_lang = 'de' AND NOT w.is_function_word`, [auditIds])
  : { rows: [] }
for (const r of auditWords) wordIds.add(r.word_id)

const ids = [...wordIds]
const { rows: words } = ids.length
  ? await db.query(`SELECT w.id, w.word_de, w.translation_ru, w.lesson_id, l.target_lang
                    FROM words w JOIN lessons l ON l.id = w.lesson_id
                    WHERE w.id = ANY($1::int[]) AND NOT w.is_function_word ORDER BY w.lesson_id, w.id`, [ids])
  : { rows: [] }

const byLesson = new Map()
for (const w of words) {
  if (!byLesson.has(w.lesson_id)) byLesson.set(w.lesson_id, [])
  byLesson.get(w.lesson_id).push(w)
}

console.log(`\nСлов на перегенерацию: ${words.length} (из словаря ${wordIds.size - auditWords.length}, из аудита ${auditWords.length})`)
console.log(`Уроков затронуто: ${byLesson.size}`)
console.log(`Находок аудита в надёжных категориях: ${auditIds.length} из общего числа подтверждённых`)
console.log(`Ориентир: ~${byLesson.size * 2} вызовов gpt-4o-mini, примерно $${(byLesson.size * 0.004).toFixed(2)}\n`)

if (!RUN) {
  console.log('Это смета — ничего не изменено. Запуск: --run')
  process.exit(0)
}

// ── Перегенерация ────────────────────────────────────────────────────────────
const { rows: oldEx } = await db.query(
  `SELECT id, word_id, type, payload FROM exercises WHERE word_id = ANY($1::int[]) AND type = ANY($2::text[])`,
  [words.map(w => w.id), TEXT_TYPES])
writeFileSync(ROLLBACK, JSON.stringify(oldEx, null, 1))
console.log(`Откат записан: ${ROLLBACK} (${oldEx.length} упражнений)`)

resetUsage()
let replaced = 0, added = 0, lessons = 0

for (const [lessonId, ws] of byLesson) {
  lessons++
  try {
    const generated = await generateExercises(
      ws.map(w => ({ word_de: w.word_de, translation_ru: w.translation_ru })), [], ws[0].target_lang, [])
    if (!generated.length) { console.log(`  урок ${lessonId}: пусто, пропуск`); continue }

    // Ключ без артикля: модель возвращает слово то с ним, то без
    const key = (s) => String(s || '').toLowerCase().replace(/^(der|die|das)\s+/, '').trim()
    const byKey = new Map(ws.map(w => [key(w.word_de), w.id]))

    // Пул старых упражнений: обновляем НА МЕСТЕ, чтобы прогресс ученика уцелел
    const pool = new Map()
    for (const e of oldEx.filter(e => ws.some(w => w.id === e.word_id))) {
      const k = `${e.word_id}|${e.type}`
      if (!pool.has(k)) pool.set(k, [])
      pool.get(k).push(e.id)
    }

    const fresh = []
    const seen = new Set()
    for (const ex of generated) {
      const wid = byKey.get(key(ex.word_de))
      if (!wid || !TEXT_TYPES.includes(ex.type)) continue
      const k = `${wid}|${ex.type}`
      if (seen.has(k)) continue
      seen.add(k)
      const reuse = pool.get(k)?.shift()
      if (reuse) {
        await db.query('UPDATE exercises SET payload = $1, payload_translations = $2 WHERE id = $3',
          [JSON.stringify(ex.payload), '{}', reuse])
        fresh.push({ id: reuse, type: ex.type, payload: ex.payload })
        replaced++
      } else {
        const { rows } = await db.query(
          'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4) RETURNING id',
          [lessonId, wid, ex.type, JSON.stringify(ex.payload)])
        fresh.push({ id: rows[0].id, type: ex.type, payload: ex.payload })
        added++
      }
    }

    // Переводы payload на локали интерфейса — иначе ученик с украинским увидит русский
    if (fresh.length) {
      try { await translateExercisePayloads(fresh) } catch (e) { console.error(`  переводы урока ${lessonId}: ${e.message}`) }
    }
    console.log(`  урок ${lessonId}: слов ${ws.length}, обновлено ${fresh.length} ($${usageCostUSD().toFixed(3)})`)
  } catch (e) {
    console.error(`  ✗ урок ${lessonId}: ${e.message}`)
  }
}

const cost = usageCostUSD()
await logOperation({ kind: 'regenerate', status: 'ok', costUsd: cost,
  message: `Перегенерация починенных слов: ${words.length} слов в ${lessons} уроках, обновлено ${replaced}, добавлено ${added}`,
  meta: { rollback: ROLLBACK } }).catch(() => {})

console.log(`\nГотово: обновлено ${replaced}, добавлено ${added}. Потрачено: $${cost.toFixed(4)}`)
process.exit(0)
