// Разовый скрипт: набор «Числа» (0–100 полностью + крупные + деньги/цены/возраст) для немецкого.
// Создаёт is_set=true урок (как «Цвета»/«Глаголы» — доступен сразу, вне дрип-очереди курса 2).
// Только текст (без картинок — gpt-4o-mini для переводов/упражнений, экономно).
// Запуск внутри backend-контейнера: node scripts/add-numbers-lesson.mjs
import { db } from '../src/db/index.js'
import { generateExercises, translateWordsToAllLangs, translateExercisePayloads } from '../src/services/claude.js'

const OWNER_ID = 1
const TARGET_LANG = 'de'
const ACTIVE_LOCALES = ['ru', 'uk', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']

// word_de: только слово (переводы — только слово, без цифр в скобках — скобки ломают озвучку)
const WORDS = [
  // 0–20
  ['null', 'ноль'], ['eins', 'один'], ['zwei', 'два'], ['drei', 'три'], ['vier', 'четыре'],
  ['fünf', 'пять'], ['sechs', 'шесть'], ['sieben', 'семь'], ['acht', 'восемь'], ['neun', 'девять'],
  ['zehn', 'десять'], ['elf', 'одиннадцать'], ['zwölf', 'двенадцать'], ['dreizehn', 'тринадцать'],
  ['vierzehn', 'четырнадцать'], ['fünfzehn', 'пятнадцать'], ['sechzehn', 'шестнадцать'],
  ['siebzehn', 'семнадцать'], ['achtzehn', 'восемнадцать'], ['neunzehn', 'девятнадцать'], ['zwanzig', 'двадцать'],
  // Десятки
  ['dreißig', 'тридцать'], ['vierzig', 'сорок'], ['fünfzig', 'пятьдесят'], ['sechzig', 'шестьдесят'],
  ['siebzig', 'семьдесят'], ['achtzig', 'восемьдесят'], ['neunzig', 'девяносто'], ['hundert', 'сто'],
  // Составные 21-99 — репрезентативно (паттерн объяснён в grammar_points)
  ['einundzwanzig', 'двадцать один'], ['zweiundzwanzig', 'двадцать два'], ['fünfunddreißig', 'тридцать пять'],
  ['sechsundvierzig', 'сорок шесть'], ['achtundfünfzig', 'пятьдесят восемь'], ['einundsechzig', 'шестьдесят один'],
  ['dreiundsiebzig', 'семьдесят три'], ['siebenundachtzig', 'восемьдесят семь'], ['zweiundneunzig', 'девяносто два'],
  // Крупные
  ['tausend', 'тысяча'], ['zehntausend', 'десять тысяч'], ['hunderttausend', 'сто тысяч'], ['eine Million', 'миллион'],
  // Деньги/цены/возраст — практический контекст, не «голые циферки»
  ['der Euro', 'евро'], ['der Cent', 'цент'], ['Das kostet … Euro', 'Это стоит … евро'],
  ['Das macht … Euro', 'С вас … евро'], ['Wie viel kostet das?', 'Сколько это стоит?'], ['Ich bin … Jahre alt', 'Мне … лет'],
]

const GRAMMAR = [{
  description: 'Составные числа 21–99 строятся по схеме [единицы] + und + [десятки] — единицы называются ПЕРЕД десятками, наоборот, чем по-русски! einundzwanzig = ein+und+zwanzig = 21 (не «zwanzigeins»).',
  example: 'einundzwanzig (21), zweiundzwanzig (22), dreiundsiebzig (73)',
}]

const { rows: lr } = await db.query(
  `INSERT INTO lessons (owner_id, title, target_lang, status, is_set, set_theme)
   VALUES ($1, $2, $3, 'processing', true, $4) RETURNING id`,
  [OWNER_ID, 'Числа 0–100 и деньги', TARGET_LANG, 'Числа'])
const lessonId = lr[0].id
console.log(`Урок создан: id=${lessonId}`)

const wordRows = []
for (const [de, ru] of WORDS) {
  const { rows } = await db.query(
    `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
     VALUES ($1, $2, $3, $4, 'textbook') ON CONFLICT (lesson_id, word_de) DO NOTHING RETURNING id, word_de, translation_ru`,
    [lessonId, OWNER_ID, de, ru])
  if (rows[0]) wordRows.push(rows[0])
}
console.log(`Слов добавлено: ${wordRows.length} из ${WORDS.length}`)

for (const gp of GRAMMAR) {
  await db.query('INSERT INTO grammar_points (lesson_id, description, example) VALUES ($1, $2, $3)', [lessonId, gp.description, gp.example])
}

// Упражнения: 5 типов от generateExercises + dictation/speech (без картинок)
console.log('Генерирую упражнения...')
const exercises = await generateExercises(wordRows, GRAMMAR, TARGET_LANG, [])
const wordMap = Object.fromEntries(wordRows.map(w => [w.word_de, w.id]))
let exCount = 0
for (const ex of exercises) {
  const wordId = wordMap[ex.word_de] || null
  await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
    [lessonId, wordId, ex.type, JSON.stringify(ex.payload)])
  exCount++
}
for (const w of wordRows) {
  const payload = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
  await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', payload])
  await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', payload])
  exCount += 2
}
console.log(`Упражнений создано: ${exCount}`)

// Переводы слов на 9 локалей (gpt-4o-mini, БЕЗ картинок)
console.log('Перевожу слова на все языки...')
const wordTranslations = await translateWordsToAllLangs(wordRows, ACTIVE_LOCALES)
for (const [id, t] of Object.entries(wordTranslations)) {
  await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(t), parseInt(id)])
}
console.log(`Переводов слов: ${Object.keys(wordTranslations).length}`)

// Переводы упражнений (multiple_choice/fill_blank/sentence_write) на 9 локалей
console.log('Перевожу упражнения...')
const { rows: toTranslate } = await db.query(
  `SELECT id, type, payload FROM exercises WHERE lesson_id = $1 AND type IN ('multiple_choice','fill_blank','sentence_write') ORDER BY id`,
  [lessonId])
let exTrCount = 0
for (let i = 0; i < toTranslate.length; i += 15) {
  const batch = toTranslate.slice(i, i + 15)
  const results = await translateExercisePayloads(batch, ACTIVE_LOCALES)
  for (const [id, langs] of Object.entries(results)) {
    await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
    exTrCount++
  }
}
console.log(`Переводов упражнений: ${exTrCount} из ${toTranslate.length}`)

await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [`Готово! Слов: ${wordRows.length}, упражнений: ${exCount}`, lessonId])
console.log(`Готово. lessonId=${lessonId}`)
process.exit(0)
