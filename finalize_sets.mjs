// Автономная финализация (запускать detached): 1) ждём конца слияния, 2) схлопываем
// ПОХОЖИЕ темы в канонические наборы, 3) дорисовываем недостающие картинки (банк-дедуп).
import { db } from '/app/src/db/index.js'
import { generateWordImage, isFunctionWord } from '/app/src/services/imageGen.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Канонизация темы по ключевым словам (склеиваем синонимы)
function canonical(theme) {
  const t = String(theme || '').toLowerCase()
  if (/школ|учеб|учёб|предмет|класс|информаци/.test(t)) return 'Школа и учёба'
  if (/сем[ья]|друз|родн/.test(t)) return 'Семья и друзья'
  if (/глагол|действ/.test(t)) return 'Глаголы'
  if (/числ|цифр|счёт|счет/.test(t)) return 'Числа'
  if (/врем|час[ыао]|день|недел|месяц|дата/.test(t)) return 'Время'
  if (/транспорт|путешеств|поездк|дорог/.test(t)) return 'Транспорт'
  if (/\bед[ааы]|напит|пища|кофе|еда|продукт/.test(t)) return 'Еда и напитки'
  if (/язык/.test(t)) return 'Языки'
  if (/документ|личные данные|\bданные|адрес|анкет/.test(t)) return 'Документы и данные'
  if (/город|стран|географ|происхожд|\bмест/.test(t)) return 'Города и страны'
  if (/общени|привет|знаком|вежлив|\bфраз|разговор/.test(t)) return 'Общение'
  if (/эмоци|чувств|любов/.test(t)) return 'Эмоции'
  if (/\bдом|мебел|\bбыт|квартир/.test(t)) return 'Дом и быт'
  if (/природ|погод|животн|растен/.test(t)) return 'Природа'
  if (/местоимен|предлог|артикл|граммат|падеж/.test(t)) return 'Грамматика'
  if (/одежд/.test(t)) return 'Одежда'
  if (/покупк|магазин|деньг|цена/.test(t)) return 'Покупки'
  if (/\bцвет/.test(t)) return 'Цвета'
  if (/тело|здоров|болезн/.test(t)) return 'Тело и здоровье'
  if (/професс|\bработ/.test(t)) return 'Работа и профессии'
  return String(theme || '').trim()
}

// 1) Ждём, пока слияние доиграет (нет под-уроков и нет processing)
console.log('Жду конца слияния...')
let prev = -1
for (let i = 0; i < 240; i++) {
  const { rows } = await db.query("SELECT count(*) FILTER (WHERE parent_lesson_id IS NOT NULL AND NOT is_set)::int subs, count(*) FILTER (WHERE status='processing')::int proc FROM lessons")
  const { subs, proc } = rows[0]
  if (subs === 0 && proc === 0) break
  if (subs === prev && proc === 0) break
  prev = subs
  await sleep(15000)
}
console.log('Слияние завершено. Схлопываю похожие темы...')

// 2) Группируем наборы по канонической теме
const { rows: sets } = await db.query('SELECT id, set_theme, owner_id, course_id, target_lang, school_id FROM lessons WHERE is_set = true ORDER BY id')
const byCanon = new Map()
for (const s of sets) {
  const c = canonical(s.set_theme)
  if (!byCanon.has(c)) byCanon.set(c, [])
  byCanon.get(c).push(s)
}
console.log('Канонических тем:', byCanon.size, 'из наборов:', sets.length)

let merged = 0
for (const [canon, group] of byCanon) {
  if (group.length === 1) {
    // просто приводим название к канону
    await db.query('UPDATE lessons SET set_theme=$1, title=$1 WHERE id=$2', [canon, group[0].id])
    continue
  }
  // сливаем в первый набор группы
  const keep = group[0]
  const others = group.slice(1).map(g => g.id)
  await db.query('UPDATE lessons SET set_theme=$1, title=$1 WHERE id=$2', [canon, keep.id])
  // переносим уникальные слова из остальных в keep
  const { rows: words } = await db.query(
    `SELECT DISTINCT ON (regexp_replace(lower(word_de),'^(der|die|das|ein|eine)\\s+',''))
       word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source
     FROM words WHERE lesson_id = ANY($1::int[])
     ORDER BY regexp_replace(lower(word_de),'^(der|die|das|ein|eine)\\s+',''), (image_url IS NOT NULL) DESC`, [others])
  for (const w of words) {
    await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (lesson_id, word_de) DO NOTHING`,
      [keep.id, keep.owner_id, w.word_de, w.translation_ru, w.example_sentence, w.example_sentence_ru, w.image_url, w.translations, w.source])
  }
  // переносим предложения
  await db.query(`INSERT INTO lesson_sentences (lesson_id, text, translation_ru, source)
    SELECT DISTINCT $1, text, translation_ru, source FROM lesson_sentences WHERE lesson_id = ANY($2::int[])
    ON CONFLICT DO NOTHING`, [keep.id, others]).catch(()=>{})
  await regenerateExercisesFromDb(keep.id)
  await db.query('DELETE FROM lessons WHERE id = ANY($1::int[])', [others])
  merged++
  console.log(`  «${canon}» ← слито ${group.length} наборов`)
}
console.log(`Похожие темы схлопнуты. Итог наборов: ${byCanon.size}`)

// 2.5) Чистим пустые/тестовые уроки и наборы (0 слов = мусор). Книги-источники НЕ трогаем.
const del = await db.query("DELETE FROM lessons WHERE status='done' AND (SELECT count(*) FROM words w WHERE w.lesson_id=lessons.id)=0")
console.log('Удалено пустых уроков/наборов:', del.rowCount)

// 3) Дорисовываем недостающие картинки (банк-дедуп по смыслу)
const { rows: noimg } = await db.query("SELECT id, word_de, translation_ru, (SELECT target_lang FROM lessons WHERE id=w.lesson_id) tl FROM words w WHERE image_url IS NULL ORDER BY id")
let drawn = 0
for (const w of noimg) {
  if (isFunctionWord(w.word_de)) continue
  const tr = String(w.translation_ru || '').trim().toLowerCase()
  if (tr.length > 1) {
    const { rows } = await db.query("SELECT image_url FROM words WHERE lower(trim(translation_ru))=$1 AND image_url IS NOT NULL LIMIT 1", [tr])
    if (rows[0]?.image_url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [rows[0].image_url, w.id]); drawn++; continue }
  }
  try {
    const url = await generateWordImage(w.word_de, w.translation_ru, w.id, w.tl || 'de')
    if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); drawn++ }
  } catch (e) { console.error('img', w.word_de, e.message) }
}
console.log(`Картинок дорисовано/переиспользовано: ${drawn}`)
console.log('ФИНАЛИЗАЦИЯ ЗАВЕРШЕНА')
process.exit(0)
