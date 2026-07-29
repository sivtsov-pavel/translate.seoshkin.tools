// Проверка качества материала урока. Чистые функции — без базы и без сети,
// поэтому одна и та же логика работает и в приложении (после генерации урока),
// и в разовом скрипте `scripts/audit-exercises.mjs` по всей базе.
//
// Зачем: 27–28.07.2026 выяснилось, что 600 упражнений «Добавь букву» и 70 «Заполни
// пропуск» были непроходимыми — маска не сходилась с ответом, пропуска не было вовсе.
// Это лежало месяцами и всплывало, только когда на него натыкался живой ученик.
// Теперь урок проверяется сразу после создания, а отчёт уходит в журнал операций.
import { isValidMask } from './letterFill.js'

// Уровни: 'blocker' — пройти невозможно; 'warn' — пройти можно, но учит неверно.
const CORE = ['flashcard', 'fill_blank', 'multiple_choice', 'sentence_write', 'letter_fill']

// Имена собственные диакритикой не выдают язык: «Beyoncé» в немецком упражнении
// «___ singt schön.» — нормальный вариант ответа, а не испанский текст. Пропускаем строки,
// где все слова с заглавной: это имя, название или бренд.
function looksProperNoun(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length || words.length > 3) return false
  return words.every(w => /^[\p{Lu}\p{N}]/u.test(w))
}

// Маркеры «чужого» языка. Испанский курс не должен содержать немецких предложений —
// реальный случай: «Die abeja ist klein» (испанское слово в немецком предложении).
const LANG_MARKERS = {
  de: /[äöüßÄÖÜ]|\b(der|die|das|und|nicht|ich|ist)\b/i,
  es: /[ñáéíóúÑ¿¡]|\b(el|la|los|las|que|con|para|pero)\b/i,
}

// Род по суффиксу. ТОЛЬКО правила без исключений: первая версия обвиняла правильные
// слова («das Papier» по правилу -ier→der, «der Kuchen» по -chen→das, где Kuchen —
// пирог, а не уменьшительное). Правило с исключениями хуже, чем его отсутствие.
const GENDER_RULES = [
  { re: /(ung|heit|keit|schaft|tät)$/i, art: 'die' },
  { re: /lein$/i, art: 'das' },
  { re: /(ling|ismus)$/i, art: 'der' },
]
const MIN_NOUN_LEN = 6
const ART_RE = /^(der|die|das)\s+(.+)$/i

// Текст, который обязан быть на изучаемом языке (перевод на русский сюда не входит).
function targetTexts(ex) {
  const p = ex.payload || {}
  if (ex.type === 'fill_blank') return [p.sentence, p.blank, ...(Array.isArray(p.options) ? p.options : [])]
  if (ex.type === 'sentence_write') return [p.example]
  if (ex.type === 'flashcard') return [p.question]
  return []
}

