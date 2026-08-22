#!/usr/bin/env node
// Применение вычитанных правок словаря по отчёту audit-dictionary-ai-2026-08-23.
//
// Вердикты дешёвой модели НЕ применяются как есть — они прошли вычитку ведущей моделью,
// и всё, что ниже, объясняет, что именно отклонено и почему. Правило Павла: mini подсказывает,
// решение принимает старшая модель.
//
// Что отклонено по правилам (модель ошибалась системно):
//   • страны и города — «das Polen», «das Deutschland», «die München». Средний род стран
//     употребляется БЕЗ артикля, это прямо записано и в промпте генератора упражнений;
//   • числительные — «die Dreiundsechzig», «die Vierundsiebzig» и ещё почти сорок таких:
//     числительное не существительное, артикль ему не нужен;
//   • языки — «das Griechisch», «das Chinesisch»: названия языков идут без артикля.
// Что отклонено поимённо (BLACKLIST): «einundsiebzig → die Einundsechzig» (модель поменяла
// само число), «einhundert → ein hundert» (пишется слитно), «der Kursteilnehmer →
// der Kurssteilnehmer» (правка вводит опечатку — в другом уроке та же модель предлагает
// обратное, верное), «erzählen von → erzählen» и «sprechen mit → sprechen» (управление
// глагола — ценная часть записи), «die Sprachen → sprechen» (меняет смысл),
// «letztes Jahr → das letzte Jahr» (наречное употребление), «jeden → der jede»,
// «besonderes → das besondere», «lieblings → liebe», «Gebirge → гора».
//
// Вместе с записью правится и то, что от неё зависит: тексты упражнений (карточка,
// диктант, «вставь букву», «выбери ответ» показывают слово как оно записано) и переводы
// на 10 локалей — старый перевод под новым словом хуже, чем отсутствие перевода.
//
// 💸 gpt-4o-mini только на перезапись переводов изменённых слов (~200 записей ≈ $0.02).
// Идемпотентный: правка, которая уже применена, распознаётся и пропускается.
//
//   node scripts/apply-dict-audit-2026-08-23.mjs            # план
//   node scripts/apply-dict-audit-2026-08-23.mjs --apply    # применить
import { db } from '../src/db/index.js'
import { translateWordsToAllLangs, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')
const REPORT = '/tmp/dict-audit-2026-08-23.json'
const BACKUP = '/tmp/apply-dict-audit-rollback-2026-08-23.json'

// Правки, отклонённые при вычитке поимённо (id записи в words)
const BLACKLIST = new Set([
  2063, // «sprechen mit» — валидная запись с управлением, не «не слово»
  2067, // lieblings → liebe: «Lieblings-» это «любимый», а «liebe» — «дорогая»
  2890, // der Kursteilnehmer → der Kurssteilnehmer: правка вводит опечатку
  3578, // die Kursleitnehmerin → die Kursleiterin: меняет смысл (слушательница → руководитель)
  3579, // der Kurssteilnehmer объявлен «формой глагола» — это существительное
  3627, // erzählen von → erzählen: теряется управление глагола
  3891, // sprechen mit → sprechen: то же
  6360, // einundsiebzig → die Einundsechzig: модель поменяла само число
  7546, // einhundert → ein hundert: пишется слитно
  7948, // die Sprachen → sprechen: «языки» и «говорить» — разные слова
  7963, // jeden → der jede
  8116, // besonderes → das besondere
  8119, // besondere → die besonderen
  8124, // Gebirge: «горы» точнее, чем предложенное «гора»
  8438, // letztes Jahr → das letzte Jahr: наречное употребление
])

// Страны и города: средний род идёт без артикля («Polen», «Deutschland», «München»)
const PLACES = /^(polen|deutschland|china|frankreich|england|wales|cardiff|manchester|köln|münchen|griechenland|syrien|europa|österreich|venezuela|bulgarien|ägypten|russland|spanien|italien|portugal|ungarn|rumänien|serbien|kroatien|albanien|indien|japan|kanada|brasilien|mexiko|australien|afrika|asien|amerika)$/i
// Числительные: «dreiundsechzig», «vierundsiebzig», «zehn», «hundert»
const NUMERAL = /(zig|ßig|zehn|hundert|tausend|elf|zwölf|null)$/i
// Названия языков: «Griechisch», «Chinesisch»
const LANGUAGE = /isch$/i

const bare = (s) => String(s || '').replace(/^(der|die|das)\s+/i, '').trim()

function rejectReason(f) {
  if (BLACKLIST.has(f.id)) return 'вычитка: отклонено поимённо'
  if (f.verdict === 'fix' && f.fix_word_de) {
    const from = bare(f.word_de), to = bare(f.fix_word_de)
    const onlyArticle = from.toLowerCase() === to.toLowerCase() && /^(der|die|das)\s/i.test(f.fix_word_de)
    if (onlyArticle && PLACES.test(from)) return 'страна или город — артикль не нужен'
    if (onlyArticle && NUMERAL.test(from)) return 'числительное — артикль не нужен'
    if (onlyArticle && LANGUAGE.test(from)) return 'название языка — артикль не нужен'
  }
  if (f.verdict === 'duplicate_form' && /^[A-ZÄÖÜ]/.test(bare(f.word_de))) {
    return 'запись с большой буквы — существительное, а не форма глагола'
  }
  return null
}

// Слово внутри payload упражнения: карточка показывает question, диктант — word_de,
// «вставь букву» — answer/word_de/masked, «выбери ответ» — слово внутри вопроса.
// Заменяем ТОЛЬКО точные вхождения старой записи, иначе «Blume» затрёт «Blumen».
function patchPayload(payload, oldWord, newWord) {
  if (!payload) return null
  const oldBare = bare(oldWord), newBare = bare(newWord)
  const s = JSON.stringify(payload)
  const re = new RegExp(`(?<![\\p{L}])${oldBare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu')
  const patched = s.replace(re, newBare)
  return patched === s ? null : JSON.parse(patched)
}

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
  const { rows: current } = await db.query(
    'SELECT id, lesson_id, word_de, translation_ru FROM words WHERE id = ANY($1)',
    [report.findings.map(f => f.id)])
  const byId = new Map(current.map(w => [w.id, w]))

  const fixes = [], deletions = [], rejected = [], stale = []
  for (const f of report.findings) {
    if (f.verdict === 'rejected' || f.verdict === 'not_a_word') continue // not_a_word — отдельной задачей
    const w = byId.get(f.id)
    if (!w) continue                                   // запись уже удалена другой чисткой
    if (w.word_de !== f.word_de) { stale.push(f); continue } // словарь изменился после аудита
    const why = rejectReason(f)
    if (why) { rejected.push({ ...f, why }); continue }
    if (f.verdict === 'duplicate_form') deletions.push({ ...f, lesson_id: w.lesson_id })
    else if (f.verdict === 'fix') {
      fixes.push({
        ...f, lesson_id: w.lesson_id,
        new_word: f.fix_word_de || w.word_de,
        new_translation: f.fix_translation_ru || w.translation_ru,
      })
    }
  }

  console.log(`Правок из отчёта: ${report.findings.length}`)
  console.log(`  применяем правку записи: ${fixes.length}`)
  console.log(`  удаляем форму глагола (инфинитив в уроке есть): ${deletions.length}`)
  console.log(`  отклонено вычиткой: ${rejected.length}`)
  console.log(`  устарело (словарь уже поменялся): ${stale.length}`)
  console.log('\nОтклонённые — по причинам:')
  const byWhy = new Map()
  for (const r of rejected) byWhy.set(r.why, (byWhy.get(r.why) || 0) + 1)
  for (const [why, n] of byWhy) console.log(`  ${why}: ${n}`)
  console.log('\nПримеры правок:')
  for (const f of fixes.slice(0, 12)) console.log(`  у${f.lesson_number}: «${f.word_de}»=«${f.translation_ru}» → «${f.new_word}»=«${f.new_translation}»`)
  console.log('\nПримеры удаляемых форм:')
  for (const f of deletions.slice(0, 12)) console.log(`  у${f.lesson_number}: «${f.word_de}» (инфинитив «${f.fix_word_de}»)`)

  if (!APPLY) { console.log('\nЭто ПЛАН. Запусти с --apply, чтобы применить.'); return }

  // Бэкап: изменяемые слова, удаляемые слова и все затронутые упражнения
  const touchedIds = [...fixes.map(f => f.id), ...deletions.map(f => f.id)]
  const { rows: wordsBak } = await db.query('SELECT * FROM words WHERE id = ANY($1)', [touchedIds])
  const { rows: exBak } = await db.query('SELECT * FROM exercises WHERE word_id = ANY($1)', [touchedIds])
  fs.writeFileSync(BACKUP, JSON.stringify({ words: wordsBak, exercises: exBak }, null, 1))
  console.log(`\nБэкап: ${BACKUP} (слов ${wordsBak.length}, упражнений ${exBak.length})`)

  // 1. Правки записей + синхронизация текстов упражнений
  let patchedEx = 0, merged = 0
  const applied = []
  for (const f of fixes) {
    // Исправленная запись уже есть в уроке — это не переименование, а дубль:
    // «Freunden» → «der Freund» при живом «der Freund» в том же уроке. Переименование
    // упёрлось бы в words_lesson_word_key, поэтому лишнюю запись просто убираем.
    const { rows: clash } = await db.query(
      `SELECT id FROM words WHERE lesson_id = $1 AND lower(word_de) = lower($2) AND id <> $3`,
      [f.lesson_id, f.new_word, f.id])
    if (clash.length) {
      await db.query('DELETE FROM words WHERE id = $1', [f.id])
      merged++
      continue
    }
    await db.query(
      `UPDATE words SET word_de = $1, translation_ru = $2, translations = '{}'::jsonb WHERE id = $3`,
      [f.new_word, f.new_translation, f.id])
    applied.push(f)
    if (bare(f.new_word) !== bare(f.word_de)) {
      const { rows: exs } = await db.query('SELECT id, payload FROM exercises WHERE word_id = $1', [f.id])
      for (const e of exs) {
        const patched = patchPayload(e.payload, f.word_de, f.new_word)
        if (!patched) continue
        // payload изменился — старые переводы payload больше не про этот текст
        await db.query(`UPDATE exercises SET payload = $1, payload_translations = '{}'::jsonb WHERE id = $2`,
          [JSON.stringify(patched), e.id])
        patchedEx++
      }
    }
  }
  console.log(`Исправлено записей: ${applied.length}, слито дублей: ${merged}, переписано упражнений: ${patchedEx}`)

  // 2. Формы глаголов — удаляем вместе с их упражнениями (инфинитив остаётся в уроке)
  const { rowCount: deleted } = await db.query('DELETE FROM words WHERE id = ANY($1)',
    [deletions.map(f => f.id)])
  console.log(`Удалено форм: ${deleted}`)

  // 3. Переводы на 10 локалей для изменённых записей — старый перевод под новым словом врёт
  if (applied.length) {
    const { rows: toTranslate } = await db.query(
      'SELECT id, word_de, translation_ru FROM words WHERE id = ANY($1)', [applied.map(f => f.id)])
    const translations = await translateWordsToAllLangs(toTranslate)
    let n = 0
    for (const [id, t] of Object.entries(translations)) {
      await db.query('UPDATE words SET translations = $1 WHERE id = $2', [JSON.stringify(t), Number(id)])
      n++
    }
    console.log(`Переводы обновлены у ${n} записей, потрачено $${usageCostUSD().toFixed(4)}`)
  }

  console.log(`Откат: восстановить из ${BACKUP} (слова и упражнения лежат целиком)`)
  await logOperation({
    kind: 'cleanup', provider: 'openai', model: 'gpt-4o-mini', status: 'ok',
    items: applied.length + deleted + merged, costUsd: Number(usageCostUSD().toFixed(4)),
    message: `Правки словаря по вычитанному аудиту: исправлено ${applied.length}, слито ${merged}, удалено форм ${deleted}, упражнений переписано ${patchedEx}`,
    meta: { script: 'apply-dict-audit-2026-08-23', backup: BACKUP, rejected: rejected.length },
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
