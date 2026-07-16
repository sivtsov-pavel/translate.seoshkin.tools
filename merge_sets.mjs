// Слияние под-уроков в глобальные тематические наборы (Глаголы, Числа, Школа…).
// Все под-уроки с одной темой → ОДИН набор (is_set), слова дедуплены. Под-уроки удаляются.
// Книги-уроки (родители) остаются. Запускать ВНУТРИ backend-контейнера.
import { db } from '/app/src/db/index.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

const theme = t => String(t || '').replace(/^Урок\s+[0-9.]+\s*—\s*/, '').trim()

const { rows: subs } = await db.query(
  "SELECT id, title, owner_id, course_id, target_lang, school_id FROM lessons WHERE parent_lesson_id IS NOT NULL AND status='done' AND is_set = false ORDER BY id")
const byTheme = new Map()
for (const s of subs) {
  const th = theme(s.title)
  if (!th) continue
  if (!byTheme.has(th)) byTheme.set(th, [])
  byTheme.get(th).push(s)
}
console.log('Тем к сборке:', byTheme.size, 'из под-уроков:', subs.length)

let made = 0, failed = 0
for (const [th, group] of byTheme) {
  try {
    const first = group[0]
    const ids = group.map(g => g.id)
    // 1) создаём набор
    const { rows: nl } = await db.query(
      `INSERT INTO lessons (owner_id, title, course_id, target_lang, school_id, is_set, set_theme, status, progress)
       VALUES ($1,$2,$3,$4,$5,true,$6,'processing','Собираю набор...') RETURNING id`,
      [first.owner_id, th, first.course_id, first.target_lang, first.school_id, th])
    const setId = nl[0].id
    // 2) уникальные слова из всех под-уроков темы (по слову без артикля, с картинкой в приоритете)
    const { rows: words } = await db.query(
      `SELECT DISTINCT ON (regexp_replace(lower(word_de),'^(der|die|das|ein|eine)\\s+',''))
         word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source, media_id
       FROM words WHERE lesson_id = ANY($1::int[])
       ORDER BY regexp_replace(lower(word_de),'^(der|die|das|ein|eine)\\s+',''), (image_url IS NOT NULL) DESC`,
      [ids])
    for (const w of words) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source, media_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (lesson_id, word_de) DO NOTHING`,
        [setId, first.owner_id, w.word_de, w.translation_ru, w.example_sentence, w.example_sentence_ru, w.image_url, w.translations, w.source, w.media_id])
    }
    // 3) предложения (уникальные)
    const { rows: sents } = await db.query('SELECT DISTINCT text, translation_ru, source FROM lesson_sentences WHERE lesson_id = ANY($1::int[])', [ids])
    for (const s of sents) {
      await db.query('INSERT INTO lesson_sentences (lesson_id, text, translation_ru, source) VALUES ($1,$2,$3,$4)', [setId, s.text, s.translation_ru, s.source])
    }
    // 4) упражнения из слов набора + предложений
    await regenerateExercisesFromDb(setId)
    // 5) удаляем под-уроки темы (каскад чистит их слова/упражнения)
    await db.query('DELETE FROM lessons WHERE id = ANY($1::int[])', [ids])
    made++
    console.log(`  [${made}/${byTheme.size}] набор «${th}» — ${words.length} слов из ${ids.length} под-уроков`)
  } catch (e) {
    failed++
    console.error(`  тема «${th}»: ${e.message}`)
  }
}
console.log(`НАБОРЫ ГОТОВЫ: собрано ${made}, ошибок ${failed}`)
process.exit(0)
