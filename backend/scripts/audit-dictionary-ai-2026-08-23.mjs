#!/usr/bin/env node
// Вычитка немецкого словаря дешёвой моделью — по жалобе Павла 22.08.2026
// («немного странные переводы, перепроверь»).
//
// Что ищем (регуляркой это не решается — нужен немецкий):
//   • существительное без артикля: «Blume» вместо «die Blume», род определяется только знанием;
//   • спрягаемая форма вместо инфинитива: «gebe» с переводом «давать», «nimmt», «erzählt»;
//   • неверный или неточный перевод: «steuer → налог» (со строчной это не существительное),
//     «Freunden → друзья» (дательный падеж), «der Zoll → дюйм» (в контексте — таможня);
//   • опечатка в самом слове: «der Kurssteilnehmer» (двойная s).
//
// 💸 gpt-4o-mini, батчами по 40 записей. ~4200 слов ≈ $0.10–0.15. Разрешение Павла
//    получено 23.08.2026. Дорогие модели здесь не используются никогда.
//
// Скрипт НИЧЕГО НЕ МЕНЯЕТ в базе: он только пишет отчёт. Вердикты дешёвой модели
// не применяются автоматом — сначала вычитка ведущей моделью (правило Павла после
// случая, когда mini «чинила» верные записи).
//
//   node scripts/audit-dictionary-ai-2026-08-23.mjs               # весь немецкий словарь
//   node scripts/audit-dictionary-ai-2026-08-23.mjs --lessons 573,619
//
// Отчёт: /tmp/dict-audit-2026-08-23.json — сразу забрать на хост:
//   docker cp translate-backend-1:/tmp/dict-audit-2026-08-23.json /home/seosite/translate-backups/
import { db } from '../src/db/index.js'
import { platformClient } from '../src/services/openaiClient.js'
import { logOperation } from '../src/services/opLog.js'
import fs from 'node:fs'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : null
}
const LESSONS = arg('--lessons')?.split(',').map(Number).filter(Boolean) || null
const BATCH = 40
const PARALLEL = 5
const OUT = '/tmp/dict-audit-2026-08-23.json'

// Промпт переписан после пробного прогона на уроках 19 и 28: первая версия давала
// половину шума и два опасных совета. Она предлагала заменить «gelesen», «geschrieben»,
// «gefahren» на инфинитивы — а урок 28 называется «Прошедшее время», Partizip II там
// стоит НАРОЧНО. И предлагала «wem» → «wer», хотя «wem» («кому») совершенно верно.
// Поэтому: тема урока идёт в промпт, а спрягаемая форма при живом инфинитиве в том же
// уроке — это не «исправить запись», а «удалить дубль» (иначе переименование
// «gebe» → «geben» создаёт вторую запись «geben» в уроке, где она уже есть).
const PROMPT = `Ты преподаватель немецкого. Проверь записи словаря для учеников уровня A1–A2.

Правила:
1. Существительное — с артиклем и с большой буквы: «Blume» → «die Blume», «steuer» → «die Steuer».
2. Прилагательное и наречие артикля НЕ требуют: «faul», «jung», «später», «lauter» — верные записи.
3. Спрягаемая форма глагола («gebe», «nimmt», «zählt») — не словарная запись. Если инфинитив
   этого глагола есть в списке ниже, ставь verdict "duplicate_form" и укажи его в word_de.
   Если инфинитива в списке нет — verdict "fix" с инфинитивом и переводом-инфинитивом.
4. Причастие («gelesen», «gefahren») и склонённая форма прилагательного («guter», «neuer»)
   считаются ВЕРНЫМИ, если тема урока прямо про них (прошедшее время, склонение) — тема указана ниже.
5. Перевод должен соответствовать записи: «Freunden = друзья» неверно, словарная форма
   «der Freund = друг». «der Zoll = дюйм» неверно, в учебниках это «таможня, пошлина».
6. Опечатка в немецком: «der Kurssteilnehmer» → «der Kursteilnehmer».
7. Задание из учебника («Verbinden Sie», «Kreuzen») или целое предложение — verdict "not_a_word".
8. Если запись верна — verdict "ok". НЕ предлагай правку, которая ничего не меняет.

Ответь СТРОГО одним JSON-объектом. Поле "was" — запись, как она дана во входе, слово в слово.
Значения в схеме ниже условные, подставлять их в ответ нельзя — работай с настоящими записями:
{"items":[{"i":0,"was":"<запись из входа>","verdict":"ok"},
          {"i":1,"was":"<запись из входа>","verdict":"fix","word_de":"<исправленная запись>","translation_ru":"<исправленный перевод>","reason":"<причина>"},
          {"i":2,"was":"<запись из входа>","verdict":"duplicate_form","word_de":"<инфинитив из списка>","reason":"<причина>"},
          {"i":3,"was":"<запись из входа>","verdict":"not_a_word","reason":"<причина>"}]}`

