#!/usr/bin/env node
// Аудит упражнений и слов: ищем то, что ученик физически не может пройти,
// и грамматические ошибки, которые видны формально.
//
// Повод: 27–28.07.2026 нашли, что 31% упражнений «Добавь букву» были нерешаемы
// (маска не сходилась с ответом), диктант требовал вводить слова через «/», а в базе
// лежали «verb: kochen» и «Enthschuldigung». Всё это существовало месяцами и всплывало
// только когда на него натыкался живой ученик. Скрипт проверяет ВСЁ разом.
//
// 💸 Ничего не тратит и ничего не меняет: только читает и печатает отчёт.
//
//   node scripts/audit-exercises.mjs            # весь отчёт
//   node scripts/audit-exercises.mjs --lang de  # только один язык
//
import { execFileSync } from 'child_process'
import { isValidMask } from '../backend/src/services/letterFill.js'

const argOf = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const lang = argOf('--lang', null)
const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'

function prodSql(sql) {
  return execFileSync('ssh', [SSH_HOST,
    `cd ${PROD_DIR} && docker compose -f docker-compose.prod.yml exec -T db ` +
    `psql -U german_app -d german_learning -t -A -c ` + JSON.stringify(sql.replace(/\s+/g, ' ').trim()),
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()
}

const langFilter = lang ? `AND l.target_lang = '${lang.replace(/[^a-z]/gi, '')}'` : ''
const rows = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT e.id, e.type, e.payload, e.lesson_id, l.target_lang,
           w.word_de, w.translation_ru
    FROM exercises e
    JOIN lessons l ON l.id = e.lesson_id
    LEFT JOIN words w ON w.id = e.word_id
    WHERE TRUE ${langFilter}) t`))

const words = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT w.id, w.word_de, w.translation_ru, w.lesson_id, l.target_lang
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE TRUE ${langFilter}) t`))

const issues = []
const add = (kind, severity, item, detail) => issues.push({ kind, severity, item, detail })

