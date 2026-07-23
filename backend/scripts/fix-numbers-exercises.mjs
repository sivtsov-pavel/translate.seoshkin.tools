// Ремонт: часть слов урока «Числа» (id=551) получила НЕПОЛНЫЙ набор упражнений (модель обрезала
// вывод в больших батчах — видно по count(*) FILTER не равному 5 на слово). Чистим и генерируем заново
// ТОЛЬКО для затронутых слов (малый батч — надёжнее). Запуск: node scripts/fix-numbers-exercises.mjs
import { db } from '../src/db/index.js'
import { generateExercises, translateExercisePayloads } from '../src/services/claude.js'

const LESSON_ID = 551
const CORE_TYPES = ['flashcard', 'letter_fill', 'multiple_choice', 'sentence_write', 'fill_blank']

const { rows: affected } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru
   FROM words w LEFT JOIN exercises e ON e.word_id = w.id AND e.type = ANY($2)
   WHERE w.lesson_id = $1
   GROUP BY w.id, w.word_de, w.translation_ru
   HAVING count(e.id) <> 5
   ORDER BY w.id`,
  [LESSON_ID, CORE_TYPES])
console.log(`Затронуто слов: ${affected.length}`)
if (!affected.length) { console.log('Нечего чинить.'); process.exit(0) }

const ids = affected.map(w => w.id)
const del = await db.query('DELETE FROM exercises WHERE word_id = ANY($1) AND type = ANY($2)', [ids, CORE_TYPES])
console.log(`Удалено старых неполных упражнений: ${del.rowCount}`)

const GRAMMAR = [{
  description: 'Составные числа 21–99 строятся по схеме [единицы] + und + [десятки] — единицы называются ПЕРЕД десятками, наоборот, чем по-русски! einundzwanzig = ein+und+zwanzig = 21.',
  example: 'einundzwanzig (21), zweiundzwanzig (22), dreiundsiebzig (73)',
}]

// Малыми батчами по 8 слов — надёжнее, чем один большой запрос
let exCount = 0
const wordMap = Object.fromEntries(affected.map(w => [w.word_de, w.id]))
for (let i = 0; i < affected.length; i += 8) {
  const batch = affected.slice(i, i + 8)
  const exercises = await generateExercises(batch, GRAMMAR, 'de', [])
  for (const ex of exercises) {
    const wordId = wordMap[ex.word_de] || null
    if (!wordId) { console.warn('Не нашли word_id для', ex.word_de); continue }
    await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
      [LESSON_ID, wordId, ex.type, JSON.stringify(ex.payload)])
    exCount++
  }
  console.log(`Батч ${i}-${i + batch.length}: готово (всего упражнений сейчас ${exCount})`)
}
console.log(`Новых упражнений: ${exCount}`)

// Проверка: у всех ли теперь ровно 5 core-упражнений
const { rows: stillBad } = await db.query(
  `SELECT w.word_de, count(e.id) AS n FROM words w LEFT JOIN exercises e ON e.word_id=w.id AND e.type = ANY($2)
   WHERE w.lesson_id=$1 GROUP BY w.id, w.word_de HAVING count(e.id) <> 5`, [LESSON_ID, CORE_TYPES])
if (stillBad.length) console.warn('Всё ещё неполные:', stillBad.map(r => `${r.word_de}(${r.n})`).join(', '))
else console.log('Все слова теперь имеют полный набор упражнений.')

// Переводы для НОВЫХ multiple_choice/fill_blank/sentence_write (без payload_translations)
const { rows: toTranslate } = await db.query(
  `SELECT id, type, payload FROM exercises
   WHERE lesson_id = $1 AND type IN ('multiple_choice','fill_blank','sentence_write')
     AND (payload_translations IS NULL OR payload_translations = '{}') ORDER BY id`,
  [LESSON_ID])
console.log(`Нужно перевести: ${toTranslate.length}`)
const ACTIVE_LOCALES = ['ru', 'uk', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']
let trCount = 0
for (let i = 0; i < toTranslate.length; i += 15) {
  const results = await translateExercisePayloads(toTranslate.slice(i, i + 15), ACTIVE_LOCALES)
  for (const [id, langs] of Object.entries(results)) {
    await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
    trCount++
  }
}
console.log(`Переведено упражнений: ${trCount}`)
console.log('Готово.')
process.exit(0)
