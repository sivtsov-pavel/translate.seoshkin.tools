#!/usr/bin/env node
// ИИ-аудит адекватности материала: «Заполни пропуск», «Напиши предложение», «Добавь букву».
//
// Зачем: механический аудит (audit-exercises.mjs) ловит непроходимые упражнения, но не
// «бредовые предложения» — грамматически кривые, бессмысленные или не связанные со словом.
// Ученики на такое жалуются (август 2026): часть уроков грузилась без вычитки разбора.
//
// Ничего НЕ МЕНЯЕТ: только читает базу и печатает отчёт. Правки — отдельным решением.
//
// 💸 ТРАТИТ OPENAI-БАЛАНС: gpt-4o-mini батчами по 25. Без --run печатает смету и выходит.
//    Оценка на немецкий курс (~7500 упражнений): ~300 вызовов, ≈$0.5–1.
//    Запуск одобрен Павлом 07.08.2026.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/ai-audit-sentences.mjs --lang de          # смета
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/ai-audit-sentences.mjs --lang de --run   # аудит
//   … добавить --limit 50 — пробный прогон на 50 упражнениях
//
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { trackUsage, resetUsage, usageCostUSD, targetLangName } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const args = process.argv.slice(2)
const argOf = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const lang = argOf('--lang', 'de')
const limit = parseInt(argOf('--limit', '0')) || 0
const run = args.includes('--run')
const BATCH = 25
const MODEL = 'gpt-4o-mini'

// ── Материал ──────────────────────────────────────────────────────────────────
const { rows } = await db.query(`
  SELECT e.id, e.type, e.payload, w.word_de, w.translation_ru
  FROM exercises e
  JOIN lessons l ON l.id = e.lesson_id
  LEFT JOIN words w ON w.id = e.word_id
  WHERE l.target_lang = $1 AND e.type IN ('fill_blank', 'sentence_write', 'letter_fill')
  ORDER BY e.id`, [lang])

// Компактный вид для промпта — только то, что нужно для оценки смысла
const items = rows.map(r => {
  const p = r.payload || {}
  if (r.type === 'fill_blank') return { id: r.id, вид: 'пропуск', предложение: p.sentence, ответ: p.blank, варианты: p.options }
  if (r.type === 'sentence_write') return { id: r.id, вид: 'пример', слово: p.word_de || r.word_de, перевод: p.translation_ru || r.translation_ru, пример: p.example, пример_перевод: p.example_ru }
  return { id: r.id, вид: 'слово', слово: p.answer || p.word_de || r.word_de, перевод: p.translation_ru || r.translation_ru }
}).slice(0, limit || undefined)

const nBatches = Math.ceil(items.length / BATCH)
console.log(`Язык курса: ${lang}. Упражнений к проверке: ${items.length} (батчей по ${BATCH}: ${nBatches})`)
console.log(`Смета: ~${nBatches} вызовов ${MODEL}, ориентировочно $${(nBatches * 0.002).toFixed(2)}–$${(nBatches * 0.004).toFixed(2)}`)
if (!run) { console.log('Это смета. Запустить аудит: --run'); process.exit(0) }

// ── Проверка батчами ──────────────────────────────────────────────────────────
const langName = targetLangName(lang)
const prompt = (batch) => `Ты — редактор учебника (${langName} язык, уровень A1, перевод на русский).
Проверь упражнения. Помечай ТОЛЬКО настоящие проблемы:
- грамматическая ошибка в предложении или примере;
- предложение бессмысленное или корявое (так не говорят);
- ответ не подходит в пропуск по смыслу или грамматике;
- перевод не соответствует слову;
- пример не связан со словом.
Мелкие стилистические придирки НЕ считаются. Сомневаешься — считай нормальным.
Ответь ТОЛЬКО JSON-массивом объектов {"id": число, "ok": true/false, "problem": "кратко по-русски, только если ok=false"} — по одному объекту на каждый входной id, без markdown.

Упражнения:
${JSON.stringify(batch, null, 0)}`

resetUsage()
const t0 = Date.now()
const findings = []
let checked = 0, failedBatches = 0

for (let i = 0; i < items.length; i += BATCH) {
  const batch = items.slice(i, i + BATCH)
  try {
    const res = await platformClient.chat.completions.create({
      model: MODEL, max_tokens: 3000,
      messages: [{ role: 'user', content: prompt(batch) }],
    })
    trackUsage(MODEL, res.usage || {})
    const text = (res.choices[0].message.content || '').replace(/^```(json)?|```$/gm, '').trim()
    const verdicts = JSON.parse(text)
    // Один битый элемент не уносит весь батч: сверяем по id, чужие/лишние молча пропускаем
    const known = new Set(batch.map(b => b.id))
    for (const v of Array.isArray(verdicts) ? verdicts : []) {
      if (!known.has(v.id)) continue
      checked++
      if (v.ok === false && v.problem) {
        const src = rows.find(r => r.id === v.id)
        findings.push({ id: v.id, type: src?.type, problem: v.problem })
        console.log(`  ⚠️ #${v.id} ${src?.type}: ${v.problem}`)
      }
    }
  } catch (e) {
    failedBatches++
    console.log(`  ✗ батч ${Math.floor(i / BATCH) + 1}/${nBatches} не разобрался: ${e.message}`)
  }
  if ((i / BATCH) % 20 === 19) console.log(`… ${Math.min(i + BATCH, items.length)}/${items.length}, находок ${findings.length}, $${usageCostUSD().toFixed(2)}`)
}

// ── Итог ──────────────────────────────────────────────────────────────────────
const cost = usageCostUSD()
console.log(`\nПроверено: ${checked}/${items.length} (битых батчей: ${failedBatches})`)
console.log(`Находок: ${findings.length}`)
console.log(`Потрачено: $${cost.toFixed(3)}, время ${(Date.now() - t0) / 60000 | 0} мин`)
console.log('\n=== JSON-ОТЧЁТ ===')
console.log(JSON.stringify(findings, null, 1))

await logOperation({
  kind: 'ai_audit_sentences', provider: 'openai', model: MODEL,
  message: `аудит адекватности ${lang}: проверено ${checked}, находок ${findings.length}`,
  items: checked, durationMs: Date.now() - t0, costUsd: cost,
  meta: { lang, findings: findings.length, failedBatches },
})
process.exit(0)
