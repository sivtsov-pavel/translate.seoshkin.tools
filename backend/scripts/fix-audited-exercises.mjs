#!/usr/bin/env node
// Починка находок ИИ-аудита адекватности (docs/audits/ai-audit-de-2026-08-07.json).
//
// Три стадии — каждая запускается отдельно, между ними можно смотреть глазами:
//
//   1) план (по умолчанию): что нашли, сколько слов/упражнений затронуто, смета. Без ИИ.
//   2) --triage: ИИ-разбор СЛОВ, стоящих за находками: ok / fix (опечатка, артикль,
//      перевод) / delete (выдуманное слово — Hommian, Peda, Briefland...). Решения
//      пишутся в /tmp/fix-triage.json ВНУТРИ контейнера — посмотреть перед apply.
//   3) --apply: применяет триаж (delete каскадом сносит упражнения слова; fix правит
//      слово и синхронизирует его копии в payload всех упражнений), затем точечно
//      перегенерирует битые fill_blank/sentence_write через gpt-4o-mini С ВАЛИДАЦИЕЙ
//      (sanitizeExercise + checkExercise — те же фильтры, что у штатной генерации),
//      letter_fill чинит детерминированно (buildMask), и переводит исправленные
//      payload на локали (translateExercisePayloads). Откат — /tmp/fix-rollback.json.
//
// Прогресс учеников сохраняется: payload обновляется НА МЕСТЕ (id не меняются).
// У удалённых слов прогресс уходит вместе с упражнениями — это осознанно: слово выдумано.
//
// 💸 Тратит OpenAI (gpt-4o-mini): триаж ~15 вызовов, перегенерация ~40–80, переводы ~30.
//    Ориентир: до $0.5. Одобрено Павлом 07.08.2026 (вариант 1 из отчёта аудита).
//
//   cat docs/audits/ai-audit-de-2026-08-07.json | docker compose ... exec -T backend sh -c 'cat > /tmp/findings.json'
//   docker compose ... exec -T backend node scripts/fix-audited-exercises.mjs             # план
//   docker compose ... exec -T backend node scripts/fix-audited-exercises.mjs --triage    # разбор слов
//   docker compose ... exec -T backend node scripts/fix-audited-exercises.mjs --apply     # починка
//
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage, resetUsage, usageCostUSD, sanitizeExercise, translateExercisePayloads } from '../src/services/claude.js'
import { checkExercise } from '../src/services/lessonAudit.js'
import { buildMask, isValidMask } from '../src/services/letterFill.js'
import { logOperation } from '../src/services/opLog.js'

const MODE = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--triage') ? 'triage' : 'plan'
const MODEL = 'gpt-4o-mini'
const FINDINGS = '/tmp/findings.json'
const TRIAGE = '/tmp/fix-triage.json'
const ROLLBACK = '/tmp/fix-rollback.json'

const ask = async (prompt, max_tokens = 3000) => {
  const res = await platformClient.chat.completions.create({
    model: MODEL, max_tokens, messages: [{ role: 'user', content: prompt }],
  })
  trackUsage(MODEL, res.usage || {})
  return (res.choices[0].message.content || '').replace(/^```(json)?|```$/gm, '').trim()
}
const stripArticle = (s) => String(s || '').replace(/^(der|die|das)\s+/i, '').trim()
const hasCyr = (s) => /[Ѐ-ӿ]/.test(String(s || ''))

// ── Данные ────────────────────────────────────────────────────────────────────
if (!existsSync(FINDINGS)) { console.error(`Нет ${FINDINGS} — залей findings через stdin (см. шапку)`); process.exit(1) }
const findings = JSON.parse(readFileSync(FINDINGS, 'utf8'))
const ids = findings.map(f => f.id)
const { rows: exRows } = await db.query(
  `SELECT e.id, e.type, e.lesson_id, e.word_id, e.payload, l.target_lang,
          w.id AS w_id, w.word_de, w.translation_ru
   FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   LEFT JOIN words w ON w.id = e.word_id
   WHERE e.id = ANY($1::int[])`, [ids])
const exById = new Map(exRows.map(r => [r.id, r]))
const gone = ids.filter(id => !exById.has(id))
const words = [...new Map(exRows.filter(r => r.w_id).map(r => [r.w_id, { id: r.w_id, word_de: r.word_de, translation_ru: r.translation_ru }])).values()]

console.log(`Находок: ${findings.length}, упражнений живо: ${exRows.length} (исчезло ранее: ${gone.length})`)
console.log(`Уникальных слов за находками: ${words.length}`)

