#!/usr/bin/env node
// Второй эшелон: перепроверка находок ИИ-аудита.
//
// Зачем: первый проход придирается. Из 928 претензий августа реальными оказались 428 —
// модель считает ошибкой живые фразы («Guten Morgen» в приветствии, «Ich liebe Deutsch»).
// Автоматически чинить по такому списку значит портить нормальный материал.
//
// Как: каждую находку проверяет отдельный запрос с установкой ОПРАВДАТЕЛЬНОЙ —
// «считай упражнение нормальным, отвергай только явную ошибку». Выживает лишь то,
// что подтвердилось.
//
// 💸 Тратит OpenAI (gpt-4o-mini) батчами по 15: ориентир $0.10–0.20 на 800 находок.
//    Без --run печатает смету. НИЧЕГО не меняет — только пишет отчёт.
//
//   node scripts/verify-audit-findings.mjs --file=/tmp/ai-audit-2026-08-13.json
//   node scripts/verify-audit-findings.mjs --file=… --run
import { readFileSync, writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage, resetUsage, usageCostUSD } from '../src/services/claude.js'

const RUN = process.argv.includes('--run')
const FILE = process.argv.find(a => a.startsWith('--file='))?.split('=')[1] || '/tmp/ai-audit.json'
const BATCH = 15
const MODEL = 'gpt-4o-mini'

const report = JSON.parse(readFileSync(FILE, 'utf8'))
const findings = report.findings || report
console.log(`\nНаходок на перепроверку: ${findings.length}`)
console.log(`Батчей по ${BATCH}: ${Math.ceil(findings.length / BATCH)}, ориентир $${(findings.length * 0.00018).toFixed(2)}\n`)

if (!RUN) {
  console.log('Это смета. Запуск: --run')
  process.exit(0)
}

const { rows } = await db.query(
  `SELECT e.id, e.type, e.payload, w.word_de, w.translation_ru
   FROM exercises e LEFT JOIN words w ON w.id = e.word_id
   WHERE e.id = ANY($1::int[])`, [findings.map(f => f.id)])
const byId = new Map(rows.map(r => [r.id, r]))

const ask = async (prompt) => {
  const res = await platformClient.chat.completions.create({
    model: MODEL, max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  trackUsage(MODEL, res.usage || {})
  return res.choices[0].message.content || '{}'
}

resetUsage()
const confirmed = []
let checked = 0

for (let i = 0; i < findings.length; i += BATCH) {
  const batch = findings.slice(i, i + BATCH).filter(f => byId.has(f.id))
  if (!batch.length) continue

  const list = batch.map((f, j) => {
    const r = byId.get(f.id)
    const p = r.payload || {}
    const text = p.sentence || p.example || p.masked || p.question || ''
    const answer = p.blank || p.answer || p.word_de || ''
    return `${j + 1}. слово: ${r.word_de || '—'} (${r.translation_ru || '—'})
   упражнение (${r.type}): ${text}
   ответ: ${answer}
   претензия проверяющего: ${f.problem}`
  }).join('\n\n')

  const prompt = `Ты вычитываешь учебный материал по немецкому. Другой проверяющий пожаловался
на упражнения ниже. Он часто придирается к НОРМАЛЬНЫМ фразам, поэтому твоя задача — оправдать
упражнение, если оно приемлемо для ученика уровня A1.

Считай упражнение ХОРОШИМ (real=false), если:
- фраза грамматична и звучит по-немецки, пусть и просто;
- ответ подходит в пропуск по смыслу и грамматике;
- претензия сводится к стилю, синониму или «лучше сказать иначе».

Считай ошибкой (real=true), только если:
- фраза грамматически неверна;
- ответ не подходит в пропуск (получается бессмыслица);
- пример не про это слово или противоречит его значению;
- в задании фактическая ошибка (например, неверный результат сложения).

${list}

Верни СТРОГО JSON: {"1":{"real":true|false,"why":"кратко"}, ...} для номеров 1..${batch.length}`

  try {
    const map = JSON.parse((await ask(prompt)).replace(/^```(json)?|```$/gm, '').trim())
    batch.forEach((f, j) => {
      const v = map[String(j + 1)]
      checked++
      if (v?.real) confirmed.push({ ...f, why: v.why || '' })
    })
  } catch (e) {
    console.error(`  ✗ батч ${Math.floor(i / BATCH) + 1}: ${e.message}`)
  }
  if ((i / BATCH) % 10 === 9) {
    console.log(`… ${Math.min(i + BATCH, findings.length)}/${findings.length}, подтверждено ${confirmed.length}, $${usageCostUSD().toFixed(3)}`)
  }
}

const cost = usageCostUSD()
const out = FILE.replace(/\.json$/, '-verified.json')
writeFileSync(out, JSON.stringify({ checked, confirmed, cost }, null, 1))

console.log(`\nПроверено: ${checked} из ${findings.length}`)
console.log(`Подтверждено реальных: ${confirmed.length} (${Math.round(confirmed.length / checked * 100)}%)`)
console.log(`Отвергнуто как придирки: ${checked - confirmed.length}`)
console.log(`Потрачено: $${cost.toFixed(4)}`)
console.log(`Отчёт: ${out}`)
process.exit(0)