// Проверка одного упражнения. ex: { id, type, payload, translation_ru, target_lang }
export function checkExercise(ex) {
  const out = []
  const p = ex.payload || {}
  const bad = (level, text) => out.push({ level, kind: ex.type, id: ex.id, text })

  if (ex.type === 'letter_fill') {
    const answer = p.answer || p.word_de
    if (!isValidMask(p.masked, answer)) bad('blocker', `маска «${p.masked}» не сходится с «${answer}»`)
  }

  if (ex.type === 'fill_blank') {
    // Пропуск — ровно «___». Меньше или больше трёх подчёркиваний браузер чинит на лету
    // (frontend/src/utils/fillblank.js), поэтому ученик такое упражнение решит, а вот
    // печатный лист делит строку строго по «___» и молча выбрасывает предложение.
    // Отсюда две разные оценки: пропуска нет вовсе — блокер, пропуск не той длины — замечание.
    const sentence = String(p.sentence || '')
    if (!/_/.test(sentence)) bad('blocker', `нет пропуска: «${sentence}»`)
    else if (!sentence.includes('___')) bad('warn', `пропуск не «___»: «${sentence}» — печатный лист его пропустит`)
    if (!String(p.blank || '').trim()) bad('blocker', 'пустой ответ')
    const opts = Array.isArray(p.options) ? p.options : []
    if (opts.length < 2) bad('blocker', `вариантов ${opts.length}`)
    else if (p.blank && !opts.includes(p.blank)) bad('blocker', `ответа «${p.blank}» нет среди вариантов`)
    if (new Set(opts).size !== opts.length) bad('warn', 'повтор в вариантах')
  }

  if (ex.type === 'multiple_choice') {
    const opts = Array.isArray(p.options) ? p.options : []
    if (opts.length < 2) bad('blocker', `вариантов ${opts.length}`)
    if (!Number.isInteger(p.correct) || p.correct < 0 || p.correct >= opts.length) {
      bad('blocker', `индекс верного ответа ${p.correct} вне списка`)
    }
    if (new Set(opts).size !== opts.length) bad('warn', 'повтор в вариантах')
  }

  if (ex.type === 'flashcard' && (!String(p.question || '').trim() || !String(p.answer || '').trim())) {
    bad('blocker', 'пустой вопрос или ответ')
  }

  if (ex.type === 'conjugation') {
    const missing = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'].filter(k => !String(p.forms?.[k] || '').trim())
    if (missing.length) bad('blocker', `нет форм: ${missing.join(', ')}`)
  }

  if ((ex.type === 'dictation' || ex.type === 'speech') && !String(p.word_de || '').trim()) {
    bad('blocker', 'пустое слово')
  }

  // Язык контента против языка курса
  for (const [code, re] of Object.entries(LANG_MARKERS)) {
    if (code === ex.target_lang) continue
    for (const t of targetTexts(ex)) {
      if (typeof t === 'string' && t && !looksProperNoun(t) && re.test(t)) {
        bad('blocker', `текст не на языке курса (${ex.target_lang}): «${String(t).slice(0, 50)}»`)
        break
      }
    }
  }

  // Вопрос в «выбери ответ» задаётся на изучаемом языке или по-русски — но НЕ на чужом
  // изучаемом. Реальный случай: в английском курсе остался немецкий оборот от старого
  // промпта — «Wie heißt das auf Russisch: grandfather?».
  if (ex.type === 'multiple_choice' && ex.target_lang !== 'de') {
    const q = String(p.question || '')
    if (/\b(wie heißt|auf Russisch|auf Deutsch)\b/i.test(q)) {
      bad('warn', `вопрос по-немецки в курсе «${ex.target_lang}»: «${q.slice(0, 50)}»`)
    }
  }

  // Пример в «напиши предложение» должен быть на изучаемом языке. Кириллица здесь
  // означает, что модель выдала русский вместо целевого языка.
  if (ex.type === 'sentence_write' && /[\u0400-\u04FF]/.test(String(p.example || ''))) {
    bad('warn', `пример по-русски вместо ${ex.target_lang}: «${String(p.example).slice(0, 50)}»`)
  }

  return out
}

// Проверка одного слова. w: { id, word_de, target_lang }
export function checkWord(w) {
  const out = []

  // Само слово на РУССКОМ вместо изучаемого языка. Проверка первая, потому что применима
  // ко всем курсам: в английском уроке «Национальности» лежали «поляк», «Китай», «США» —
  // ученик получал карточку, где и вопрос, и ответ по-русски. Прежние правила смотрели
  // только немецкий род и заглавную букву, и такое проходило мимо аудита.
  if (/[А-Яа-яЁё]/.test(String(w.word_de || ''))) {
    out.push({ level: 'blocker', kind: 'язык', id: w.id, text: `«${w.word_de}» — по-русски вместо ${w.target_lang}` })
    return out
  }

  if (w.target_lang !== 'de') return out
  const m = String(w.word_de || '').match(ART_RE)
  if (!m) return out
  const [, art, noun] = m
  const first = noun.split(/\s+/)[0]

  for (const r of GENDER_RULES) {
    if (first.length >= MIN_NOUN_LEN && r.re.test(first) && art.toLowerCase() !== r.art) {
      out.push({ level: 'warn', kind: 'род', id: w.id, text: `«${w.word_de}» — по суффиксу «${r.art} ${noun}»` })
      break
    }
  }
  // Существительные в немецком с заглавной. Только одиночные слова: в «der beste Freund»
  // строчное слово — прилагательное, и это правильно.
  if (!/\s/.test(noun.trim()) && /^\p{Ll}/u.test(first)) {
    out.push({ level: 'warn', kind: 'заглавная', id: w.id, text: `«${w.word_de}» — со строчной буквы` })
  }
  return out
}

// Полный отчёт по уроку. Принимает уже загруженные строки — сам в базу не ходит.
export function auditLesson({ exercises = [], words = [] } = {}) {
  const issues = [
    ...exercises.flatMap(checkExercise),
    ...words.flatMap(checkWord),
  ]
  const blockers = issues.filter(i => i.level === 'blocker')
  const warns = issues.filter(i => i.level === 'warn')

  // Покрытие: у каждого слова должны быть все основные типы упражнений.
  const byWord = new Map()
  for (const e of exercises) {
    if (!e.word_id) continue
    if (!byWord.has(e.word_id)) byWord.set(e.word_id, new Set())
    byWord.get(e.word_id).add(e.type)
  }
  const uncovered = words.filter(w => CORE.some(t => !byWord.get(w.id)?.has(t)))

  return {
    ok: blockers.length === 0 && uncovered.length === 0,
    blockers, warns, uncovered,
    summary: blockers.length || uncovered.length || warns.length
      ? `блокеров ${blockers.length}, без полного набора упражнений ${uncovered.length}, замечаний ${warns.length}`
      : 'проблем не найдено',
  }
}
