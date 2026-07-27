#!/usr/bin/env node
// Догенерация недостающих упражнений СТАРЫМ урокам — ЛОКАЛЬНОЙ моделью, бесплатно.
//
// Зачем: уроки, сгенерённые до 25.07.2026, страдают от усечения батча (батч был 15 слов ×
// 5 типов = 75 JSON-объектов в одном ответе, модель обрывала хвост). Диктант и произношение
// пишутся кодом, поэтому у них покрытие полное, а core-типов у части слов нет.
// Код генерации починен, но старые данные задним числом не переписываются — это делает
// вот этот скрипт.
//
// Работает по принципу «ноут сам ходит за работой»: прод к ноуту НЕ подключается,
// наружу ничего не открываем. Скрипт с ноута читает прод-базу через ssh и туда же пишет.
//
// 💸 ДЕНЕГ НЕ ТРАТИТ: вся генерация идёт через Ollama на ноутбуке. Платный OpenAI не
// вызывается ни разу. Для длинных прогонов запускать под `caffeinate -i`, чтобы ноут не уснул:
//   caffeinate -i node scripts/topup-exercises-local.mjs --lesson 31
//
// Этапы:
//   --dry (по умолчанию) — сгенерить и разложить в JSON для ревью, в базу НЕ писать
//   --apply              — записать ранее сгенерённое в прод-базу
//
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { generateExercises, CORE_EXERCISE_TYPES } from '../backend/src/services/claude.js'
import { makeOllamaClient } from '../backend/src/services/localAi.js'

const args = process.argv.slice(2)
const lessonId = parseInt(args[args.indexOf('--lesson') + 1])
const apply = args.includes('--apply')
const OUT_DIR = args[args.indexOf('--out') + 1] || './topup-out'

if (!lessonId) {
  console.error('Использование: node scripts/topup-exercises-local.mjs --lesson <id> [--apply] [--out <dir>]')
  process.exit(1)
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
const OUT = `${OUT_DIR}/lesson${lessonId}.json`

// ── Прод-база через ssh (порт наружу не открываем) ────────────────────────────
const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
function prodSql(sql) {
  // Схлопываем в одну строку: JSON.stringify превратил бы переводы строк в литерал «\n»,
  // и psql упал бы на «syntax error at or near "\"».
  const oneLine = sql.replace(/\s+/g, ' ').trim()
  return execFileSync('ssh', [SSH_HOST,
    `cd ${PROD_DIR} && docker compose -f docker-compose.prod.yml exec -T db ` +
    `psql -U german_app -d german_learning -t -A -c ${JSON.stringify(oneLine)}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

// ── Шаг 1: какие слова урока недобрали core-типы ──────────────────────────────
function fetchWords() {
  const raw = prodSql(`SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT w.id, w.word_de, w.translation_ru, w.example_sentence,
           ARRAY(SELECT DISTINCT e.type FROM exercises e WHERE e.word_id = w.id AND e.lesson_id = ${lessonId}) AS have
    FROM words w WHERE w.lesson_id = ${lessonId} ORDER BY w.id) t`)
  return JSON.parse(raw)
}

const all = fetchWords()
const missing = all.filter(w => CORE_EXERCISE_TYPES.some(t => !(w.have || []).includes(t)))
console.log(`Урок ${lessonId}: слов ${all.length}, недобрали core-типы ${missing.length}`)
if (!missing.length) { console.log('Добивать нечего.'); process.exit(0) }

// ── Шаг 2: генерация (или чтение готового при --apply) ────────────────────────
let generated
if (apply) {
  generated = JSON.parse(readFileSync(OUT, 'utf8'))
  console.log(`Читаю готовое из ${OUT}: ${generated.length} упражнений`)
} else {
  const words = missing.map(w => ({
    word_de: w.word_de, translation_ru: w.translation_ru, example_sentence: w.example_sentence,
  }))
  const t0 = Date.now()
  generated = await generateExercises(words, [], 'de', [], makeOllamaClient())
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  const byType = {}
  for (const e of generated) byType[e.type] = (byType[e.type] || 0) + 1
  console.log(`Сгенерено за ${secs}s: ${generated.length} упражнений`, byType)
  writeFileSync(OUT, JSON.stringify(generated, null, 1))
  console.log(`Результат: ${OUT}\nПроверь глазами, затем: --apply`)
  process.exit(0)
}

// ── Шаг 3: запись в прод (только с --apply), без дублей ───────────────────────
// Ключ слова — без артикля и регистронезависимо: модель может ответить «Tisch» вместо «der Tisch».
const wKey = (s) => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/, '').trim()
const idByWord = new Map(all.map(w => [wKey(w.word_de), w.id]))
const haveByWord = new Map(all.map(w => [w.id, new Set(w.have || [])]))

const rows = []
for (const ex of generated) {
  const wid = idByWord.get(wKey(ex.word_de))
  if (!wid) { console.warn(`  пропуск: слово «${ex.word_de}» не найдено в уроке`); continue }
  if (!CORE_EXERCISE_TYPES.includes(ex.type)) continue
  const have = haveByWord.get(wid)
  if (have.has(ex.type)) continue // такой тип у слова уже есть — дубль не нужен
  have.add(ex.type)
  rows.push({ wid, type: ex.type, payload: ex.payload })
}
console.log(`К вставке: ${rows.length} упражнений`)
if (!rows.length) process.exit(0)

// Пишем параметризованно через ssh-туннель к прод-базе (порт наружу не публикуется:
// туннель живёт только на время работы скрипта). Склейки JSON в SQL-строку нет.
const { default: pg } = await import('pg')
const { spawn } = await import('child_process')
const DB_IP = process.env.PROD_DB_IP || '172.19.0.2' // IP контейнера translate-db-1 в сети докера
const PORT = 55432
const tunnel = spawn('ssh', ['-N', '-L', `${PORT}:${DB_IP}:5432`, SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500)) // даём туннелю подняться

const client = new pg.Client({
  host: '127.0.0.1', port: PORT, user: 'german_app', database: 'german_learning',
  password: process.env.PROD_DB_PASSWORD,
})
try {
  await client.connect()
  let n = 0
  for (const r of rows) {
    await client.query(
      'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
      [lessonId, r.wid, r.type, JSON.stringify(r.payload)])
    n++
  }
  console.log(`Вставлено: ${n}`)
} finally {
  await client.end().catch(() => {})
  tunnel.kill()
}
console.log('⚠️ Переводы payload на 10 локалей — отдельным шагом (translateExercisePayloads).')