const bare = (s) => String(s || '').toLowerCase().replace(/^(der|die|das)\s+/, '').trim()

// Правдоподобна ли ПРАВКА записи. Дешёвая модель при температуре 0 охотно копирует
// значения из примера в промпте: на пробном прогоне «freundlich» она «исправила»
// на «die Blume», а «jung» объявила формой глагола «geben». Настоящая правка либо
// не меняет само слово (добавлен артикль, исправлен перевод), либо сохраняет корень:
// «ich übersetze» → «übersetzen», «Kurssteilnehmer» → «Kursteilnehmer».
function plausible(from, to) {
  const a = bare(from), b = bare(to)
  if (!a || !b) return false
  if (a === b) return true // меняется только артикль или перевод
  for (const t of a.split(/\s+/)) {
    for (const c of b.split(/\s+/)) {
      let i = 0
      while (i < t.length && i < c.length && t[i] === c[i]) i++
      if (i >= 3) return true
    }
  }
  return false
}

// Правдоподобен ли вердикт «это спрягаемая форма, инфинитив в уроке уже есть».
// Строки сравнивать бесполезно — у неправильных глаголов корень другой («gibt» → «geben»),
// поэтому опираемся на факты: инфинитив обязан реально быть в словаре ЭТОГО урока,
// а сама запись — выглядеть глагольной формой. Существительные (с большой буквы),
// инфинитивы (-en/-ern/-eln) и возвратные записи («sich merken») под правило не подпадают:
// «sich erinnern an» — самостоятельная словарная единица, а не форма «erinnern».
function plausibleForm(word, infinitive, lessonWords) {
  const w = String(word || '').trim()
  if (!w || /^[A-ZÄÖÜ]/.test(w)) return false
  if (/^sich\s/i.test(w)) return false
  if (/(en|ern|eln)$/i.test(w)) return false
  return lessonWords.has(bare(infinitive))
}

// Отбракованный вердикт не выбрасываем молча: в отчёте видно, сколько модель нафантазировала.
const skip = (w, v, why) => ({
  id: w.id, lesson_id: w.lesson_id, lesson_number: w.lesson_number,
  word_de: w.word_de, translation_ru: w.translation_ru,
  verdict: 'rejected', fix_word_de: v.word_de || null, fix_translation_ru: v.translation_ru || null,
  reason: `${why} (модель: ${v.verdict}${v.reason ? ', ' + v.reason : ''})`,
})

async function auditBatch(items, lessonWords) {
  const theme = items[0]?.lesson_title ? `Тема урока: ${items[0].lesson_title}\n` : ''
  const list = items.map((w, i) => `${i}. ${w.word_de} = ${w.translation_ru}`).join('\n')
  const res = await platformClient.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 3000,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: `${PROMPT}\n\n${theme}Записи:\n${list}` }],
  })
  const usage = res.usage || {}
  let parsed = { items: [] }
  try { parsed = JSON.parse(res.choices[0].message.content) } catch { /* битый JSON — батч пропускаем */ }
  return {
    usage,
    findings: (parsed.items || [])
      .filter(v => v && v.verdict && v.verdict !== 'ok')
      .map(v => {
        const w = items[v.i]
        if (!w) return null
        // Ответ разъехался с входом — индекс не тот, вердикт не про эту запись.
        // Модель возвращает в "was" всю строку целиком («steuer = налог»), поэтому
        // сверяем только немецкую часть до знака равенства.
        const was = String(v.was || '').split('=')[0].trim()
        if (was && was.toLowerCase() !== w.word_de.trim().toLowerCase()) {
          return { ...skip(w, v, 'ответ не про эту запись') }
        }
        // Пустая правка — шум: «faul → faul, причина: нет артикля». Модель так делает,
        // когда правило из промпта не подходит, а сказать «ok» она уже решила иначе.
        if (v.verdict === 'fix'
            && (!v.word_de || v.word_de === w.word_de)
            && (!v.translation_ru || v.translation_ru === w.translation_ru)) return null
        // Подстановка из примера промпта вместо настоящей правки
        if (v.verdict === 'fix' && v.word_de && !plausible(w.word_de, v.word_de)) {
          return { ...skip(w, v, 'правка не похожа на исходное слово') }
        }
        // «Это форма, инфинитив в уроке есть» — проверяем по словарю урока, а не по буквам
        if (v.verdict === 'duplicate_form' && !plausibleForm(w.word_de, v.word_de, lessonWords)) {
          return { ...skip(w, v, 'инфинитива нет в уроке или запись не глагольная форма') }
        }
        return {
          id: w.id, lesson_id: w.lesson_id, lesson_number: w.lesson_number,
          word_de: w.word_de, translation_ru: w.translation_ru,
          verdict: v.verdict, fix_word_de: v.word_de || null,
          fix_translation_ru: v.translation_ru || null, reason: v.reason || null,
        }
      })
      .filter(Boolean),
  }
}

