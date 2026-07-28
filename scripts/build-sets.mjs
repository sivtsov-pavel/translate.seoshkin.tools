#!/usr/bin/env node
// Сборка тематических НАБОРОВ из слов уроков курса.
//
// Наборы («Еда», «Семья», «Грамматика») — второй способ учить те же слова: не по странице
// учебника, а по смыслу. Кнопка «В наборы» в уроке делает это для одного урока; здесь —
// сразу для всего курса, когда наборов ещё нет вовсе.
//
// Почему понадобилось: наборы существовали только для немецкого. Кнопку в английском и
// испанском Павел нажимал, ответ приходил 202 «принято», работа шла в фоне — и падала
// молча. Теперь распределение пишет в журнал операций (админка → Журнал), так что
// следующий такой случай будет видно без чтения docker logs.
//
// 💸 ТРАТИТ БАЛАНС OpenAI. Без --apply только считает и показывает смету.
//   Классификация по темам — gpt-4o (нужно знание рода и смысла), батчами по 50 слов.
//   Упражнения и переводы для новых слов набора — gpt-4o-mini, запускаются фоном самим
//   distributeWordsToSets. Картинки НЕ генерируются: платная генерация выключена
//   (platform_settings.features.autoImages = false), берутся только готовые из банка.
//
// Запускать НА СЕРВЕРЕ (нужен ключ OpenAI):
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/build-sets.mjs --lang en
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/build-sets.mjs --lang en --apply
//
import { db } from '../src/db/index.js'
import { distributeWordsToSets } from '../src/services/processor.js'
import { resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation, textProvider } from '../src/services/opLog.js'
import { bareWord } from '../src/services/articles.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null
if (!lang) { console.error('Укажи язык курса: --lang en'); process.exit(1) }

// Берём слова уроков (не наборов) этого языка. Владелец — из уроков: наборы принадлежат
// тому же учителю, иначе они не покажутся ему в списке.
const { rows } = await db.query(`
  SELECT w.word_de, w.translation_ru, l.owner_id
    FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.is_set = false AND l.target_lang = $1
   ORDER BY l.lesson_number NULLS LAST, w.id`, [lang])

// Уже разложенные слова пропускаем: скрипт можно запускать повторно, он до-разложит остаток.
const { rows: inSets } = await db.query(`
  SELECT w.word_de FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.is_set AND l.target_lang = $1`, [lang])
const already = new Set(inSets.map(r => bareWord(r.word_de, lang)))

const byOwner = new Map()
for (const r of rows) {
  const key = bareWord(r.word_de, lang)
  if (already.has(key)) continue
  already.add(key) // и внутри выборки дедуп: одно слово — один заход
  if (!byOwner.has(r.owner_id)) byOwner.set(r.owner_id, [])
  byOwner.get(r.owner_id).push({ de: r.word_de, tr: r.translation_ru })
}

const total = [...byOwner.values()].reduce((s, a) => s + a.length, 0)
console.log(`Язык ${lang}: слов в уроках ${rows.length}, к раскладке ${total}, владельцев ${byOwner.size}`)
if (!total) { console.log('Раскладывать нечего.'); process.exit(0) }

if (!apply) {
  // Смета: gpt-4o, батч 50. Вход ≈ 900 (промпт) + 12 на слово, выход ≈ 32 на слово.
  const batches = Math.ceil(total / 50)
  const inTok = batches * 900 + total * 12
  const outTok = total * 32
  const cost = (inTok * 2.5 + outTok * 10) / 1e6
  console.log(`Классификация: ${batches} запросов gpt-4o ≈ $${cost.toFixed(2)}`)
  console.log(`Плюс упражнения и переводы новых слов — gpt-4o-mini, фоном (порядка $${(total * 0.0002).toFixed(2)}).`)
  console.log('\nЭто смета. Выполнить: --apply')
  process.exit(0)
}

resetUsage()
const t0 = Date.now()
let added = 0, dup = 0
const themes = new Set()

for (const [ownerId, words] of byOwner) {
  console.log(`  владелец ${ownerId}: ${words.length} слов…`)
  const res = await distributeWordsToSets(words, ownerId, lang)
  added += res.added; dup += res.duplicates
  for (const t of res.themes || []) themes.add(t)
  console.log(`    добавлено ${res.added}, дублей ${res.duplicates}, тем ${(res.themes || []).length}`)
}

const cost = usageCostUSD()
console.log(`\nИтого: добавлено ${added}, дублей ${dup}, тем ${themes.size}, цена $${cost.toFixed(4)}`)
await logOperation({
  kind: 'sets', provider: textProvider(), model: 'gpt-4o',
  status: 'ok', items: added, costUsd: cost, durationMs: Date.now() - t0,
  message: `наборы курса ${lang}: добавлено ${added}, дублей ${dup}`,
  meta: { lang, themes: [...themes] },
})
// Упражнения для новых слов дорисовываются фоном внутри distributeWordsToSets —
// даём процессу время их закончить, иначе выход убьёт незавершённые запросы.
console.log('Жду фоновую дорисовку упражнений (5 мин)…')
await new Promise(r => setTimeout(r, 5 * 60 * 1000))
process.exit(0)
