// Посадка упражнений на РЕАЛЬНЫЕ предложения урока.
//
// Промпт просит модель брать фразы со страниц учебника и тетради, но это просьба, и модель
// её regularly игнорирует: замер по уроку 19 показал 5% упражнений на реальных фразах при
// потолке в 33% (у 22 слов из 66 своя фраза в конспекте есть). Просьбу заменяем действием:
// если для слова в уроке есть живое предложение, подставляем его кодом.
//
// Зачем: в реальной фразе грамматика урока — падеж, порядок слов, спряжение, которое класс
// разбирал. Придуманная моделью фраза грамматически верна, но это уже не материал урока.
//
// Денег не тратит: работа со строками после генерации.
import { articleRe } from './articles.js'
import { conjugatePresent } from './germanConjugator.js'

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function matchWhole(sentence, form) {
  const m = String(sentence || '').match(new RegExp(`(^|[^\\p{L}])(${escape(form)})([^\\p{L}]|$)`, 'iu'))
  return m ? m[2] : null
}

// Слово в предложении стоит в своей форме: «Straße» → «die Straße», «sprechen» → «sprichst».
// Ищем и возвращаем то, что реально нашли в тексте.
function findForm(sentence, word, lang) {
  const bare = String(word || '').trim().toLowerCase().replace(articleRe(lang), '').trim()
  if (bare.length < 3) return null

  // Сильные немецкие глаголы меняют КОРЕНЬ: «sprechen» → «du sprichst», «fahren» → «du fährst».
  // Поиск по основе их не найдёт, поэтому берём готовые формы из спрягателя — он уже есть
  // в проекте и покрыт своими тестами. Глаголы в уроках самая частая часть речи, терять их
  // жалко: именно на них живая грамматика урока.
  if (lang === 'de' && /(en|ern|eln)$/.test(bare)) {
    try {
      for (const form of Object.values(conjugatePresent(bare) || {})) {
        const hit = matchWhole(sentence, form)
        if (hit) return hit
      }
    } catch { /* не глагол — идём дальше по основе */ }
  }

  const stem = bare.length > 5 ? bare.slice(0, bare.length - 2) : bare
  const m = String(sentence || '').match(new RegExp(`(^|[^\\p{L}])(${escape(stem)}\\p{L}{0,3})([^\\p{L}]|$)`, 'iu'))
  return m ? m[2] : null
}

// Годится ли строка как основа упражнения. Проверка обязательна: в lesson_sentences попадает
// не только чистая речь со страницы, но и мусор распознавания. Живые примеры из урока 5:
//   «Bist du Raucher? (Are you a smoker?)»        — английский перевод в скобках;
//   «Die Pause ist vorbei oder fertig. — Перерыв закончен.» — русский перевод через тире;
//   «die Dose»                                     — обрывок в два слова.
// Подставь такое — и упражнение станет хуже, чем выдуманное моделью.
export function isUsableSentence(raw, maxWords = 16) {
  const text = String(typeof raw === 'string' ? raw : raw?.text || '').trim()
  if (!text) return false
  const words = text.split(/\s+/).filter(Boolean)
  // Меньше четырёх слов — после пропуска не останется контекста, по которому можно догадаться.
  // Верхняя граница щедрая: строка во всю ширину страницы — нормальная фраза урока,
  // отбрасываем только то, что явно длиннее записанного от руки предложения.
  if (words.length < 4 || words.length > maxWords) return false
  if (/[А-Яа-яЁё]/.test(text)) return false          // перевод затесался в текст
  if (/[()\[\]]/.test(text)) return false            // «(Are you a smoker?)»
  if (/\s[—–-]\s/.test(text)) return false           // «фраза — перевод»
  if (/[:;]\s*$/.test(text)) return false            // заголовок задания, а не фраза
  return true
}

/**
 * Пересобирает fill_blank на реальном предложении урока, если оно есть.
 * @returns {object} новый payload или исходный, если подходящей фразы нет
 */
export function groundFillBlank(payload, sentences, lang = 'de', maxWords = 16) {
  if (!payload || typeof payload !== 'object') return payload
  const word = String(payload.blank || payload.word_de || '').trim()
  if (!word) return payload
  const options = Array.isArray(payload.options) ? payload.options.filter(o => typeof o === 'string') : []
  if (options.length < 2) return payload

  for (const raw of (sentences || [])) {
    if (!isUsableSentence(raw, maxWords)) continue
    const text = String(typeof raw === 'string' ? raw : raw?.text || '').trim()
    const form = findForm(text, word, lang)
    if (!form) continue
    // Пропуск ставим на найденную форму — ровно один раз, первое вхождение.
    const sentence = text.replace(form, '___')
    if (!sentence.includes('___')) continue
    // Верный ответ — та форма, что стояла в предложении, иначе ответ не сойдётся с текстом.
    const rest = options.filter(o => o.trim().toLowerCase() !== word.toLowerCase()).slice(0, 2)
    return { ...payload, sentence, blank: form, options: [form, ...rest] }
  }
  return payload
}

/**
 * Подставляет реальное предложение как образец в «Напиши предложение».
 */
export function groundSentenceWrite(payload, sentences, lang = 'de', maxWords = 16) {
  if (!payload || typeof payload !== 'object') return payload
  const word = String(payload.word_de || '').trim()
  if (!word) return payload
  for (const raw of (sentences || [])) {
    if (!isUsableSentence(raw, maxWords)) continue
    const text = String(typeof raw === 'string' ? raw : raw?.text || '').trim()
    if (!findForm(text, word, lang)) continue
    return { ...payload, example: text }
  }
  return payload
}
