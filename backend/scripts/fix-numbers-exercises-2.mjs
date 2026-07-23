// Второй ремонт: оставшиеся слова урока «Числа» (id=551) чиним ПО ОДНОМУ — так не нужно сопоставлять
// word_de из ответа модели (для фраз типа «Das macht … Euro» модель иногда перефразирует, écho не совпадает
// со словарным словом — при батче из 1 слова весь ответ гарантированно принадлежит этому слову).
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
console.log(`Затронуто слов: ${affected.length}`, affected.map(w => w.word_de).join(', '))
if (!affected.length) { console.log('Нечего чинить.'); process.exit(0) }

const ids = affected.map(w => w.id)
const del = await db.query('DELETE FROM exercises WHERE word_id = ANY($1) AND type = ANY($2)', [ids, CORE_TYPES])
console.log(`Удалено старых неполных упражнений: ${del.rowCount}`)

const GRAMMAR = [{
  description: 'Составные числа 21–99 строятся по схеме [единицы] + und + [десятки] — единицы называются ПЕРЕД десятками, наоборот, чем по-русски!',
  example: 'einundzwanzig (21), zweiundzwanzig (22)',
}]

let exCount = 0
for (const w of affected) {
  const exercises = await generateExercises([w], GRAMMAR, 'de', [])
  for (const ex of exercises) {
    // Батч из 1 слова — весь ответ гарантированно про это слово, word_id не сопоставляем по строке
    await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
      [LESSON_ID, w.id, ex.type, JSON.stringify(ex.payload)])
    exCount++
  }
  console.log(`${w.word_de}: +${exercises.length} упражнений`)
}
console.log(`Новых упражнений: ${exCount}`)

const { rows: stillBad } = await db.query(
  `SELECT w.word_de, count(e.id) AS n FROM words w LEFT JOIN exercises e ON e.word_id=w.id AND e.type = ANY($2)
   WHERE w.lesson_id=$1 GROUP BY w.id, w.word_de HAVING count(e.id) <> 5`, [LESSON_ID, CORE_TYPES])
if (stillBad.length) console.warn('Всё ещё неполные:', stillBad.map(r => `${r.word_de}(${r.n})`).join(', '))
else console.log('Все слова теперь имеют полный набор упражнений (5 core-типов).')

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
