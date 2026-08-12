#!/usr/bin/env node
// Осмысленные названия наборам фраз: «Beim Arzt», «Im Café», «Gesundheit» вместо
// восьми одинаковых «Alltag».
//
// Первая генерация просила «короткое название темы», и модель раз за разом отвечала
// самым общим словом. Промпт в phrases.js уже исправлен, здесь чиним накопленное.
//
// 💸 Тратит OpenAI (gpt-4o-mini): один вызов на набор, ориентир $0.02 на 27 наборов.
//    Без --apply печатает только предложенные названия.
//
//   node scripts/rename-phrase-topics.mjs           # показать, что предлагается
//   node scripts/rename-phrase-topics.mjs --apply   # переименовать
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage, resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const MODEL = 'gpt-4o-mini'

// Слова, ради которых всё и затевалось: по ним о наборе ничего не понятно
const GENERIC = /^(alltag|alltagssprache|deutsch lernen|allgemein|wörter|sätze|lektion|thema|daily life|everyday)/i

const { rows: topics } = await db.query(`
  SELECT t.id, t.title, t.lang, l.lesson_number,
         (SELECT string_agg(p.text, ' | ' ORDER BY p.position) FROM phrases p WHERE p.topic_id = t.id) AS phrases
  FROM phrase_topics t
  LEFT JOIN lessons l ON l.id = t.lesson_id
  WHERE EXISTS (SELECT 1 FROM phrases p WHERE p.topic_id = t.id)
  ORDER BY l.lesson_number NULLS LAST, t.id`)

console.log(`\nНаборов всего: ${topics.length}. Ориентир цены: $${(topics.length * 0.0008).toFixed(3)}\n`)

const ask = async (prompt) => {
  const res = await platformClient.chat.completions.create({
    model: MODEL, max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  trackUsage(MODEL, res.usage || {})
  return res.choices[0].message.content || ''
}

resetUsage()
let renamed = 0, kept = 0
for (const t of topics) {
  const langName = { de: 'Deutsch', en: 'English', es: 'español' }[t.lang] || 'Deutsch'
  const prompt = `Вот набор бытовых фраз на языке ${langName}:

${t.phrases}

Придумай КОНКРЕТНОЕ название темы на ${langName} — одно-два слова, по содержанию фраз.
Хорошо: «Beim Arzt», «Im Café», «Einkaufen», «Gesundheit», «Wohnung», «Familie».
Плохо: «Alltag», «Alltagssprache», «Deutsch lernen», «Sätze» — по ним ничего не понять.
Подбери эмодзи темы.

Верни СТРОГО JSON: {"title":"…","emoji":"…"}`

  try {
    const { title, emoji } = JSON.parse((await ask(prompt)).replace(/^```(json)?|```$/gm, '').trim())
    const clean = String(title || '').trim()
    if (!clean || GENERIC.test(clean)) {
      kept++
      console.log(`  · урок ${t.lesson_number ?? '—'}: «${t.title}» → предложено «${clean}», слишком общее, оставляем`)
      continue
    }
    console.log(`  ✓ урок ${t.lesson_number ?? '—'}: «${t.title}» → ${emoji || ''} «${clean}»`)
    if (APPLY) {
      const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `topic-${t.id}`
      await db.query('UPDATE phrase_topics SET title = $1, emoji = COALESCE($2, emoji), slug = $3 WHERE id = $4',
        [clean, emoji || null, slug, t.id])
      renamed++
    }
  } catch (e) {
    kept++
    console.error(`  ✗ набор ${t.id}: ${e.message}`)
  }
}

const cost = usageCostUSD()
if (APPLY) {
  await logOperation({ kind: 'phrases', status: 'ok', costUsd: cost,
    message: `переименовано наборов: ${renamed}` }).catch(() => {})
}
console.log(APPLY
  ? `\nГотово: переименовано ${renamed}, оставлено ${kept}. Потрачено: $${cost.toFixed(4)}`
  : `\nЭто только предложения — ничего не изменено. Потрачено на разбор: $${cost.toFixed(4)}\n  node scripts/rename-phrase-topics.mjs --apply`)
process.exit(0)
