// БЕЗОПАСНАЯ перегенерация уроков с логом реальной стоимости OpenAI.
// Сохраняет прогресс ученика (UPDATE payload на месте, ID целы). Запуск в backend-контейнере:
//   node scripts/regen-safe.mjs 29 30      (id уроков через пробел)
import { db } from '../src/db/index.js'
import { regenerateExercisesSafe } from '../src/services/processor.js'
import { resetUsage, usage, usageCostUSD } from '../src/services/claude.js'

const ids = process.argv.slice(2).map(Number).filter(Boolean)
if (!ids.length) { console.error('Укажи id уроков: node scripts/regen-safe.mjs 29 30'); process.exit(1) }

resetUsage()
for (const id of ids) {
  const r = await regenerateExercisesSafe(id)
  console.log(`урок ${id}: обновлено ${r.updated}, добавлено ${r.inserted}`)
}
const usd = usageCostUSD()
console.log(`\n=== РАСХОД OpenAI ===`)
console.log(`вызовов: ${usage.calls}, prompt-токенов: ${usage.promptTokens}, completion-токенов: ${usage.completionTokens}`)
console.log(`ЦЕНА: $${usd.toFixed(4)} (${(usd * 100).toFixed(2)}¢)`)
await db.end?.()
process.exit(0)