if (MODE === 'plan') {
  const byType = {}
  for (const r of exRows) byType[r.type] = (byType[r.type] || 0) + 1
  console.log('По типам:', byType)
  console.log(`Смета: триаж ~${Math.ceil(words.length / 20)} вызовов, перегенерация ~${Math.ceil(exRows.length / 10) * 2}, переводы ~${Math.ceil(exRows.length / 15) * 2} — суммарно до ~$0.5`)
  console.log('Дальше: --triage, посмотреть /tmp/fix-triage.json, затем --apply')
  process.exit(0)
}

// ── Стадия 2: триаж слов ──────────────────────────────────────────────────────
if (MODE === 'triage') {
  resetUsage()
  const decisions = []
  for (let i = 0; i < words.length; i += 20) {
    const batch = words.slice(i, i + 20)
    const text = await ask(`Ты — редактор словаря немецкого (A1, переводы на русский). Ниже слова из словаря с переводами.
Для каждого слова вынеси вердикт:
- "ok" — слово и перевод в порядке (словоформы типа «packst», «liest» — это НОРМАЛЬНО, это уроки спряжения; слова с артиклем — нормально);
- "fix" — слово настоящее, но есть опечатка/неверный артикль/неверный перевод — дай исправление;
- "delete" — слово ВЫДУМАННОЕ, не существует в немецком (например «Hommian», «Peda», «Briefland», «Superdug», английские слова вместо немецких) или перевод «нет перевода».
Сомневаешься — "ok". Не выдумывай проблем.
Ответь ТОЛЬКО JSON-массивом: [{"id": 1, "action": "ok"|"fix"|"delete", "word_de": "...только для fix", "translation_ru": "...только для fix", "why": "кратко только для fix/delete"}]

Слова:
${JSON.stringify(batch)}`)
    try { decisions.push(...JSON.parse(text)) } catch (e) { console.error(`батч ${i}: не разобрался — ${e.message}`) }
  }
  writeFileSync(TRIAGE, JSON.stringify(decisions, null, 1))
  const fix = decisions.filter(d => d.action === 'fix'), del = decisions.filter(d => d.action === 'delete')
  console.log(`Триаж готов (${TRIAGE}): ok ${decisions.length - fix.length - del.length}, fix ${fix.length}, delete ${del.length}. Потрачено $${usageCostUSD().toFixed(3)}`)
  const wById = new Map(words.map(w => [w.id, w]))
  for (const d of del) console.log(`  🗑 слово #${d.id} «${wById.get(d.id)?.word_de}» — ${d.why}`)
  for (const d of fix) console.log(`  ✏️ слово #${d.id} «${wById.get(d.id)?.word_de} = ${wById.get(d.id)?.translation_ru}» → «${d.word_de} = ${d.translation_ru}» — ${d.why}`)
  process.exit(0)
}

// ── Стадия 3: применение ──────────────────────────────────────────────────────
if (!existsSync(TRIAGE)) { console.error(`Нет ${TRIAGE} — сначала --triage`); process.exit(1) }
resetUsage()
const t0 = Date.now()
const triage = JSON.parse(readFileSync(TRIAGE, 'utf8'))
const rollback = { words: [], exercises: [] }
const report = { wordsDeleted: 0, wordsFixed: 0, exSynced: 0, exRegen: 0, exFailed: [], exDeletedByWord: 0 }

