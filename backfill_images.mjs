// Разовый бэкфилл: пережимаем уже сохранённые картинки слов (PNG 1024 ~1.2МБ / старые jpg)
// в оптимизированный webp (большой 768 + маленький 384). Обновляем image_url в БД и удаляем
// старый файл. Запускать ВНУТРИ backend-контейнера (там sharp, pg, /data/uploads).
import { db } from '/app/src/db/index.js'
import { config } from '/app/src/config.js'
import { saveOptimizedImage } from '/app/src/services/imageOptimize.js'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const VER = 'v=4' // бустим кеш — старые ?v=3 в браузере обновятся

const { rows } = await db.query(
  "SELECT id, image_url FROM words WHERE image_url LIKE '%/word-images/word_%' ORDER BY id"
)
console.log(`Всего картинок к обработке: ${rows.length}`)

let done = 0, skipped = 0, missing = 0, failed = 0
for (const w of rows) {
  const clean = String(w.image_url).split('?')[0]
  const rel = clean.replace(/^\/uploads\//, '')
  const oldPath = join(config.uploadDir, rel)
  const base = `word_${w.id}`
  const newUrl = `/uploads/word-images/${base}.webp`

  // Уже оптимизировано (webp + есть _sm) — только проставим свежий ?v, если нужно
  if (clean.endsWith('.webp') && existsSync(join(config.uploadDir, `word-images/${base}_sm.webp`))) {
    skipped++
    continue
  }
  if (!existsSync(oldPath)) { missing++; continue }

  try {
    const buf = readFileSync(oldPath)
    await saveOptimizedImage(buf, w.id)                     // пишет word_<id>.webp + _sm.webp
    await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [`${newUrl}?${VER}`, w.id])
    if (!oldPath.endsWith('.webp')) unlinkSync(oldPath)      // удаляем старый png/jpg
    done++
    if (done % 100 === 0) console.log(`  ...обработано ${done}`)
  } catch (e) {
    failed++
    console.error(`  word ${w.id} (${oldPath}): ${e.message}`)
  }
}

console.log(`ГОТОВО: пережато ${done}, пропущено(уже webp) ${skipped}, файл отсутствует ${missing}, ошибок ${failed}`)
process.exit(0)
