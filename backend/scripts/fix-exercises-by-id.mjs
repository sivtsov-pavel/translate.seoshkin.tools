#!/usr/bin/env node
// Точечная перегенерация НАЗВАННЫХ упражнений — по списку id.
//
// Зачем отдельно от regen-safe.mjs: тот перегенерирует урок целиком. Когда
// аудит нашёл три битых упражнения в наборе на сто с лишним слов, переписывать
// весь набор — это и деньги, и риск испортить исправное ради трёх штук.
//
// Что делает: берёт упражнения по id, просит gpt-4o-mini собрать НОВОЕ
// (со старой причиной брака в промпте, чтобы не повторил), прогоняет результат
// через штатные фильтры sanitizeExercise + checkExercise — те же, что у обычной
// генерации, — и записывает ТОЛЬКО прошедшее проверку. Не прошло с трёх попыток
// — оставляет как было и честно говорит об этом.
//
// Переводы payload на локали дописываются тем же translateExercisePayloads,
// иначе новое упражнение будет на девяти интерфейсах немым.
//
// 💸 Тратит OpenAI (gpt-4o-mini): порядка $0.001 на упражнение.
//    Без --apply печатает план и не тратит ничего. Откат пишется перед записью.
//
//   node scripts/fix-exercises-by-id.mjs --ids=191469,191654
//   node scripts/fix-exercises-by-id.mjs --ids=191469,191654 --apply
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage, resetUsage, usageCostUSD, sanitizeExercise, translateExercisePayloads } from '../src/services/claude.js'
import { checkExercise } from '../src/services/lessonAudit.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const MODEL = 'gpt-4o-mini'
const IDS = (process.argv.find(a => a.startsWith('--ids='))?.split('=')[1] || '')
  .split(',').map(Number).filter(Boolean)
const ROLLBACK = `/tmp/fix-exercises-rollback-${Date.now()}.json`
const MAX_TRIES = 3

if (!IDS.length) { console.error('Укажи упражнения: --ids=191469,191654'); process.exit(1) }

const ask = async (prompt, max_tokens = 2000) => {
  const res = await platformClient.chat.completions.create({
    model: MODEL, max_tokens, messages: [{ role: 'user', content: prompt }],
  })
  trackUsage(MODEL, res.usage || {})
  return (res.choices[0].message.content || '').replace(/^```(json)?|```$/gm, '').trim()
}
const hasCyr = (s) => /[Ѐ-ӿ]/.test(String(s || ''))

const { rows: exRows } = await db.query(
  `SELECT e.id, e.type, e.lesson_id, e.word_id, e.payload, l.target_lang,
          w.word_de, w.translation_ru
   FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   LEFT JOIN words w ON w.id = e.word_id
   WHERE e.id = ANY($1::int[]) ORDER BY e.id`, [IDS])

const missing = IDS.filter(id => !exRows.some(r => r.id === id))
if (missing.length) console.log(`⚠️ не найдены: ${missing.join(', ')}`)

console.log(`\nУпражнений к починке: ${exRows.length}`)
for (const e of exRows) {
  const issues = checkExercise({ id: e.id, type: e.type, word_id: e.word_id, payload: e.payload, target_lang: e.target_lang })
  // Поле называется text (см. lessonAudit.js). Промахнуться легко, и тогда в
  // промпт уезжает «[object Object]» вместо причины брака — модель повторит ту же
  // ошибку, а по логу это не видно.
  e.why = issues.map(i => i.text || String(i)).join('; ') || 'помечено вручную'
  e.blockers = issues.filter(i => i.level === 'blocker').length
  console.log(`  #${e.id} урок ${e.lesson_id} · ${e.type} · «${e.word_de}»`)
  console.log(`     было: ${JSON.stringify(e.payload).slice(0, 120)}`)
  console.log(`     брак: ${e.why}${e.blockers ? ` (блокеров: ${e.blockers})` : ''}`)
}
console.log(`\nСмета: ~$${(exRows.length * 0.001).toFixed(3)} (gpt-4o-mini, до ${MAX_TRIES} попыток на каждое)`)

if (!exRows.length) process.exit(0)
if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/fix-exercises-by-id.mjs --ids=${IDS.join(',')} --apply`)
  process.exit(0)
}

// Проверка ровно та же, что у штатной генерации: чужих правил не выдумываем
function validate(type, payload, word, targetLang) {
  const clean = sanitizeExercise({ type, payload })
  if (!clean) return null
  if (checkExercise({ id: 0, type, word_id: 1, payload: clean.payload, target_lang: targetLang }).length) return null
  const p = clean.payload
  if (type === 'fill_blank') {
    if (hasCyr(p.sentence) || (p.options || []).some(hasCyr)) return null
    if ((p.options || []).length < 3) return null
    // Все варианты обязаны быть формами ОДНОГО слова — проверяем общим началом.
    // Это механический способ не пустить в базу упражнение с двумя правильными
    // ответами: разные слова («rauchst» против «spielst») общего начала не имеют,
    // а формы одного («liebe/lieben/liebt», «ein/einen/einem») имеют.
    const stem = (x) => String(x || '').toLowerCase().replace(/^(der|die|das)\s+/, '').trim().split(/\s+/)[0]
    const base = stem(p.blank)
    const need = Math.min(3, base.length)
    if (!base) return null
    if (!(p.options || []).every(o => stem(o).slice(0, need) === base.slice(0, need))) return null
  }
  if (type === 'sentence_write') {
    if (hasCyr(p.example) || !hasCyr(p.example_ru)) return null
  }
  return clean.payload
}

const SPEC = {
  fill_blank: `{"id": <id>, "sentence": "простое предложение A1, где изучаемое слово заменено на ___", "blank": "слово в ТОЙ форме, которая грамматически верна в этом предложении", "options": ["<blank>", "другая форма того же слова", "ещё одна форма того же слова"]}