// 3a. Слова: delete каскадом, fix + синхронизация копий в payload
for (const d of triage) {
  const w = (await db.query('SELECT * FROM words WHERE id=$1', [d.id])).rows[0]
  if (!w) continue
  if (d.action === 'delete') {
    const { rows: exs } = await db.query('SELECT * FROM exercises WHERE word_id=$1', [d.id])
    rollback.words.push({ row: w, exercises: exs })
    report.exDeletedByWord += exs.length
    await db.query('DELETE FROM words WHERE id=$1', [d.id]) // каскад: exercises + attempts
    report.wordsDeleted++
  } else if (d.action === 'fix' && (d.word_de || d.translation_ru)) {
    rollback.words.push({ row: w })
    const newWord = d.word_de || w.word_de, newTr = d.translation_ru || w.translation_ru
    try {
      await db.query('UPDATE words SET word_de=$1, translation_ru=$2 WHERE id=$3', [newWord, newTr, d.id])
    } catch (e) {
      // Уникальный (lesson_id, word_de): исправленное слово уже есть в уроке — этот дубль удаляем
      const { rows: exs } = await db.query('SELECT * FROM exercises WHERE word_id=$1', [d.id])
      rollback.words[rollback.words.length - 1].exercises = exs
      await db.query('DELETE FROM words WHERE id=$1', [d.id])
      report.wordsDeleted++; report.exDeletedByWord += exs.length
      continue
    }
    report.wordsFixed++
    // Синхронизация копий слова в payload его упражнений (замена по СТАРЫМ значениям)
    const { rows: exs } = await db.query('SELECT id, type, payload FROM exercises WHERE word_id=$1', [d.id])
    for (const e of exs) {
      let p = e.payload || {}, changed = false
      const swap = (k, oldV, newV) => { if (p[k] === oldV && oldV !== newV) { p = { ...p, [k]: newV }; changed = true } }
      swap('word_de', w.word_de, newWord); swap('translation_ru', w.translation_ru, newTr)
      swap('question', w.word_de, newWord); swap('answer', w.translation_ru, newTr)
      if (e.type === 'letter_fill') {
        const ans = stripArticle(newWord)
        if (p.answer !== ans || !isValidMask(p.masked, p.answer)) {
          const masked = buildMask(ans)
          if (masked) { p = { ...p, answer: ans, masked, word_de: newWord, translation_ru: newTr }; changed = true }
        }
      }
      if (e.type === 'multiple_choice' && Array.isArray(p.options)) {
        const i2 = p.options.indexOf(w.translation_ru)
        if (i2 >= 0 && Number.isInteger(p.correct) && i2 === p.correct && w.translation_ru !== newTr) {
          const options = [...p.options]; options[i2] = newTr
          p = { ...p, options }; changed = true
        }
        if (typeof p.question === 'string' && p.question.includes(w.word_de) && w.word_de !== newWord) {
          p = { ...p, question: p.question.split(w.word_de).join(newWord) }; changed = true
        }
      }
      if (changed) {
        rollback.exercises.push({ id: e.id, payload: e.payload })
        await db.query('UPDATE exercises SET payload=$1 WHERE id=$2', [JSON.stringify(p), e.id])
        report.exSynced++
      }
    }
  }
}

// 3b. Точечная перегенерация битых fill_blank / sentence_write (слово живо и настоящее)
const alive = []
for (const f of findings) {
  const r = (await db.query(
    `SELECT e.id, e.type, e.lesson_id, e.word_id, e.payload, w.word_de, w.translation_ru
     FROM exercises e LEFT JOIN words w ON w.id=e.word_id WHERE e.id=$1`, [f.id])).rows[0]
  if (r) alive.push({ ...r, why: f.why })
}

// letter_fill — детерминированно, без ИИ
for (const e of alive.filter(x => x.type === 'letter_fill' && x.word_de)) {
  const ans = stripArticle(e.word_de)
  const masked = buildMask(ans)
  if (!masked) continue
  const p = { word_de: e.word_de, translation_ru: e.translation_ru, answer: ans, masked }
  rollback.exercises.push({ id: e.id, payload: e.payload })
  await db.query('UPDATE exercises SET payload=$1 WHERE id=$2', [JSON.stringify(p), e.id])
  report.exRegen++
}

// Валидация перегенерированного: штатный sanitizeExercise + checkExercise, плюс свои правила
function validate(type, payload, word) {
  const clean = sanitizeExercise({ type, payload })
  if (!clean) return null
  const issues = checkExercise({ id: 0, type, word_id: word?.id ?? 1, payload: clean.payload, target_lang: 'de' })
  if (issues.length) return null
  if (type === 'fill_blank') {
    const p = clean.payload
    if (hasCyr(p.sentence) || (p.options || []).some(hasCyr)) return null
    if ((p.options || []).length < 3) return null
  }
  if (type === 'sentence_write') {
    const p = clean.payload
    if (hasCyr(p.example) || !hasCyr(p.example_ru)) return null
    const stem = stripArticle(word?.word_de).toLowerCase().split(/[\s/]+/).filter(t => t.length > 2)
    if (stem.length && !stem.some(t => String(p.example).toLowerCase().includes(t.slice(0, Math.max(3, t.length - 2))))) return null
  }
  return clean.payload
}

