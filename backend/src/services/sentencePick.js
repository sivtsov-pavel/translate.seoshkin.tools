// Подбор реальных предложений урока под конкретную пачку слов.
//
// Предложения со страниц учебника и тетради — главный источник для «Заполни пропуск» и
// «Напиши предложение»: в них живая грамматика урока, а не выдуманная моделью фраза.
// В промпт их влезает ограниченное число, и раньше брались просто ПЕРВЫЕ 40 по порядку.
// На плотном уроке это мимо: в уроке 8 предложений 164, то есть 124 не участвовали вовсе,
// и отсекались они по номеру строки, а не по полезности. Слова из конца урока оставались
// без своих предложений, и модель придумывала им фразы с нуля.
//
// Теперь для каждой пачки слов сначала берём предложения, где эти слова реально есть,
// и только остаток добираем прочими — чтобы модель не осталась без примера стиля урока.
//
// Денег не тратит: обычный отбор строк перед запросом.
import { articleRe } from './articles.js'

// Ключ поиска: слово без артикля, в нижнем регистре. Длинные слова ищем по укороченной
// основе — в немецком и испанском окончание меняется по падежу и лицу («Kinder» → «Kindern»,
// «arbeiten» → «arbeitet»), и точное совпадение теряло бы половину попаданий.
export function matchKey(word, lang = 'de') {
  const bare = String(word || '').trim().toLowerCase().replace(articleRe(lang), '').trim()
  if (!bare) return null
  // Многословные выражения ищем по первому слову: «noch nicht» в предложении может
  // стоять раздельно.
  const first = bare.split(/\s+/)[0]
  return first.length > 5 ? first.slice(0, first.length - 2) : first
}

function mentions(sentence, key) {
  if (!key) return false
  const text = String(sentence || '').toLowerCase()
  // Короткие слова («ich», «du», «uhr») ищем по границе слова: без этого «du» находится
  // внутри «durch», и в подборку лезут предложения, где слова на самом деле нет.
  if (key.length <= 3) return new RegExp(`(^|[^\\p{L}])${key}([^\\p{L}]|$)`, 'u').test(text)
  return text.includes(key)
}

/**
 * @param {string[]} sentences все предложения урока
 * @param {{word_de: string}[]} words пачка слов, для которой генерируем упражнения
 * @param {string} lang язык курса
 * @param {number} limit сколько предложений влезает в промпт
 * @returns {string[]} сначала релевантные пачке, затем остальные — до limit
 */
export function pickSentencesFor(sentences, words, lang = 'de', limit = 40) {
  const all = (sentences || [])
    .map(s => (typeof s === 'string' ? s : s?.text))
    .map(s => String(s || '').trim())
    .filter(Boolean)
  if (all.length <= limit) return all

  const keys = (words || []).map(w => matchKey(w?.word_de ?? w, lang)).filter(Boolean)
  const relevant = []
  const rest = []
  for (const s of all) {
    if (keys.some(k => mentions(s, k))) relevant.push(s)
    else rest.push(s)
  }
  return [...relevant, ...rest].slice(0, limit)
}
