#!/usr/bin/env node
// Примеры в «Напиши предложение» на РУССКОМ вместо изучаемого языка.
//
// Пример — это образец для ученика: «вот так выглядит правильное предложение».
// Русский пример там бесполезен и сбивает: человек должен написать по-английски,
// а перед глазами «Давайте сделаем перерыв». Остаток старого промпта, где примеры
// внутри инструкции были немецкими, и модель уезжала на язык интерфейса.
//
// Запускать НА СЕРВЕРЕ (нужен ключ OpenAI):
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-russian-examples.mjs
//
// 💸 gpt-4o-mini, батчами по 20 слов — порядка одного цента на всю базу.
import { db } from '../src/db/index.js'
import { resetUsage, usageCostUSD, targetLangName, trackUsage } from '../src/services/claude.js'
import { platformClient } from '../src/services/openaiClient.js'
import { logOperation } from '../src/services/opLog.js'

const CYRILLIC = /[А-Яа-яЁё]/

const { rows } = await db.query(`
  SELECT e.id, e.payload, l.target_lang
    FROM exercises e JOIN lessons l ON l.id = e.lesson_id
   WHERE e.type = 'sentence_write' AND e.payload->>'example' ~ '[А-Яа-яЁё]'
   ORDER BY e.id`)
console.log(`Примеров на русском: ${rows.length}`)
if (!rows.length) process.exit(0)

resetUsage()
let fixed = 0, skipped = 0

// Группируем по языку: у каждого курса свой целевой язык примера.
const byLang = {}
for (const r of rows) (byLang[r.target_lang] ||= []).push(r)

for (const [lang, all] of Object.entries(byLang)) {
  const langName = targetLangName(lang)
  for (let i = 0; i < all.length; i += 20) {
    const items = all.slice(i, i + 20)
    const list = items.map((r, k) => `${k}: ${r.payload.word_de} — ${r.payload.translation_ru || ''}`).join('\n')
    const prompt = `Для каждого слова дай ОДНО простое предложение на ${langName} языке (уровень A1), где это слово употреблено естественно.
Предложение ЦЕЛИКОМ на ${langName} языке — никакого русского.
Верни СТРОГО JSON без markdown: [{"i":0,"example":"..."}]
Слова:
${list}`
    try {
      const res = await platformClient.chat.completions.create({
        model: 'gpt-4o-mini', max_tokens: 2000, messages: [{ role: 'user', content: prompt }],
      })
      trackUsage('gpt-4o-mini', res.usage)
      const txt = res.choices[0].message.content
      const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1))
      for (const it of arr) {
        const r = items[it.i]
        // Проверяем результат: если модель снова прислала русский — не подменяем.
        if (!r || !it.example || CYRILLIC.test(it.example)) { skipped++; continue }
        await db.query(
          `UPDATE exercises SET payload = jsonb_set(payload, '{example}', to_jsonb($1::text)) WHERE id = $2`,
          [it.example, r.id])
        fixed++
      }
    } catch (e) {
      console.error(`  батч ${lang} ${i}: ${e.message}`)
    }
  }
  console.log(`  ${langName}: обработано ${all.length}`)
}

const cost = usageCostUSD()
console.log(`Исправлено: ${fixed}, пропущено: ${skipped}, цена: $${cost.toFixed(4)}`)
await logOperation({
  kind: 'exercises', provider: 'openai', model: 'gpt-4o-mini',
  items: fixed, costUsd: cost, message: 'примеры на языке курса вместо русских',
})
process.exit(0)
