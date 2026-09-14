#!/usr/bin/env node
// «Напиши предложение»: эталон, не отвечающий заданию.
//
// С 14.09.2026 это упражнение — СБОРКА фразы из слов эталона, и расхождение пары стало
// видно ученику сразу: задание говорит «Я люблю себя», а собрать предлагают «Können Sie
// das für mich übersetzen?». Раньше эталон показывался только после ответа, и пара
// расходилась молча.
//
// Два детерминированных признака брака:
//   (а) изучаемого слова нет в эталоне — собранная фраза не про то слово, ради которого
//       упражнение вообще существует;
//   (б) один и тот же эталон стоит у НЕСКОЛЬКИХ упражнений урока — значит минимум у всех,
//       кроме одного, задание чужое (генератор второго прохода повторял пример).
//
// Для (б) переписываем ВСЕ упражнения группы, кроме того, чьё слово в эталоне есть:
// у него пара как раз сходится.
//
// Ответ модели проверяется фактами: слово в эталоне есть, эталон на языке курса,
// перевод — кириллицей. Не прошло — не пишем (вердикт дешёвой модели не приговор).
//
// 💸 gpt-4o-mini, батчами по 20. Сперва пробный прогон со сметой.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-sentence-pairs-2026-09-14.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-sentence-pairs-2026-09-14.mjs --apply
import { db } from '../src/db/index.js'
import { resetUsage, usageCostUSD, targetLangName, trackUsage } from '../src/services/claude.js'
import { platformClient } from '../src/services/openaiClient.js'
import { logOperation } from '../src/services/opLog.js'

const apply = process.argv.includes('--apply')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 0

const CYRILLIC = /[А-Яа-яЁё]/
const LANG_RE = {
  de: /[äöüßÄÖÜ]|\b(der|die|das|ist|sind|und|nicht|ich|ein|eine)\b/i,
  en: /\b(the|is|are|and|not|I|a|an|my|you)\b/i,
  es: /[ñáéíóú¿¡]|\b(el|la|los|las|es|son|y|no|un|una|mi)\b/i,
}

const bare = (w) => String(w || '').replace(/^(der|die|das|el|la|los|las|the|a|an)\s+/i, '').trim()

function mentions(text, word) {
  const b = bare(word).toLowerCase()
  if (!b) return false
  const stem = b.slice(0, Math.max(b.length - 2, 3))
  return String(text || '').toLowerCase().includes(stem)
}

const { rows } = await db.query(`
  SELECT e.id, e.lesson_id, l.target_lang,
         e.payload->>'word_de'    AS word,
         e.payload->>'example'    AS example,
         e.payload->>'example_ru' AS example_ru
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   WHERE e.type = 'sentence_write'
     AND e.payload->>'example' IS NOT NULL
     AND e.payload->>'example_ru' IS NOT NULL
   ORDER BY e.lesson_id, e.id`)

// (а) слова нет в эталоне
const noWord = rows.filter(r => !mentions(r.example, r.word))

// (б) общий эталон внутри урока: оставляем в покое то упражнение, чьё слово в нём есть
const groups = {}
for (const r of rows) (groups[`${r.lesson_id}|${r.example}`] ||= []).push(r)
const shared = []
for (const list of Object.values(groups)) {
  if (list.length < 2) continue
  const keeper = list.find(r => mentions(r.example, r.word))
  for (const r of list) if (r !== keeper) shared.push(r)
}

const seen = new Set()
const broken = [...noWord, ...shared].filter(r => !seen.has(r.id) && seen.add(r.id))
const work = LIMIT ? broken.slice(0, LIMIT) : broken

console.log(`Упражнений «напиши предложение»: ${rows.length}`)
console.log(`Слова нет в эталоне: ${noWord.length}; общий эталон в уроке: ${shared.length}`)
console.log(`К перегенерации (без повторов): ${broken.length}${LIMIT ? ` (взято ${work.length})` : ''}`)
const batches = Math.ceil(work.length / 20)
console.log(`Батчей по 20: ${batches}, gpt-4o-mini, оценка ≈ $${(batches * 0.0007).toFixed(3)}`)

if (!work.length) process.exit(0)
if (!apply) {
  console.log('\nПримеры кандидатов:')
  for (const r of work.slice(0, 8)) {
    console.log(`  #${r.id} [${r.target_lang}] «${r.word}»: «${r.example}» ↔ «${r.example_ru}»`)
  }
  console.log('\nЭто пробный прогон. Записать: --apply')
  process.exit(0)
}

resetUsage()
let fixed = 0, skipped = 0
const rollback = []

const byLang = {}
for (const r of work) (byLang[r.target_lang] ||= []).push(r)

for (const [lang, all] of Object.entries(byLang)) {
  const langName = targetLangName(lang)
  const re = LANG_RE[lang]
  for (let i = 0; i < all.length; i += 20) {
    const items = all.slice(i, i + 20)
    const list = items.map((r, k) => `${k}: ${r.word}`).join('\n')
    const prompt = `Для каждого слова дай ОДНО простое предложение уровня A1 на ${langName} языке с этим словом и точный перевод предложения на русский.
Требования:
- предложение из 4–8 слов, целиком на ${langName} языке;
- само слово обязано присутствовать в предложении;
- перевод должен соответствовать предложению слово в слово по смыслу (по нему ученик будет собирать фразу).
Верни СТРОГО JSON без markdown: [{"i":0,"example":"...","ru":"..."}]
Слова:
${list}`
    try {
      const res = await platformClient.chat.completions.create({
        model: 'gpt-4o-mini', max_tokens: 2500, messages: [{ role: 'user', content: prompt }],
      })
      trackUsage('gpt-4o-mini', res.usage)
      const txt = res.choices[0].message.content
      const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1))
      for (const it of arr) {
        const r = items[it.i]
        if (!r || !it.example || !it.ru) { skipped++; continue }
        const words = String(it.example).trim().split(/\s+/).length
        if (CYRILLIC.test(it.example) || !mentions(it.example, r.word)
            || !CYRILLIC.test(it.ru) || (re && !re.test(it.example))
            || words < 3 || words > 12) {
          skipped++
          console.log(`  ✗ #${r.id} «${r.word}»: «${it.example}» — не прошло проверку`)
          continue
        }
        rollback.push({ id: r.id, example: r.example, example_ru: r.example_ru })
        await db.query(
          `UPDATE exercises SET payload = payload || $2::jsonb WHERE id = $1`,
          [r.id, JSON.stringify({ example: it.example, example_ru: it.ru })])
        fixed++
      }
    } catch (e) {
      console.error(`  батч ${lang} ${i}: ${e.message}`)
    }
  }
  console.log(`  ${langName}: обработано ${all.length}`)
}

const cost = usageCostUSD()
console.log(`\nПереписано: ${fixed}, отклонено проверкой: ${skipped}, цена: $${cost.toFixed(4)}`)
await logOperation({
  kind: 'exercises', provider: 'openai', model: 'gpt-4o-mini',
  items: fixed, costUsd: cost, message: 'пары «эталон ↔ задание» в «напиши предложение»',
})
console.log('\n--- ОТКАТ ---')
console.log(JSON.stringify(rollback))
process.exit(0)