async function regenBatch(items, type, attempt) {
  if (!items.length) return []
  const list = items.map(e => ({ id: e.id, word: e.word_de, translation_ru: e.translation_ru, problem: e.why }))
  const spec = type === 'fill_blank'
    ? `{"id": <id>, "sentence": "простое немецкое предложение A1, где слово заменено на ___", "blank": "слово (та же форма, что дана)", "options": ["<blank>", "дистрактор1", "дистрактор2"]}
Дистракторы — немецкие слова той же части речи, подходящие грамматически, но не по смыслу.`
    : `{"id": <id>, "example": "простое немецкое предложение A1 с этим словом (ровно та форма, что дана)", "example_ru": "точный русский перевод example"}`
  const text = await ask(`Ты составляешь упражнения для курса немецкого A1 (ученики русскоязычные).
Для каждого слова ниже составь НОВОЕ корректное упражнение (старое было с ошибкой — причина указана в problem, не повтори её).
Требования: естественный немецкий, слово в ТОЙ ЖЕ форме, что дано (словоформы типа «packst» не менять); существительные с артиклем и заглавной; перевод точный.
Ответь ТОЛЬКО JSON-массивом объектов вида:
${spec}

Слова:
${JSON.stringify(list)}`, 4000)
  let arr = []
  try { arr = JSON.parse(text) } catch { return items } // весь батч на повтор
  const failed = []
  const byId = new Map(items.map(e => [e.id, e]))
  for (const it of Array.isArray(arr) ? arr : []) {
    const e = byId.get(it.id)
    if (!e) continue
    byId.delete(it.id)
    let payload = null
    if (type === 'fill_blank') payload = validate(type, { sentence: it.sentence, blank: it.blank, options: it.options }, { id: e.word_id, word_de: e.word_de })
    else {
      const example_ru = it.example_ru
      payload = validate(type, {
        example: it.example, example_ru,
        word_de: e.word_de, translation_ru: e.translation_ru,
        hint_ru: `Напиши простое предложение со словом «${e.translation_ru}». Например: ${example_ru}`,
      }, { id: e.word_id, word_de: e.word_de })
    }
    if (payload) {
      rollback.exercises.push({ id: e.id, payload: e.payload })
      await db.query('UPDATE exercises SET payload=$1 WHERE id=$2', [JSON.stringify(payload), e.id])
      report.exRegen++
    } else failed.push(e)
  }
  failed.push(...byId.values()) // модель забыла про id
  if (attempt < 2 && failed.length) return regenBatch(failed, type, attempt + 1)
  return failed
}

for (const type of ['fill_blank', 'sentence_write']) {
  const todo = alive.filter(x => x.type === type && x.word_de && x.translation_ru)
  for (let i = 0; i < todo.length; i += 10) {
    const failed = await regenBatch(todo.slice(i, i + 10), type, 1)
    report.exFailed.push(...failed.map(f => ({ id: f.id, type, word: f.word_de })))
  }
  // сироты без слова — перегенерировать не из чего, сообщаем
  for (const orphan of alive.filter(x => x.type === type && !x.word_de)) {
    report.exFailed.push({ id: orphan.id, type, word: null })
  }
}

// 3c. Переводы исправленных payload на локали (замешиваем поверх, как в enrichLesson)
const changedIds = [...new Set(rollback.exercises.map(r => r.id))]
const { rows: toTranslate } = await db.query(
  `SELECT id, type, payload FROM exercises WHERE id = ANY($1::int[]) AND type IN ('multiple_choice','fill_blank','sentence_write')`,
  [changedIds])
for (let i = 0; i < toTranslate.length; i += 15) {
  try {
    const results = await translateExercisePayloads(toTranslate.slice(i, i + 15), null, platformClient)
    for (const [id, langs] of Object.entries(results)) {
      await db.query(`UPDATE exercises SET payload_translations = COALESCE(payload_translations,'{}'::jsonb) || $1::jsonb WHERE id=$2`,
        [JSON.stringify(langs), parseInt(id)])
    }
  } catch (e) { console.error(`переводы батч ${i}: ${e.message}`) }
}

writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 1))
const cost = usageCostUSD()
console.log(`\nСлов удалено: ${report.wordsDeleted} (с ними упражнений: ${report.exDeletedByWord}), исправлено: ${report.wordsFixed} (синхронизировано копий: ${report.exSynced})`)
console.log(`Упражнений перегенерировано: ${report.exRegen}, переведено на локали: ${toTranslate.length}`)
console.log(`Не удалось починить (${report.exFailed.length}): ${JSON.stringify(report.exFailed.slice(0, 20))}`)
console.log(`Откат: ${ROLLBACK} (скопируй наружу docker cp). Потрачено $${cost.toFixed(3)}, ${((Date.now() - t0) / 60000).toFixed(1)} мин`)
await logOperation({
  kind: 'fix_audited_exercises', provider: 'openai', model: MODEL,
  message: `починка по ИИ-аудиту: слов -${report.wordsDeleted}/~${report.wordsFixed}, упражнений перегенерировано ${report.exRegen}, не починилось ${report.exFailed.length}`,
  items: report.exRegen, durationMs: Date.now() - t0, costUsd: cost,
  meta: report,
})
process.exit(0)
