// Перегенерация упражнений для всех наборов и уроков (кроме личных). Долго (AI по каждому).
import { db } from '/app/src/db/index.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

const { rows } = await db.query(`
  SELECT l.id, l.title, l.is_set FROM lessons l
  WHERE NOT COALESCE(l.is_personal,false)
    AND EXISTS (SELECT 1 FROM words w WHERE w.lesson_id = l.id)
  ORDER BY l.is_set DESC, l.id`)
console.log('К перегенерации:', rows.length, '(сначала наборы)')
let ok = 0, err = 0
for (const l of rows) {
  try { const r = await regenerateExercisesFromDb(l.id); ok++; console.log(`  ✓ [${l.is_set?'набор':'урок'}] ${l.title} — упр:${r.exercisesCount}`) }
  catch (e) { err++; console.error(`  ✗ ${l.title}: ${e.message}`) }
}
console.log(`ГОТОВО: успешно ${ok}, ошибок ${err}`)
process.exit(0)