// ── Упражнения ────────────────────────────────────────────────────────────────
for (const e of rows) {
  const p = e.payload || {}
  const where = `упр#${e.id} урок ${e.lesson_id}`

  if (e.type === 'letter_fill') {
    const answer = p.answer || p.word_de
    if (!isValidMask(p.masked, answer)) add('letter_fill', 'блокер', where, `маска «${p.masked}» не сходится с «${answer}»`)
  }

  if (e.type === 'fill_blank') {
    // Без пропуска упражнение бессмысленно: подставлять некуда.
    if (!String(p.sentence || '').includes('___')) add('fill_blank', 'блокер', where, `нет пропуска: «${p.sentence}»`)
    if (!String(p.blank || '').trim()) add('fill_blank', 'блокер', where, 'пустой ответ (blank)')
    const opts = Array.isArray(p.options) ? p.options : []
    if (opts.length < 2) add('fill_blank', 'блокер', where, `вариантов ${opts.length}`)
    // Правильного ответа нет среди вариантов — выбрать его невозможно.
    else if (p.blank && !opts.includes(p.blank)) add('fill_blank', 'блокер', where, `ответа «${p.blank}» нет в вариантах [${opts.join(', ')}]`)
    if (new Set(opts).size !== opts.length) add('fill_blank', 'важно', where, `повтор в вариантах [${opts.join(', ')}]`)
  }

  if (e.type === 'multiple_choice') {
    const opts = Array.isArray(p.options) ? p.options : []
    if (opts.length < 2) add('multiple_choice', 'блокер', where, `вариантов ${opts.length}`)
    if (!Number.isInteger(p.correct) || p.correct < 0 || p.correct >= opts.length) {
      add('multiple_choice', 'блокер', where, `индекс верного ответа ${p.correct} вне списка из ${opts.length}`)
    } else if (e.translation_ru) {
      // Верный вариант должен совпадать с переводом слова — иначе засчитывается неверное.
      const right = String(opts[p.correct] || '').trim().toLowerCase()
      const tr = String(e.translation_ru).trim().toLowerCase()
      // Сверяем по основе слова: «олива»/«оливка», «также»/«тоже», «занятый»/«занятой» —
      // это синонимы и словоформы, а не ошибка. Ловим только явно другой смысл.
      const stem = (x) => x.replace(/[ёе]/g, 'е').slice(0, Math.max(4, Math.floor(x.length * 0.6)))
      const near = tr.split(/[\/,;(]/)[0].trim()
      const same = [tr, near].some(v => v && (v === right || v.includes(right) || right.includes(v)
        || stem(v) === stem(right)))
      if (right && near && !same) {
        add('multiple_choice', 'важно', where, `верный «${opts[p.correct]}», а слово переводится «${e.translation_ru}»`)
      }
    }
    if (new Set(opts).size !== opts.length) add('multiple_choice', 'важно', where, `повтор в вариантах [${opts.join(', ')}]`)
  }

  if (e.type === 'flashcard') {
    if (!String(p.question || '').trim() || !String(p.answer || '').trim()) add('flashcard', 'блокер', where, 'пустой вопрос или ответ')
  }

  if (e.type === 'sentence_write') {
    if (!String(p.hint_ru || '').trim()) add('sentence_write', 'важно', where, 'нет подсказки')
  }

  if (e.type === 'conjugation') {
    const f = p.forms || {}
    const need = ['ich', 'du', 'er', 'wir', 'ihr', 'sie']
    const missing = need.filter(k => !String(f[k] || '').trim())
    if (missing.length) add('conjugation', 'блокер', where, `нет форм: ${missing.join(', ')} (${p.infinitive})`)
  }

  if ((e.type === 'dictation' || e.type === 'speech') && !String(p.word_de || '').trim()) {
    add(e.type, 'блокер', where, 'пустое слово')
  }
}

// ── Немецкая грамматика: род по суффиксу ──────────────────────────────────────
// Суффиксальные правила в немецком почти безисключительны — на них можно опираться.
// Оставлены только правила, у которых практически нет исключений. Первая версия
// давала ложные срабатывания и обвиняла ПРАВИЛЬНЫЕ слова:
//   -ier → der  ошибочно ловило «das Papier», «das Haustier»
//   -ur  → die  ошибочно ловило «der Flur»
//   -ion → die  ошибочно ловило «der Skorpion» (одушевлённое)
//   -ei/-ie      ловило короткие слова, где это не суффикс: «das Ei»
// Правило без исключений хуже, чем отсутствие правила: оно заставляет чинить исправное.
const MIN_NOUN_LEN = 6   // на коротких словах окончание почти никогда не суффикс
//   -chen → das ошибочно ловило «der Kuchen» (пирог — не уменьшительное) и формы
//                множественного числа «die Sprachen», «die Menschen»
//   -tum  → das ошибочно ловило «der Reichtum»
// Остались только те, где исключений практически нет.
const GENDER_RULES = [
  { re: /(ung|heit|keit|schaft|tät)$/i, art: 'die' },
  { re: /lein$/i, art: 'das' },
  { re: /(ling|ismus)$/i, art: 'der' },
]
const ART_RE = /^(der|die|das)\s+(.+)$/i

for (const w of words) {
  if (w.target_lang !== 'de') continue
  const m = String(w.word_de || '').match(ART_RE)
  if (!m) continue
  const [, art, noun] = m
  const first = noun.split(/\s+/)[0]
  for (const r of GENDER_RULES) {
    if (first.length >= MIN_NOUN_LEN && r.re.test(first) && art.toLowerCase() !== r.art) {
      add('род', 'важно', `слово#${w.id} урок ${w.lesson_id}`,
        `«${w.word_de}» — по суффиксу должно быть «${r.art} ${noun}»`)
      break
    }
  }
  // Существительные в немецком пишутся с заглавной — после артикля строчная это ошибка.
  // Только для одиночных слов: «der beste Freund» — прилагательное, оно строчное законно.
  if (!/\s/.test(noun.trim()) && /^\p{Ll}/u.test(first)) {
    add('заглавная', 'важно', `слово#${w.id} урок ${w.lesson_id}`, `«${w.word_de}» — существительное со строчной буквы`)
  }
}

// ── Отчёт ─────────────────────────────────────────────────────────────────────
const byKind = {}
for (const i of issues) {
  const k = `${i.severity}|${i.kind}`
  ;(byKind[k] ||= []).push(i)
}
console.log(`Проверено: упражнений ${rows.length}, слов ${words.length}${lang ? ` (язык ${lang})` : ''}`)
console.log(`Найдено проблем: ${issues.length}\n`)

for (const sev of ['блокер', 'важно']) {
  const keys = Object.keys(byKind).filter(k => k.startsWith(sev)).sort((a, b) => byKind[b].length - byKind[a].length)
  if (!keys.length) continue
  console.log(sev === 'блокер' ? '🔴 БЛОКЕРЫ — упражнение нельзя пройти' : '🟡 ВАЖНО — можно пройти, но неверно учит')
  for (const k of keys) {
    const list = byKind[k]
    console.log(`\n  ${k.split('|')[1]} — ${list.length}`)
    for (const i of list.slice(0, 8)) console.log(`     ${i.item}: ${i.detail}`)
    if (list.length > 8) console.log(`     … и ещё ${list.length - 8}`)
  }
  console.log()
}
if (!issues.length) console.log('✅ Проблем не найдено.')