ГЛАВНОЕ ПРАВИЛО: правильный ответ должен быть РОВНО ОДИН.
Поэтому дистракторы — это ДРУГИЕ ФОРМЫ ТОГО ЖЕ САМОГО слова (спряжение, падеж,
число, артикль), которые в этом предложении грамматически НЕВЕРНЫ.
Пример: «Ich ___ die Schokolade.» → blank «liebe», options ["liebe","lieben","liebt"].
Пример: «Ich sehe ___ Mann.» → blank «einen», options ["einen","ein","einem"].

ЗАПРЕЩЕНО брать в дистракторы ДРУГИЕ слова, даже той же части речи: в простом
предложении они почти всегда тоже подходят, и получается два правильных ответа.
Так «Warum ___ du das?» с вариантами rauchst/spielst/isst — брак: верны все три.

Проверь себя: подставь каждый дистрактор в предложение. Если получается
правильный немецкий — замени дистрактор.`,
  sentence_write: `{"id": <id>, "example": "простое предложение A1 с этим словом", "example_ru": "точный русский перевод example"}`,
}

resetUsage()
const rollback = exRows.map(e => ({ id: e.id, type: e.type, payload: e.payload }))
writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2))
console.log(`\nОткат записан: ${ROLLBACK}`)

const fixed = [], failed = []
for (const type of ['fill_blank', 'sentence_write']) {
  let pending = exRows.filter(e => e.type === type)
  for (let attempt = 1; attempt <= MAX_TRIES && pending.length; attempt++) {
    const list = pending.map(e => ({ id: e.id, word: e.word_de, translation_ru: e.translation_ru, problem: e.why }))
    let arr = []
    try {
      arr = JSON.parse(await ask(`Ты составляешь упражнения для курса немецкого A1 (ученики русскоязычные).
Для каждого слова ниже составь НОВОЕ корректное упражнение. Старое было с ошибкой — причина в поле problem, не повтори её.
Требования: естественный немецкий; слово в форме, которая грамматически верна в предложении; существительные с артиклем и заглавной буквы.
Ответь ТОЛЬКО JSON-массивом объектов вида:
${SPEC[type]}

Слова:
${JSON.stringify(list)}`))
    } catch { console.log(`  попытка ${attempt}: ответ не разобрался, повтор`); continue }

    const still = []
    const byId = new Map(pending.map(e => [e.id, e]))
    for (const it of Array.isArray(arr) ? arr : []) {
      const e = byId.get(it.id)
      if (!e) continue
      byId.delete(it.id)
      const payload = type === 'fill_blank'
        ? validate(type, { sentence: it.sentence, blank: it.blank, options: it.options }, e, e.target_lang)
        : validate(type, { example: it.example, example_ru: it.example_ru, word_de: e.word_de,
            translation_ru: e.translation_ru,
            hint_ru: `Напиши простое предложение со словом «${e.translation_ru}». Например: ${it.example_ru}` }, e, e.target_lang)
      if (!payload) { still.push(e); continue }
      await db.query('UPDATE exercises SET payload = $1, payload_translations = NULL WHERE id = $2',
        [JSON.stringify(payload), e.id])
      fixed.push({ ...e, payload })
      console.log(`  ✓ #${e.id}: ${JSON.stringify(payload).slice(0, 110)}`)
    }
    pending = [...still, ...byId.values()]
    if (pending.length) console.log(`  попытка ${attempt}: осталось ${pending.length}`)
  }
  failed.push(...pending)
}

// Новый payload на локали — иначе упражнение немое на девяти интерфейсах из десяти
if (fixed.length) {
  try {
    // Функция ВОЗВРАЩАЕТ переводы, записывает их вызывающий (так же во всех
    // остальных скриптах) — забыть про запись значит тихо ничего не перевести.
    let n = 0
    for (let i = 0; i < fixed.length; i += 15) {
      const results = await translateExercisePayloads(
        fixed.slice(i, i + 15).map(e => ({ id: e.id, type: e.type, payload: e.payload })))
      for (const [id, langs] of Object.entries(results || {})) {
        await db.query(
          `UPDATE exercises SET payload_translations = COALESCE(payload_translations,'{}'::jsonb) || $1::jsonb
           WHERE id = $2`, [JSON.stringify(langs), parseInt(id)])
        n++
      }
    }
    console.log(`  ✓ переводы payload на локали: ${n} из ${fixed.length}`)
  } catch (e) { console.error(`  ✖ переводы payload: ${e.message} — добить translate-* скриптом`) }
}

for (const e of failed) console.log(`  ✖ #${e.id} «${e.word_de}»: за ${MAX_TRIES} попыток годного не вышло, оставлено как было`)

await logOperation({
  kind: 'cleanup', status: failed.length ? 'partial' : 'ok', provider: 'openai', model: MODEL,
  costUsd: usageCostUSD(), items: fixed.length,
  message: `Точечная починка упражнений: ${fixed.length} из ${exRows.length}`,
}).catch(() => {})
console.log(`\nГотово: починено ${fixed.length} из ${exRows.length}. Потрачено: $${usageCostUSD().toFixed(4)}`)
process.exit(0)
