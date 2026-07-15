// Разовый бэкфилл: перевести заголовки/описания уже существующих уроков на активные локали.
// Запускать ВНУТРИ backend-контейнера.
import { db } from '/app/src/db/index.js'
import { translateLessonMeta } from '/app/src/services/claude.js'

const ALL_LOCALES = ['ru', 'uk', 'de', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']
async function getActiveLocales(targetLang) {
  try {
    const { rows } = await db.query("SELECT config #> $1 AS l FROM platform_settings WHERE id=1", [['targetLocales', targetLang]])
    const l = rows[0]?.l
    if (Array.isArray(l) && l.length) return l
  } catch { /* нет настройки — все */ }
  return ALL_LOCALES
}

const { rows } = await db.query(
  "SELECT id, title, description, target_lang, title_translations, description_translations FROM lessons WHERE title IS NOT NULL AND title <> '' ORDER BY id")
console.log(`Уроков к обработке: ${rows.length}`)

let done = 0, skipped = 0, failed = 0
for (const L of rows) {
  try {
    const active = await getActiveLocales(L.target_lang || 'de')
    const need = active.filter(l => l !== 'ru' && l !== 'de')
    const titleMissing = need.some(l => !(L.title_translations && L.title_translations[l]))
    const hasDesc = L.description && String(L.description).trim()
    const descMissing = hasDesc && need.some(l => !(L.description_translations && L.description_translations[l]))
    if (!titleMissing && !descMissing) { skipped++; continue }
    const meta = await translateLessonMeta(L.title, L.description, active)
    await db.query(
      `UPDATE lessons SET
         title_translations = COALESCE(title_translations, '{}'::jsonb) || $1::jsonb,
         description_translations = COALESCE(description_translations, '{}'::jsonb) || $2::jsonb
       WHERE id = $3`,
      [JSON.stringify(meta.title), JSON.stringify(meta.description), L.id])
    done++
    if (done % 10 === 0) console.log(`  ...переведено ${done}`)
  } catch (e) {
    failed++
    console.error(`  урок ${L.id}: ${e.message}`)
  }
}
console.log(`ГОТОВО: переведено ${done}, пропущено(уже есть) ${skipped}, ошибок ${failed}`)
process.exit(0)
