#!/usr/bin/env node
// Починка СЛОВАРЯ — корня ошибок в упражнениях.
//
// Аудит жаловался на упражнения («Ich hoffst auf ein gutes Wetter»), но виновато
// слово: в словаре стоит спрягаемая форма «hoffst» вместо инфинитива «hoffen»,
// и модель честно строит фразу вокруг неё. Чинить упражнение, оставив слово,
// бессмысленно — перегенерация выдаст такую же кривую фразу. Поэтому сначала слова.
//
// Три группы:
//   1. Глаголы в спрягаемой форме (2 л. ед. ч.) → инфинитив + перевод в инфинитив.
//      Таблица составлена вручную: программно «fängst → fangen» даёт неверный
//      результат для сильных глаголов (умлаут: läufst→laufen, nimmst→nehmen),
//      а по переводу видно, что нужен anfangen, а не fangen.
//   2. Противоречивые артикли одного слова в разных уроках (der/das Radiergummi).
//   3. Служебные слова (die, ein, und, ist) — пометка is_function_word.
//      Их нельзя учить карточкой с картинкой: «die = эта» ничего не даёт.
//      Место таких слов — в грамматических упражнениях (артикль, склонение).
//
// ⚠️ Английский курс не трогаем: 'artist', 'breakfast', 'forest', 'past' — там это
//    нормальные слова. Отбор строго по lessons.target_lang = 'de'.
//
// 💸 OpenAI НЕ вызывается — цена $0. Перегенерация упражнений отдельным шагом.
//
//   node scripts/fix-dictionary.mjs            # план
//   node scripts/fix-dictionary.mjs --apply    # починить
import { writeFileSync } from 'fs'
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const ROLLBACK = '/tmp/dictionary-rollback.json'

// Спрягаемая форма → [инфинитив, перевод инфинитивом]
const VERBS = {
  bedeutest:    ['bedeuten',     'означать'],
  besuchst:     ['besuchen',     'посещать, навещать'],
  darfst:       ['dürfen',       'мочь (иметь разрешение)'],
  erzählst:     ['erzählen',     'рассказывать'],
  // перевод «начинаешь» показывает, что слово вырвано из «fängst … an» → anfangen
  fängst:       ['anfangen',     'начинать'],
  gehst:        ['gehen',        'идти'],
  gibst:        ['geben',        'давать'],
  hast:         ['haben',        'иметь'],
  hoffst:       ['hoffen',       'надеяться'],
  kannst:       ['können',       'мочь, уметь'],
  lest:         ['lesen',        'читать'],
  liegst:       ['liegen',       'лежать'],
  liest:        ['lesen',        'читать'],
  löst:         ['lösen',        'решать'],
  machst:       ['machen',       'делать'],
  meldest:      ['melden',       'сообщать, регистрировать'],
  musst:        ['müssen',       'быть должным'],
  nennst:       ['nennen',       'называть'],
  nimmst:       ['nehmen',       'брать'],
  quietschst:   ['quietschen',   'скрипеть, пищать'],
  siehst:       ['sehen',        'видеть'],
  spielst:      ['spielen',      'играть'],
  störst:       ['stören',       'мешать'],
  telefonierst: ['telefonieren', 'звонить по телефону'],
  trinkst:      ['trinken',      'пить'],
  vergesst:     ['vergessen',    'забывать'],
  vergisst:     ['vergessen',    'забывать'],
  wartest:      ['warten',       'ждать'],
  wechselst:    ['wechseln',     'менять'],
  willst:       ['wollen',       'хотеть'],
  zahlst:       ['zahlen',       'платить'],
  zeigst:       ['zeigen',       'показывать'],
  öffnest:      ['öffnen',       'открывать'],
}

// Верный артикль там, где в разных уроках стоят разные
const ARTICLES = { EU: 'die', Radiergummi: 'der', Ring: 'der', Verbot: 'das' }

// Служебные: артикли, местоимения, связки, союзы, отрицание
const FUNCTION_WORDS = ['die', 'der', 'das', 'ein', 'eine', 'und', 'ist', 'sind',
  'nicht', 'auch', 'sie', 'wir', 'ihr', 'mein', 'dein']

const де = `JOIN lessons l ON l.id = w.lesson_id WHERE l.target_lang = 'de'`

// ── Что нашли ────────────────────────────────────────────────────────────────
const { rows: verbs } = await db.query(
  `SELECT w.id, w.word_de, w.translation_ru, w.lesson_id FROM words w ${де}
     AND w.word_de = ANY($1::text[]) ORDER BY w.lesson_id, w.word_de`,
  [Object.keys(VERBS)])

const { rows: arts } = await db.query(
  `SELECT w.id, w.word_de, w.lesson_id FROM words w ${де}
     AND regexp_replace(w.word_de, '^(der|die|das) ', '') = ANY($1::text[])
     AND w.word_de ~ '^(der|die|das) '`,
  [Object.keys(ARTICLES)])
