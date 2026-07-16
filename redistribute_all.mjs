// Массовое «Перераспределить» по всем оригинальным урокам (не под-урокам), у которых
// достаточно слов и которые ещё не разбиты. Запускать ВНУТРИ backend-контейнера.
import { db } from '/app/src/db/index.js'
import { redistributeLesson } from '/app/src/services/processor.js'

const { rows } = await db.query(`
  SELECT l.id, left(l.title,40) AS title FROM lessons l
  WHERE l.status='done'
    AND l.title !~ 'Урок\\s+[0-9]+\\.[0-9]'
    AND NOT EXISTS (SELECT 1 FROM lessons c WHERE c.parent_lesson_id = l.id)
    AND (SELECT count(*) FROM words w WHERE w.lesson_id=l.id) >= 8
  ORDER BY l.id`)
console.log('Уроков к разбивке:', rows.length)

let done = 0, failed = 0
for (const L of rows) {
  try {
    await redistributeLesson(L.id)
    done++
    console.log(`  [${done + failed}/${rows.length}] урок ${L.id} «${L.title}» — разбит`)
  } catch (e) {
    failed++
    console.error(`  урок ${L.id}: ${e.message}`)
    await db.query("UPDATE lessons SET status='done' WHERE id=$1", [L.id]).catch(() => {})
  }
}
console.log(`РАЗБИВКА ЗАВЕРШЕНА: разбито ${done}, ошибок ${failed}`)
process.exit(0)
