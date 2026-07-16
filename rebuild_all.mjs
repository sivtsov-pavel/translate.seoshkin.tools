// Массовая пересборка: для каждого готового урока восстанавливаем реальные предложения
// из кэша raw_extraction (БЕСПЛАТНО, без vision) и пересобираем упражнения из них.
// Запускать ВНУТРИ backend-контейнера.
import { db } from '/app/src/db/index.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

const { rows: lessons } = await db.query(
  "SELECT l.id FROM lessons l WHERE l.status='done' AND EXISTS (SELECT 1 FROM words w WHERE w.lesson_id=l.id) ORDER BY l.id")
console.log('Уроков к пересборке:', lessons.length)

let done = 0, failed = 0
for (const L of lessons) {
  try {
    // 1) Восстанавливаем предложения из кэша разбора фото (без затрат OpenAI)
    const { rows: media } = await db.query(
      "SELECT source, raw_extraction FROM lesson_media WHERE lesson_id=$1 AND type='photo' AND raw_extraction IS NOT NULL", [L.id])
    for (const m of media) {
      let ex
      try { ex = typeof m.raw_extraction === 'string' ? JSON.parse(m.raw_extraction) : m.raw_extraction } catch { continue }
      const sents = ex?.example_sentences || []
      const src = m.source === 'extra' ? 'extra' : 'textbook'
      for (const s of sents) {
        const text = (typeof s === 'string' ? s : s?.text || '').trim()
        if (!text || text.length < 4) continue
        await db.query(
          `INSERT INTO lesson_sentences (lesson_id, text, source)
           SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM lesson_sentences WHERE lesson_id=$1 AND lower(text)=lower($2))`,
          [L.id, text, src])
      }
    }
    // 2) Пересобираем упражнения (использует предложения) + переводы
    await regenerateExercisesFromDb(L.id)
    done++
    console.log(`  [${done + failed}/${lessons.length}] урок ${L.id} — ок`)
  } catch (e) {
    failed++
    console.error(`  урок ${L.id}: ${e.message}`)
    await db.query("UPDATE lessons SET status='done' WHERE id=$1", [L.id]).catch(() => {})
  }
}
console.log(`ПЕРЕСБОРКА ЗАВЕРШЕНА: ок ${done}, ошибок ${failed}`)
process.exit(0)