const artFix = arts.filter(r => {
  const base = r.word_de.replace(/^(der|die|das) /, '')
  return !r.word_de.startsWith(ARTICLES[base] + ' ')
})

const { rows: funcs } = await db.query(
  `SELECT w.id, w.word_de, w.lesson_id,
          (SELECT count(*) FROM exercises e WHERE e.word_id = w.id) AS ex
   FROM words w ${де} AND lower(w.word_de) = ANY($1::text[])`, [FUNCTION_WORDS])

console.log(`\nГлаголов в спрягаемой форме: ${verbs.length}`)
verbs.forEach(v => console.log(`   ${v.word_de} (${v.translation_ru}) → ${VERBS[v.word_de][0]} (${VERBS[v.word_de][1]})`))
console.log(`\nНеверных артиклей: ${artFix.length}`)
artFix.forEach(a => console.log(`   ${a.word_de} → ${ARTICLES[a.word_de.replace(/^(der|die|das) /, '')]} ${a.word_de.replace(/^(der|die|das) /, '')}`))
console.log(`\nСлужебных слов: ${funcs.length} (упражнений у них: ${funcs.reduce((s, f) => s + Number(f.ex), 0)})`)

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено, OpenAI не вызывался.`)
  console.log(`  node scripts/fix-dictionary.mjs --apply`)
  process.exit(0)
}

writeFileSync(ROLLBACK, JSON.stringify({ verbs, artFix, funcs }, null, 1))
console.log(`\nОткат записан: ${ROLLBACK}`)

// ── 1. Глаголы ───────────────────────────────────────────────────────────────
// example_sentence гасим: он построен вокруг спрягаемой формы и после смены слова
// станет неверным. Пустой пример перегенерируется штатным ходом.
let fixed = 0, merged = 0
for (const v of verbs) {
  const [inf, ru] = VERBS[v.word_de]
  // В уроке уже может быть правильная форма (или второй спрягаемый близнец:
  // vergesst и vergisst в одном уроке оба дают vergessen). Тогда дубль убираем,
  // а не плодим два одинаковых слова.
  const { rows: dup } = await db.query(
    `SELECT id FROM words WHERE lesson_id = $1 AND lower(word_de) = lower($2) AND id <> $3 LIMIT 1`,
    [v.lesson_id, inf, v.id])
  if (dup.length) {
    await db.query('DELETE FROM exercises WHERE word_id = $1', [v.id])
    await db.query('DELETE FROM words WHERE id = $1', [v.id])
    merged++
    continue
  }
  await db.query(
    `UPDATE words SET word_de = $1, translation_ru = $2,
            example_sentence = NULL, example_sentence_ru = NULL, translations = '{}'::jsonb
     WHERE id = $3`, [inf, ru, v.id])
  fixed++
}

// ── 2. Артикли ───────────────────────────────────────────────────────────────
let artsFixed = 0
for (const a of artFix) {
  const base = a.word_de.replace(/^(der|die|das) /, '')
  await db.query('UPDATE words SET word_de = $1 WHERE id = $2', [`${ARTICLES[base]} ${base}`, a.id])
  artsFixed++
}

// ── 3. Служебные слова ───────────────────────────────────────────────────────
// Помечаем флагом, а упражнения сносим: карточка «die = эта» с картинкой и
// заданием «переведи» ничему не учит и как раз даёт ту бессмыслицу, на которую
// ругался аудит. Эти слова живут в грамматических типах (артикль, склонение),
// они генерируются отдельно и на флаг не смотрят.
const funcIds = funcs.map(f => f.id)
let funcEx = 0
if (funcIds.length) {
  const { rowCount } = await db.query(
    `DELETE FROM exercises WHERE word_id = ANY($1::int[])
       AND type IN ('flashcard','multiple_choice','fill_blank','sentence_write','letter_fill','dictation','speech')`,
    [funcIds])
  funcEx = rowCount
  await db.query('UPDATE words SET is_function_word = true WHERE id = ANY($1::int[])', [funcIds])
}

await logOperation({ kind: 'cleanup', status: 'ok', costUsd: 0,
  message: `Словарь: глаголов ${fixed}, дублей убрано ${merged}, артиклей ${artsFixed}, служебных ${funcIds.length} (снято упражнений ${funcEx})`,
  meta: { rollback: ROLLBACK } }).catch(() => {})

console.log(`\nГотово (OpenAI не вызывался, $0):`)
console.log(`  глаголов исправлено: ${fixed}, дублей убрано: ${merged}`)
console.log(`  артиклей исправлено: ${artsFixed}`)
console.log(`  служебных помечено: ${funcIds.length}, снято мусорных упражнений: ${funcEx}`)
process.exit(0)
