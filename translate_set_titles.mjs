// Перевод заголовков наборов на 9 локалей (одним AI-запросом, дёшево) → title_translations.
import { db } from '/app/src/db/index.js'
import { translateLessonTitles } from '/app/src/services/claude.js'

const { rows: sets } = await db.query('SELECT id, set_theme AS title FROM lessons WHERE is_set ORDER BY id')
console.log('Наборов к переводу:', sets.length)
const map = await translateLessonTitles(sets)
let ok = 0
for (const s of sets) {
  const tr = map[s.id] || map[String(s.id)]
  if (!tr) { console.log('  ! нет перевода для', s.title); continue }
  await db.query('UPDATE lessons SET title_translations = $1::jsonb WHERE id = $2', [JSON.stringify(tr), s.id])
  ok++
  console.log(`  ✓ ${s.title} → ${tr.en} / ${tr.de}`)
}
console.log(`ГОТОВО: переведено ${ok}/${sets.length}`)
process.exit(0)
