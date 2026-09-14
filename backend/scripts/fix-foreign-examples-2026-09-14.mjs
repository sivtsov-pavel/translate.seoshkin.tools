#!/usr/bin/env node
// Словарные примеры НЕ НА ЯЗЫКЕ КУРСА: в английском и испанском курсах примеры немецкие.
//
// Нашлось сплошным аудитом 14.09.2026: у 948 слов английского курса и 314 испанского
// пример в словаре написан по-немецки — «ear» с примером «Ich höre mit meinem Ohr».
// Этот пример ученик видит во флеш-карте строкой «в предложении» и в «Словаре».
// Причина та же, что чинили 28.07 в генераторе: примеры внутри промпта были немецкими,
// и модель уезжала на их язык. Генератор починен, накопленное лечит этот скрипт.
//
// ОТБОР ДЕТЕРМИНИРОВАННЫЙ, не «на глаз модели»: берём слово, только если
//   (а) в примере есть ä/ö/ü/ß — в английском и испанском их не бывает; или
//   (б) встретились два и более немецких служебных слова (der/das/ist/und/…); или
//   (в) изучаемого слова в примере нет вовсе — такой пример бесполезен независимо от языка.
//
// ОТВЕТ МОДЕЛИ ТОЖЕ ПРОВЕРЯЕТСЯ, и это не формальность: дешёвая модель уже трижды
// подсовывала нам брак (см. OPERATIONS). Записываем, только если в примере есть само
// слово, нет кириллицы и нет немецких маркеров, а перевод — кириллицей.
//
// 💸 gpt-4o-mini, батчами по 20. Смета печатается ДО запуска: сперва пробный прогон.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-foreign-examples-2026-09-14.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-foreign-examples-2026-09-14.mjs --apply
import { db } from '../src/db/index.js'
import { resetUsage, usageCostUSD, targetLangName, trackUsage } from '../src/services/claude.js'
import { platformClient } from '../src/services/openaiClient.js'
import { logOperation } from '../src/services/opLog.js'

const apply = process.argv.includes('--apply')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 0

const CYRILLIC = /[А-Яа-яЁё]/
const UMLAUT = /[äöüßÄÖÜ]/
const DE_STOP = /\b(der|die|das|dem|den|ist|sind|und|nicht|ich|ein|eine|mit|auf|für|sehr|habe|hat)\b/gi

// Корень слова без артикля и служебных хвостов — по нему ищем слово в примере.
function bare(word) {
  return String(word || '')
    .replace(/^(der|die|das|el|la|los|las|the|a|an)\s+/i, '')
    .trim()
}

// Слово «есть в примере», если совпал его корень без двух последних букв: так проходят
// «geht» для «gehen», «books» для «book» — морфологии мы не знаем и знать не обязаны.
//
// Словарная статья бывает ФРАЗОЙ: «to put away», «I'd like ...», «What kind of...?».
// Искать в примере корень всей фразы бессмысленно — проверяем по самому длинному
// значимому слову. Без этого 21 верный пример был отвергнут собственной проверкой.
function mentions(text, word) {
  const b = bare(word).toLowerCase().replace(/[.…?!,]+/g, ' ').trim()
  if (!b) return false
  const parts = b.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'you'].includes(w))
  const key = parts.length ? parts.sort((a, c) => c.length - a.length)[0] : b
  const stem = key.slice(0, Math.max(key.length - 2, 3))
  return String(text || '').toLowerCase().includes(stem)
}

function looksGerman(text) {
  if (UMLAUT.test(text)) return true
  const hits = String(text || '').match(DE_STOP)
  return !!hits && hits.length >= 2
}

const { rows } = await db.query(`
  SELECT w.id, w.word_de, w.translation_ru, w.example_sentence, w.example_sentence_ru,
         l.target_lang, l.id AS lesson_id
    FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang <> 'de'
     AND w.example_sentence IS NOT NULL AND trim(w.example_sentence) <> ''
   ORDER BY w.id`)

const broken = rows.filter(r =>
  looksGerman(r.example_sentence) || !mentions(r.example_sentence, r.word_de))

const work = LIMIT ? broken.slice(0, LIMIT) : broken

console.log(`Слов с примером в курсах не-de: ${rows.length}`)
console.log(`Подлежит перегенерации: ${broken.length}${LIMIT ? ` (взято ${work.length})` : ''}`)
const batches = Math.ceil(work.length / 20)
console.log(`Батчей по 20: ${batches}, модель gpt-4o-mini, оценка ≈ $${(batches * 0.0007).toFixed(3)}`)

if (!work.length) process.exit(0)
if (!apply) {
  console.log('\nПримеры кандидатов:')
  for (const r of work.slice(0, 8)) {
    console.log(`  #${r.id} [${r.target_lang}] «${r.word_de}» → «${r.example_sentence}»`)
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
  for (let i = 0; i < all.length; i += 20) {
    const items = all.slice(i, i + 20)
    const list = items.map((r, k) => `${k}: ${r.word_de} — ${r.translation_ru || ''}`).join('\n')
    const prompt = `Для каждого слова дай ОДНО простое предложение уровня A1 на ${langName} языке, где это слово употреблено естественно, и его перевод на русский.
Требования:
- предложение ЦЕЛИКОМ на ${langName} языке, ни одного немецкого или русского слова;
- само слово обязано присутствовать в предложении;
- перевод — на русском языке.
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
        // Вердикт модели — заявка, а не приговор: проверяем фактами.
        if (CYRILLIC.test(it.example) || looksGerman(it.example)
            || !mentions(it.example, r.word_de) || !CYRILLIC.test(it.ru)) {
          skipped++
          console.log(`  ✗ #${r.id} «${r.word_de}»: «${it.example}» — не прошло проверку`)
          continue
        }
        rollback.push({ id: r.id, example: r.example_sentence, ru: r.example_sentence_ru })
        await db.query(
          `UPDATE words SET example_sentence = $2, example_sentence_ru = $3 WHERE id = $1`,
          [r.id, it.example, it.ru])
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
  kind: 'words', provider: 'openai', model: 'gpt-4o-mini',
  items: fixed, costUsd: cost, message: 'словарные примеры на языке курса вместо немецких',
})
console.log('\n--- ОТКАТ ---')
console.log(JSON.stringify(rollback))
process.exit(0)
