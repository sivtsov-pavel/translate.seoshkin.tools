// Добора набора «Числа» (id=551): все составные числа 21-99 (72 шт), не только 9 репрезентативных.
// Отсутствующие уже вычислены — просто вставляем полный список, ON CONFLICT DO NOTHING пропустит
// то, что уже есть. Упражнения — по одному слову за раз (проверенный паттерн из fix-numbers-exercises-2,
// иначе модель обрезает батч и/или word_de в ответе не совпадает со словарным).
// Запуск внутри backend-контейнера: node scripts/add-numbers-full-compounds.mjs
import { db } from '../src/db/index.js'
import { generateExercises, translateWordsToAllLangs, translateExercisePayloads } from '../src/services/claude.js'

const LESSON_ID = 551
const OWNER_ID = 1
const ACTIVE_LOCALES = ['ru', 'uk', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']

const UNITS_DE = { 1: 'ein', 2: 'zwei', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 7: 'sieben', 8: 'acht', 9: 'neun' }
const UNITS_RU = { 1: 'один', 2: 'два', 3: 'три', 4: 'четыре', 5: 'пять', 6: 'шесть', 7: 'семь', 8: 'восемь', 9: 'девять' }
const TENS_DE = { 20: 'zwanzig', 30: 'dreißig', 40: 'vierzig', 50: 'fünfzig', 60: 'sechzig', 70: 'siebzig', 80: 'achtzig', 90: 'neunzig' }
const TENS_RU = { 20: 'двадцать', 30: 'тридцать', 40: 'сорок', 50: 'пятьдесят', 60: 'шестьдесят', 70: 'семьдесят', 80: 'восемьдесят', 90: 'девяносто' }

const WORDS = []
for (const tens of [20, 30, 40, 50, 60, 70, 80, 90]) {
  for (let u = 1; u <= 9; u++) {
    const de = `${UNITS_DE[u]}und${TENS_DE[tens]}`
    const ru = `${TENS_RU[tens]} ${UNITS_RU[u]}`
    WORDS.push([de, ru])
  }
}
console.log(`Полный список составных чисел: ${WORDS.length}`)

const GRAMMAR = [{
  description: 'Составные числа 21–99 строятся по схеме [единицы] + und + [десятки] — единицы называются ПЕРЕД десятками, наоборот, чем по-русски! einundzwanzig = ein+und+zwanzig = 21 (не «zwanzigeins»).',
  example: 'einundzwanzig (21), zweiundzwanzig (22), dreiundsiebzig (73)',
}]

const wordRows = []
for (const [de, ru] of WORDS) {
  const { rows } = await db.query(
    `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
     VALUES ($1, $2, $3, $4, 'textbook') ON CONFLICT (lesson_id, word_de) DO NOTHING RETURNING id, word_de, translation_ru`,
    [LESSON_ID, OWNER_ID, de, ru])
  if (rows[0]) wordRows.push(rows[0])
}
console.log(`Новых слов добавлено: ${wordRows.length} из ${WORDS.length} (остальные уже были)`)
if (!wordRows.length) { console.log('Нечего делать.'); process.exit(0) }

console.log('Генерирую упражнения по одному слову...')
let exCount = 0
for (const w of wordRows) {
  const exercises = await generateExercises([w], GRAMMAR, 'de', [])
  for (const ex of exercises) {
    await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
      [LESSON_ID, w.id, ex.type, JSON.stringify(ex.payload)])
    exCount++
  }
  const payload = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
  await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [LESSON_ID, w.id, 'dictation', payload])
  await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [LESSON_ID, w.id, 'speech', payload])
  exCount += 2
  console.log(`${w.word_de}: OK`)
}
console.log(`Упражнений создано: ${exCount}`)

const { rows: stillBad } = await db.query(
  `SELECT w.word_de, count(e.id) AS n FROM words w LEFT JOIN exercises e ON e.word_id=w.id AND e.type IN ('flashcard','letter_fill','multiple_choice','sentence_write','fill_blank')
   WHERE w.id = ANY($1) GROUP BY w.id, w.word_de HAVING count(e.id) <> 5`, [wordRows.map(w => w.id)])
if (stillBad.length) console.warn('Неполные (нужно доремонтировать):', stillBad.map(r => `${r.word_de}(${r.n})`).join(', '))
else console.log('Все новые слова имеют полный набор из 5 core-упражнений.')

console.log('Перевожу слова на все языки...')
let wtCount = 0
for (let i = 0; i < wordRows.length; i += 20) {
  const batch = wordRows.slice(i, i + 20)
  const wordTranslations = await translateWordsToAllLangs(batch, ACTIVE_LOCALES)
  for (const [id, t] of Object.entries(wordTranslations)) {
    await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(t), parseInt(id)])
    wtCount++
  }
}
console.log(`Переводов слов: ${wtCount}`)

console.log('Перевожу упражнения...')
const { rows: toTranslate } = await db.query(
  `SELECT id, type, payload FROM exercises WHERE word_id = ANY($1) AND type IN ('multiple_choice','fill_blank','sentence_write') ORDER BY id`,
  [wordRows.map(w => w.id)])
let exTrCount = 0
for (let i = 0; i < toTranslate.length; i += 15) {
  const batch = toTranslate.slice(i, i + 15)
  const results = await translateExercisePayloads(batch, ACTIVE_LOCALES)
  for (const [id, langs] of Object.entries(results)) {
    await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
    exTrCount++
  }
}
console.log(`Переведено упражнений: ${exTrCount}`)
console.log('Готово.')
process.exit(0)
