#!/usr/bin/env node
// Точечные правки упражнений по аудиту Fable 13.08.2026 (docs/promt-fable-audit-2026-08-13.md).
//
// Два класса дефектов:
//  1. «Правильный» ответ грамматически неверен (Du + «stört», «vielen Fragen»,
//     «ein große Haus») — ученик выбирает верную форму, а засчитывают ошибку.
//  2. Мусорные фразы («Ich bin rauche nicht», «Wir haben gute gemacht») — не немецкий.
//
// Каждая правка привязана к id и ЖДЁТ конкретного текущего состояния (expect):
// если payload уже другой (правлено руками, перегенерировано) — строка пропускается.
// Повторный запуск ничего не меняет: скрипт идемпотентен.
//
// После правки payload_translations сбрасывается и переводится заново — иначе на
// 9 локалях останется перевод СТАРОЙ (сломанной) фразы.
//
// 💸 OpenAI: только перевод исправленных фраз, gpt-4o-mini, ~50 фраз ≈ $0.001.
//    Без --apply печатает план и не тратит ничего.
//
//   node scripts/fix-audit-fable-2026-08-13.mjs            # план
//   node scripts/fix-audit-fable-2026-08-13.mjs --apply    # починить и перевести
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { translateExercisePayloads, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = '/tmp/audit-fix-rollback.json'

// { id, note, expect: {blank?, sentence?}, set: {sentence?, blank?, options?} }
const FIXES = [
  // ── Порча отделяемого глагола (создана fixAgreement до правки кода) ────────
  { id: 177415, note: 'aufräume → räume (приставка уже в конце)',
    expect: { blank: 'aufräume' },
    set: { blank: 'räume', options: ['räume', 'gesehen', 'angemeldet'] } },

  // ── Ответ учит неверной форме ──────────────────────────────────────────────
  { id: 124248, note: '«Du stört mich» → слово stört = 3 л., чиним подлежащее',
    expect: { sentence: 'Du ___ mich.', blank: 'stört' },
    set: { sentence: 'Er ___ mich.' } },
  { id: 102401, note: '«Du soll das jeden Tag» → слово soll = 3 л. + нужен инфинитив',
    expect: { sentence: 'Du ___ das jeden Tag.', blank: 'soll' },
    set: { sentence: 'Er ___ das jeden Tag machen.' } },
  { id: 124124, note: '«Ein Wort bedeute etwas» → bedeutet',
    expect: { blank: 'bedeute' },
    set: { blank: 'bedeutet' } },
  { id: 123773, note: '«Der Tisch ist Teurer» → teuer (со строчной, без сравнения)',
    expect: { blank: 'Teurer' },
    set: { blank: 'teuer', options: ['teuer', 'teurer', 'billig'] } },
  { id: 174426, note: '«vielen Fragen» → viele (вин. падеж без артикля)',
    expect: { blank: 'vielen' },
    set: { blank: 'viele' } },
  { id: 123711, note: '«beiden Jungen» → beide (без артикля)',
    expect: { blank: 'beiden' },
    set: { blank: 'beide' } },
  { id: 162760, note: '«ein große Haus» → großes',
    expect: { blank: 'große' },
    set: { blank: 'großes', options: ['großes', 'kleines', 'schönes'] } },
  { id: 181031, note: '«eine persönlich Nachricht» → persönliche',
    expect: { blank: 'persönlich' },
    set: { blank: 'persönliche', options: ['persönliche', 'alte', 'neue'] } },
  { id: 176786, note: '«die deutsche Buchstaben» → deutschen (+точка)',
    expect: { blank: 'deutsche' },
    set: { sentence: 'Ich habe gestern die ___ Buchstaben gelernt.',
           blank: 'deutschen', options: ['deutschen', 'englischen', 'spanischen'] } },
  { id: 170475, note: '«Wir stehen auf immer um 8 Uhr» → приставка в конец',
    expect: { blank: 'stehen auf' },
    set: { sentence: 'Wir ___ immer um 8 Uhr auf.', blank: 'stehen',
           options: ['stehen', 'schlafen', 'sitzen'] } },
  { id: 123863, note: '«Er kreuzt an das Bild» → приставка в конец',
    expect: { blank: 'kreuzt an' },
    set: { sentence: 'Er ___ das Bild an.', blank: 'kreuzt',
           options: ['kreuzt', 'schreibt', 'liest'] } },
  { id: 86927, note: '«meinen der Schlüssel» → артикль из ответа убрать',
    expect: { blank: 'der Schlüssel' },
    set: { blank: 'Schlüssel', options: ['Schlüssel', 'Tisch', 'Lampe'] } },
  { id: 170032, note: '«Jeden Monat wechsle das Buch» → потеряно «ich»',
    expect: { sentence: 'Jeden Monat ___ das Buch für meine Freundin.' },
    set: { sentence: 'Jeden Monat ___ ich das Buch für meine Freundin.' } },
  { id: 174456, note: '«Nehme die Tabletten!» → императив Nimm',
    expect: { sentence: 'Nehme die ___!' },
    set: { sentence: 'Nimm die ___!' } },
  { id: 122591, note: '«mit Freunde» → mit Freunden (датив мн.)',
    expect: { sentence: 'Ich war mit Freunde Kaffee ___.' },
    set: { sentence: 'Ich war mit Freunden Kaffee ___.' } },
  { id: 122606, note: '«mit Kinder» → mit den Kindern',
    expect: { sentence: 'Ich habe mit Kinder zuhause ___.' },
    set: { sentence: 'Ich habe mit den Kindern zuhause ___.' } },
  { id: 122601, note: '«mit Kinder» → mit den Kindern (урок 630)',
    expect: { sentence: 'Ich habe mit Kinder ___ gekocht.' },
    set: { sentence: 'Ich habe mit den Kindern ___ gekocht.' } },
  { id: 178264, note: '«Die Substantiv» → Das Substantiv',
    expect: { sentence: 'Die ___ ist ein Wort.' },
    set: { sentence: 'Das ___ ist ein Wort.' } },
  { id: 178579, note: '«Die Tasse steht an dem Tisch» → auf',
    expect: { blank: 'an' },
    set: { blank: 'auf', options: ['auf', 'an', 'in'] } },
  { id: 91755, note: '«Das Buch liegt an dem Tisch» → auf (и убрать «unter» — он тоже верен)',
    expect: { blank: 'an' },
    set: { blank: 'auf', options: ['auf', 'an', 'in'] } },

  // ── Мусорные фразы ─────────────────────────────────────────────────────────
  { id: 176702, note: '«Ich bin rauche nicht» (слово dürfen) → фраза про dürfen',
    expect: { sentence: 'Ich bin ___ nicht.' },
    set: { sentence: 'Ich ___ hier nicht rauchen.', blank: 'darf',
           options: ['darf', 'darfst', 'dürfen'] } },
  { id: 177000, note: '«Ich bin rauche nicht» (слово rauchen) → «Ich rauche nicht»',
    expect: { sentence: 'Ich bin ___ nicht.' },
    set: { sentence: 'Ich ___ nicht.' } },
  { id: 176930, note: '«Ich liebe sind lecker» → «Ich liebe dich»',
    expect: { sentence: 'Ich ___ sind lecker.' },
    set: { sentence: 'Ich ___ dich.' } },
  { id: 176960, note: '«Wir haben gute gemacht» → «Wir haben das gestern gemacht»',
    expect: { sentence: 'Wir haben gute ___.' },
    set: { sentence: 'Wir haben das gestern ___.' } },
  { id: 176870, note: '«Heute Abend ich schlafen» → порядок слов + личная форма',
    expect: { sentence: 'Heute Abend ich ___.' },
    set: { sentence: 'Heute Abend ___ ich.', blank: 'schlafe',
           options: ['schlafe', 'gehe', 'esse'] } },
  { id: 176752, note: '«Schreiben Sie _ie ih i» → осмысленная фраза',
    expect: { sentence: '___ Sie _ie ih i.' },
    set: { sentence: '___ Sie bitte Ihren Namen.', options: ['Schreiben', 'Essen', 'Trinken'] } },
  { id: 176804, note: '«Das Schlüssel» → Den (вин. м.р.)',
    expect: { sentence: 'Das ___ nicht vergessen.' },
    set: { sentence: 'Den ___ nicht vergessen.' } },
  { id: 176805, note: '«Das Schlüssel» → Den (вин. м.р.)',
    expect: { sentence: 'Das Schlüssel nicht ___.' },
    set: { sentence: 'Den Schlüssel nicht ___.' } },
  { id: 177035, note: '«Kannst du mit mir eine Apfelschorle gehen» → фраза про mitnehmen',
    expect: { blank: 'mit' },
    set: { sentence: 'Kannst du die Tasche für mich ___?', blank: 'mitnehmen',
           options: ['mitnehmen', 'mitgehen', 'mitkommen'] } },
  { id: 124299, note: '«eine Apfelschorle gehen» → mitbringen',
    expect: { sentence: 'Kannst du mit mir bitte eine ___ gehen?' },
    set: { sentence: 'Kannst du mir bitte eine ___ mitbringen?' } },
  { id: 176855, note: '«Ich brauche nach Hause gehen» → muss',
    expect: { sentence: 'Ich brauche nach Hause ___.' },
    set: { sentence: 'Ich muss nach Hause ___.' } },
  { id: 176687, note: '«Sehen Sie die Bilder anschauen» → фраза под инфинитив',
    expect: { sentence: 'Sehen Sie die Bilder ___.' },
    set: { sentence: 'Ich möchte die Bilder ___.' } },
  { id: 177235, note: 'мусор «Links und Rechts die …» → фраза про stören',
    expect: { blank: 'Störung' },
    set: { sentence: 'Bitte ___ Sie mich nicht!', blank: 'stören',
           options: ['stören', 'störst', 'stört'] } },
  { id: 177185, note: '«Ich suche die ... Straße» (слово achten) → фраза про achten',
    expect: { blank: 'Straße' },
    set: { sentence: 'Bitte ___ Sie auf den Verkehr.', blank: 'achten',
           options: ['achten', 'achtet', 'achtest'] } },
  { id: 124223, note: '«Kannst du mir bitte zuvor Flaschenöffner?» → осмысленная фраза',
    expect: { sentence: 'Kannst du mir bitte zuvor ___?' },
    set: { sentence: 'Ich öffne die Flasche mit dem ___.' } },
  { id: 170490, note: '«Ich habe gesehensehen» → пропуск тренирует приставку ge-',
    expect: { blank: 'gesehen' },
    set: { blank: 'ge', options: ['ge', 'ver', 'be'] } },
  { id: 170499, note: 'пропуска нет вовсе → буквенный пропуск в fängt',
    expect: { sentence: 'Wann fängt der Unterricht an?' },
    set: { sentence: 'Wann fä___t der Unterricht an?' } },
  { id: 162710, note: 'двойной пропуск «___ ___» → одинарный',
    expect: { sentence: 'Ich bin im Urlaub gewesen ___ ___!' },
    set: { sentence: 'Ich war ___ im Urlaub!' } },
  { id: 162750, note: '«spricht deutsche Englisch» → «die deutsche Sprache»',
    expect: { sentence: 'Mein Freund spricht ___ Englisch und Französisch.' },
    set: { sentence: 'Er spricht die ___ Sprache.' } },
  { id: 176768, note: '«Die g_lben ___ lecker» → полная фраза',
    expect: { sentence: 'Die g_lben ___ lecker.' },
    set: { sentence: 'Die gelben Äpfel ___ lecker.', options: ['sind', 'ist', 'seid'] } },

  // ── Регистр и мелкая грамматика ────────────────────────────────────────────
  { id: 86548, note: '«Ich esse kuchen» → Kuchen (существительное с заглавной)',
    expect: { blank: 'kuchen' },
    set: { blank: 'Kuchen', options: ['Kuchen', 'mehr', 'Kunde'] } },
  { id: 170350, note: '«mit dem kuchenessen» → Kuchenessen',
    expect: { blank: 'kuchenessen' },
    set: { blank: 'Kuchenessen', options: ['Kuchenessen', 'Essen', 'Trinken'] } },
  { id: 86374, note: '«Das Bild ist Vertikaler» → vertikal (слово чинится отдельно ниже)',
    expect: { blank: 'Vertikaler' },
    set: { blank: 'vertikal', options: ['vertikal', 'horizontal', 'schief'] } },
  { id: 102496, note: '«das Richtige Verb» → richtige (прилагательное со строчной)',
    expect: { blank: 'Richtige Verb' },
    set: { blank: 'richtige Verb', options: ['richtige Verb', 'richtiges Buch', 'richtige Antwort'] } },
  { id: 124318, note: '«einen Ö» → ein Ö (das Ö)',
    expect: { sentence: 'Das Wort hat einen ___.' },
    set: { sentence: 'Das Wort hat ein ___.' } },

  // ── Опечатки в дистракторах (несуществующие формы на кнопках) ──────────────
  { id: 177090, note: 'дистрактор «übsetzt» → übersetzt',
    expect: { blank: 'übersetzen' },
    set: { options: ['übersetzen', 'übersetzt', 'backst'] } },
  { id: 176798, note: 'дистрактор «verbindenen» → verbindet',
    expect: { blank: 'verbinden' },
    set: { options: ['verbinden', 'verbinde', 'verbindet'] } },
  { id: 176763, note: 'дистрактор «sehenen» → Seht',
    expect: { blank: 'Sehen' },
    set: { options: ['Sehen', 'Sieht', 'Seht'] } },
  { id: 177010, note: 'дистрактор «s Suche» → нормальные формы',
    expect: { blank: 'Brauchen' },
    set: { options: ['Brauchen', 'Suchen', 'Putzen'] } },
  { id: 177375, note: 'дистрактор «loese» → löse',
    expect: { blank: 'melde' },
    set: { options: ['melde', 'löse', 'gehe'] } },
]

// Несуществующее слово в словаре: «der Vertikaler» → «vertikal»
const WORD_FIXES = [
  { match: 'der Vertikaler', word_de: 'vertikal', translation_ru: 'вертикальный' },
]

// ── План ─────────────────────────────────────────────────────────────────────
const ids = FIXES.map(f => f.id)
const { rows } = await db.query(
  `SELECT e.id, e.lesson_id, e.payload FROM exercises e WHERE e.id = ANY($1::int[])`, [ids])
const byId = new Map(rows.map(r => [r.id, r]))

const todo = [], done = [], skipped = []
for (const f of FIXES) {
  const row = byId.get(f.id)
  if (!row) { skipped.push({ ...f, why: 'упражнение не найдено' }); continue }
  const p = row.payload || {}
  const already = Object.entries(f.set).every(([k, v]) => JSON.stringify(p[k]) === JSON.stringify(v))
  if (already) { done.push(f); continue }
  const matches = Object.entries(f.expect).every(([k, v]) => String(p[k] ?? '').trim() === v)
  if (!matches) { skipped.push({ ...f, why: `состояние не совпало (blank=«${p.blank}»)`, lesson: row.lesson_id }); continue }
  todo.push({ ...f, lesson: row.lesson_id, before: p, after: { ...p, ...f.set } })
}

console.log(`\nПравок в списке: ${FIXES.length}; к применению: ${todo.length}; уже исправлено: ${done.length}; пропущено: ${skipped.length}`)
todo.forEach(f => console.log(`  ✔ урок ${f.lesson} #${f.id}: ${f.note}`))
skipped.forEach(f => console.log(`  ⚠ #${f.id}: ${f.why} — ${f.note}`))

const { rows: badWords } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = 'de' AND w.word_de = ANY($1::text[])`, [WORD_FIXES.map(w => w.match)])
badWords.forEach(w => console.log(`  ✔ слово #${w.id}: «${w.word_de}» → «${WORD_FIXES.find(f => f.match === w.word_de).word_de}»`))

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено, OpenAI не вызывался.`)
  console.log(`  node scripts/fix-audit-fable-2026-08-13.mjs --apply`)
  process.exit(0)
}

// ── Применение ───────────────────────────────────────────────────────────────
writeFileSync(ROLLBACK, JSON.stringify({ exercises: todo.map(t => ({ id: t.id, payload: t.before })), words: badWords }, null, 1))
console.log(`\nОткат записан: ${ROLLBACK} (забрать из контейнера сразу!)`)

for (const f of todo) {
  // Перевод сбрасываем: на 9 локалях лежит перевод старой (сломанной) фразы
  await db.query(`UPDATE exercises SET payload = $1, payload_translations = '{}'::jsonb WHERE id = $2`,
    [JSON.stringify(f.after), f.id])
}
for (const w of badWords) {
  const fix = WORD_FIXES.find(f => f.match === w.word_de)
  await db.query(
    `UPDATE words SET word_de = $1, translation_ru = $2, translations = '{}'::jsonb,
            example_sentence = NULL, example_sentence_ru = NULL WHERE id = $3`,
    [fix.word_de, fix.translation_ru, w.id])
}

// ── Перевод исправленных фраз на локали (gpt-4o-mini, ~$0.001) ───────────────
let translated = 0
const fresh = (await db.query(
  `SELECT id, type, payload FROM exercises WHERE id = ANY($1::int[]) AND type = 'fill_blank'`,
  [todo.map(t => t.id)])).rows
for (let i = 0; i < fresh.length; i += 15) {
  try {
    const results = await translateExercisePayloads(fresh.slice(i, i + 15))
    for (const [id, langs] of Object.entries(results)) {
      await db.query(`UPDATE exercises SET payload_translations = COALESCE(payload_translations,'{}'::jsonb) || $1::jsonb WHERE id = $2`,
        [JSON.stringify(langs), parseInt(id)])
      translated++
    }
  } catch (e) { console.error(`перевод батча ${i}: ${e.message}`) }
}

await logOperation({ kind: 'cleanup', status: 'ok', provider: 'openai', model: 'gpt-4o-mini', costUsd: usageCostUSD(),
  message: `Аудит 13.08: исправлено упражнений ${todo.length}, слов ${badWords.length}, переведено ${translated}`,
  items: todo.length, meta: { rollback: ROLLBACK } }).catch(() => {})

console.log(`\nГотово: упражнений исправлено ${todo.length}, слов ${badWords.length}, переведено на локали ${translated}`)
process.exit(0)
