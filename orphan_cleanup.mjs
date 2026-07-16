// Убираем 6 остаточных под-уроков (фрагменты редистрибуции): переносим их уникальные
// слова в соответствующий канонический набор и удаляем сам под-урок.
import { db } from '/app/src/db/index.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

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

const { rows: orphans } = await db.query(
  "SELECT id, title FROM lessons WHERE parent_lesson_id IS NOT NULL AND NOT is_set")
console.log('Сирот-фрагментов:', orphans.length)

const affected = new Set()
for (const o of orphans) {
  const theme = String(o.title).replace(/^Урок\s+[0-9.]+\s*—\s*/, '').trim()
  const canon = canonical(theme)
  const { rows: setRows } = await db.query('SELECT id, owner_id FROM lessons WHERE is_set AND set_theme=$1 LIMIT 1', [canon])
  if (!setRows[0]) { console.log(`  ! нет набора «${canon}» для «${o.title}» — пропускаю удаление`); continue }
  const set = setRows[0]
  const { rows: words } = await db.query(
    `SELECT word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source
     FROM words WHERE lesson_id=$1`, [o.id])
  let added = 0
  for (const w of words) {
    const r = await db.query(
      `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (lesson_id, word_de) DO NOTHING`,
      [set.id, set.owner_id, w.word_de, w.translation_ru, w.example_sentence, w.example_sentence_ru, w.image_url, w.translations, w.source])
    if (r.rowCount) added++
  }
  await db.query('DELETE FROM lessons WHERE id=$1', [o.id])
  if (added) affected.add(set.id)
  console.log(`  «${o.title}» → «${canon}» (+${added} слов, удалён)`)
}

for (const id of affected) {
  try { await regenerateExercisesFromDb(id) } catch (e) { console.error('ex', id, e.message) }
}
console.log('ОЧИСТКА СИРОТ ЗАВЕРШЕНА, затронуто наборов:', affected.size)
process.exit(0)
