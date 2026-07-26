// Разовая починка данных «Склонения» (после фикса germanConjugator, 2026-07-26):
// 1) Отделяемые глаголы (einkaufen, abholen…) — конъюгатор спрягал слитно («ich einkaufe») →
//    упражнения УДАЛЯЕМ (вместе с попытками/SRS по ним — контент был неверный).
// 2) Остальным пересчитываем формы исправленным конъюгатором; если отличаются — UPDATE payload.
// OpenAI НЕ вызывается. Запуск в backend-контейнере: node scripts/fix-conjugation-forms.mjs
import { db } from '../src/db/index.js'
import { conjugatePresent } from '../src/services/germanConjugator.js'

const NONSEPARABLE = new Set(['antworten', 'anworten', 'beißen', 'beichten', 'einigen'])
const SEP_PREFIX = /^(ab|an|auf|aus|bei|ein|fern|fest|frei|her|hin|los|mit|nach|statt|teil|vor|weg|weiter|zu|zurück|zusammen)/
const isSeparable = w => SEP_PREFIX.test(w) && !NONSEPARABLE.has(w)

const { rows } = await db.query(`
  SELECT e.id, e.payload, w.word_de FROM exercises e
  JOIN words w ON w.id = e.word_id WHERE e.type = 'conjugation' ORDER BY e.id`)
console.log(`conjugation-упражнений: ${rows.length}`)

let deleted = 0, updated = 0, ok = 0
for (const r of rows) {
  const inf = String(r.word_de || '').trim().toLowerCase()
  if (isSeparable(inf)) {
    // Зависимые строки — вперёд (FK), потом само упражнение
    await db.query('DELETE FROM exercise_attempts WHERE exercise_id = $1', [r.id])
    await db.query('DELETE FROM exercise_deferrals WHERE exercise_id = $1', [r.id])
    await db.query('DELETE FROM user_exercise_progress WHERE exercise_id = $1', [r.id])
    await db.query('DELETE FROM exercises WHERE id = $1', [r.id])
    console.log(`  🗑 удалён (отделяемый): ${inf} (ex ${r.id})`)
    deleted++
    continue
  }
  const fresh = conjugatePresent(inf)
  if (!fresh) { ok++; continue }
  const old = r.payload?.forms || {}
  const diff = Object.keys(fresh).some(k => fresh[k] !== old[k])
  if (diff) {
    const payload = { ...r.payload, forms: fresh }
    await db.query('UPDATE exercises SET payload = $1 WHERE id = $2', [JSON.stringify(payload), r.id])
    console.log(`  ✏️ обновлён: ${inf} — ${Object.keys(fresh).filter(k => fresh[k] !== old[k]).map(k => `${k}: ${old[k]}→${fresh[k]}`).join(', ')}`)
    updated++
  } else ok++
}
console.log(`\nИтог: удалено ${deleted}, обновлено ${updated}, без изменений ${ok}. OpenAI не вызывался (0$).`)
process.exit(0)
