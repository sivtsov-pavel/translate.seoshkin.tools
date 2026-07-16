// Лёгкая консолидация наборов: схлопываем ПОХОЖИЕ темы в ~24 канонических.
// Без генерации картинок и без обращений к API — только SQL. Запуск на переднем плане.
import { db } from '/app/src/db/index.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

// ВАЖНО: в JS \b не работает с кириллицей (ASCII-only), поэтому НЕ используем \b.
function canonical(theme) {
  const t = String(theme || '').toLowerCase().trim()
  const has = (...subs) => subs.some(s => t.includes(s))
  if (has('школ','учеб','учёб','предмет','класс','информат','курс','занят','канцел','канцтовар','препода','перемен','перерыв','урок','лекци')) return 'Школа и учёба'
  if (has('язык','национальн','перевод')) return 'Языки'
  if (has('сем','друз','родн','детств','детск','ребён','ребен')) return 'Семья и друзья'
  if (has('глагол','действ')) return 'Глаголы'
  if (has('числ','цифр','счёт','счет','количеств')) return 'Числа'
  if (has('врем','час','день','дни','недел','месяц','дата','период','частот','сегодн','завтра','вчера')) return 'Время'
  if (has('транспорт','путешеств','поездк','дорог','отпуск','машин','поезд','автобус')) return 'Транспорт'
  if (has('еда','напит','пища','кофе','продукт','блюд','фрукт','овощ','голод')) return 'Еда и напитки'
  if (has('документ','данные','адрес','анкет','почт','посылк','паспорт')) return 'Документы и данные'
  if (has('город','стран','географ','происхожд')) return 'Города и страны'
  if (has('мест','направл','налево','направо','положени')) return 'Места и направления'
  if (has('граммат','местоимен','предлог','артикл','падеж','частиц','союз','соединени','объединени','вопрос')) return 'Грамматика'
  if (has('эмоци','чувств','любов','желани','состояни','качеств')) return 'Эмоции'
  if (has('дом','мебел','быт','квартир','комнат')) return 'Дом и быт'
  if (has('природ','погод','животн','растен')) return 'Природа'
  if (has('одежд')) return 'Одежда'
  if (has('покупк','магазин','деньг','цена','цены')) return 'Покупки'
  if (has('цвет')) return 'Цвета'
  if (has('тело','здоров','болезн')) return 'Тело и здоровье'
  if (has('професс','работ','государствен','структур','инструмент')) return 'Работа и профессии'
  if (has('технолог','техник','прибор','устройств','компьютер')) return 'Технологии'
  if (has('люд','личност','персон')) return 'Люди'
  if (has('общени','привет','знаком','вежлив','фраз','разговор','попрощ','прощан','гостеприим','обращени','слова','лекс')) return 'Общение'
  return 'Разное'
}

const { rows: sets } = await db.query('SELECT id, set_theme, owner_id FROM lessons WHERE is_set = true ORDER BY id')
const byCanon = new Map()
for (const s of sets) {
  const c = canonical(s.set_theme)
  if (!byCanon.has(c)) byCanon.set(c, [])
  byCanon.get(c).push(s)
}
console.log(`Было наборов: ${sets.length} → канонических тем: ${byCanon.size}`)

for (const [canon, group] of byCanon) {
  const keep = group[0]
  await db.query('UPDATE lessons SET set_theme=$1, title=$2 WHERE id=$3', [canon, canon, keep.id])
  if (group.length === 1) continue
  const others = group.slice(1).map(g => g.id)
  // переносим уникальные слова (по нормализованному слову без артикля)
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
  await db.query(`INSERT INTO lesson_sentences (lesson_id, text, translation_ru, source)
    SELECT DISTINCT $1::int, text, translation_ru, source FROM lesson_sentences WHERE lesson_id = ANY($2::int[])
    ON CONFLICT DO NOTHING`, [keep.id, others]).catch(()=>{})
  await db.query('DELETE FROM lessons WHERE id = ANY($1::int[])', [others])
  console.log(`  «${canon}» ← слито ${group.length} (уник. слов добавлено: ${words.length})`)
}

// Перегенерируем упражнения только для тех наборов, куда что-то слили (>1)
for (const [canon, group] of byCanon) {
  if (group.length > 1) {
    try { await regenerateExercisesFromDb(group[0].id) } catch (e) { console.error('ex', canon, e.message) }
  }
}

// Чистим пустые наборы/уроки (0 слов). Книги-источники (не is_set) с 0 слов не трогаем.
const del = await db.query("DELETE FROM lessons WHERE is_set AND (SELECT count(*) FROM words w WHERE w.lesson_id=lessons.id)=0")
console.log('Удалено пустых наборов:', del.rowCount)

const { rows: fin } = await db.query('SELECT count(*)::int n FROM lessons WHERE is_set')
console.log(`ИТОГ наборов: ${fin[0].n}`)
console.log('КОНСОЛИДАЦИЯ ЗАВЕРШЕНА')
process.exit(0)