async function main() {
  const { rows: words } = await db.query(`
    SELECT w.id, w.lesson_id, w.word_de, w.translation_ru, l.lesson_number, l.title AS lesson_title
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE l.target_lang = 'de' AND NOT w.is_function_word
      AND w.translation_ru <> ''
      AND ($1::int[] IS NULL OR w.lesson_id = ANY($1))
    ORDER BY w.lesson_id, w.id`, [LESSONS])

  // Словарь каждого урока — по нему проверяем вердикт «инфинитив в уроке уже есть»
  const wordsOfLesson = new Map()
  for (const w of words) {
    if (!wordsOfLesson.has(w.lesson_id)) wordsOfLesson.set(w.lesson_id, new Set())
    wordsOfLesson.get(w.lesson_id).add(w.word_de.toLowerCase().replace(/^(der|die|das)\s+/, '').trim())
  }

  // Батч не пересекает границу урока: в промпт идёт тема урока, и если в одном запросе
  // окажутся слова двух уроков, тема будет враньём для половины записей.
  const batches = []
  const perLesson = new Map()
  for (const w of words) {
    if (!perLesson.has(w.lesson_id)) perLesson.set(w.lesson_id, [])
    perLesson.get(w.lesson_id).push(w)
  }
  for (const [, list] of perLesson) {
    for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH))
  }
  console.log(`Записей: ${words.length}, батчей по ${BATCH}: ${batches.length}`)
  console.log(`Оценка: вход ~${Math.round(words.length * 20 / 1000)}k токенов, выход ~${Math.round(words.length * 25 / 1000)}k → примерно $${((words.length * 20 / 1e6) * 0.15 + (words.length * 25 / 1e6) * 0.60).toFixed(3)}`)

  const findings = []
  let promptTokens = 0, completionTokens = 0, done = 0
  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL)
    const results = await Promise.all(chunk.map(b => auditBatch(b, wordsOfLesson.get(b[0].lesson_id) || new Set()).catch(e => {
      console.error(`  батч упал: ${e.message}`)
      return { usage: {}, findings: [] }
    })))
    for (const r of results) {
      findings.push(...r.findings)
      promptTokens += r.usage.prompt_tokens || 0
      completionTokens += r.usage.completion_tokens || 0
    }
    done += chunk.length
    console.log(`  ${done}/${batches.length} батчей, замечаний ${findings.length}`)
  }

  const cost = (promptTokens / 1e6) * 0.15 + (completionTokens / 1e6) * 0.60
  const byVerdict = {}
  for (const f of findings) byVerdict[f.verdict] = (byVerdict[f.verdict] || 0) + 1

  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: '2026-08-23', model: 'gpt-4o-mini',
    checked: words.length, findings, cost_usd: Number(cost.toFixed(4)),
  }, null, 1))

  console.log(`\nПроверено записей: ${words.length}`)
  console.log(`Замечаний: ${findings.length} — ${JSON.stringify(byVerdict)}`)
  console.log(`Токены: вход ${promptTokens}, выход ${completionTokens} → $${cost.toFixed(4)}`)
  console.log(`Отчёт: ${OUT}`)

  await logOperation({
    kind: 'audit', provider: 'openai', model: 'gpt-4o-mini', status: 'ok',
    items: words.length, costUsd: Number(cost.toFixed(4)),
    message: `Вычитка немецкого словаря: ${findings.length} замечаний на ${words.length} записей`,
    meta: { script: 'audit-dictionary-ai-2026-08-23', report: OUT, by_verdict: byVerdict },
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
