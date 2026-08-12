#!/usr/bin/env node
// Названия наборов фраз на 10 локалей: в русском интерфейсе «Begrüßungen» ничего
// не говорит, нужно «Приветствия».
//
// Само название на целевом языке остаётся (по нему учатся), переводы кладём в
// title_i18n — интерфейс показывает их подписью.
//
// 💸 Тратит OpenAI (gpt-4o-mini): один вызов на набор, ориентир $0.01 на 27 наборов.
//    Без --apply печатает только предложенные переводы.
//
//   node scripts/translate-topic-titles.mjs           # показать
//   node scripts/translate-topic-titles.mjs --apply   # записать
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage, resetUsage, usageCostUSD } from '../src/services/claude.js'

const APPLY = process.argv.includes('--apply')
const MODEL = 'gpt-4o-mini'
const LANGS = { ru: 'русский', uk: 'українська', en: 'English', de: 'Deutsch', bg: 'български',
                tr: 'Türkçe', ar: 'العربية', es: 'español', fr: 'français', sq: 'shqip' }

const { rows: topics } = await db.query(
  `SELECT id, title, lang, title_i18n FROM phrase_topics ORDER BY id`)

const pending = topics.filter(t => !t.title_i18n?.ru)
console.log(`\nНаборов: ${topics.length}, без переводов названия: ${pending.length}`)
console.log(`Ориентир цены: $${(pending.length * 0.0004).toFixed(3)}\n`)

if (!pending.length) { console.log('Делать нечего.'); process.exit(0) }

resetUsage()
let done = 0
for (const t of pending) {
  const prompt = `Переведи название темы «${t.title}» (язык оригинала: ${t.lang}) на все языки: ${Object.entries(LANGS).map(([c, n]) => `"${c}" (${n})`).join(', ')}.
Это тема набора бытовых фраз — перевод короткий, 1–2 слова, как название раздела.
Верни СТРОГО JSON вида {"ru":"…","uk":"…","en":"…","de":"…","bg":"…","tr":"…","ar":"…","es":"…","fr":"…","sq":"…"}`

  try {
    const res = await platformClient.chat.completions.create({
      model: MODEL, max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    trackUsage(MODEL, res.usage || {})
    const map = JSON.parse((res.choices[0].message.content || '{}').replace(/^```(json)?|```$/gm, '').trim())
    if (!map.ru) { console.log(`  ✗ ${t.title}: пустой ответ`); continue }
    console.log(`  ✓ ${t.title} → ${map.ru} / ${map.en}`)
    if (APPLY) {
      await db.query(
        `UPDATE phrase_topics SET title_i18n = COALESCE(title_i18n, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify(map), t.id])
      done++
    }
  } catch (e) {
    console.error(`  ✗ ${t.title}: ${e.message}`)
  }
}

const cost = usageCostUSD()
console.log(APPLY
  ? `\nГотово: переведено ${done}. Потрачено: $${cost.toFixed(4)}`
  : `\nЭто только предложения. Потрачено на разбор: $${cost.toFixed(4)}\n  node scripts/translate-topic-titles.mjs --apply`)
process.exit(0)
