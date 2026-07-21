// Нормализация fill_blank: убираем «двойной артикль».
// Причина бага: генератор часто кладёт в blank слово С артиклем («die Arztvisite»).
// Это корректно, когда перед пропуском стоит глагол/предлог («Er ist ___ der Gruppe» → «der Leiter»),
// но ломается, если перед ___ уже есть детерминатив («Die ___», «Meine ___», «zwei ___») —
// выходит «Die die Arztvisite». В немецком два детерминатива подряд недопустимы.
// Решение: если слово перед ___ — детерминатив, в пропуске оставляем ГОЛОЕ слово (без артикля),
// синхронно чистим и варианты-подсказки, чтобы сравнение ответа осталось консистентным.

// Детерминативы, после которых идёт существительное без своего артикля.
const DETERMINERS = new Set([
  // определённые артикли
  'der', 'die', 'das', 'den', 'dem', 'des',
  // неопределённые
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  // отрицание
  'kein', 'keine', 'keinen', 'keinem', 'keiner',
  // притяжательные
  'mein', 'meine', 'meinen', 'meinem', 'meiner',
  'dein', 'deine', 'deinen', 'deinem', 'deiner',
  'sein', 'seine', 'seinen', 'seinem', 'seiner',
  'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer',
  'unser', 'unsere', 'unseren', 'unserem', 'unserer',
  'euer', 'eure', 'euren', 'eurem', 'eurer',
  // указательные
  'dieser', 'diese', 'dieses', 'diesen', 'diesem',
  // числительные/кванторы
  'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'viele', 'einige', 'beide', 'mehrere',
])

// Ведущий артикль в самом слове пропуска/варианте
const LEADING_ARTICLE = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+(.+)$/i

function stripLeadingArticle(word) {
  if (typeof word !== 'string') return word
  const m = word.match(LEADING_ARTICLE)
  return m ? m[2] : word
}

// Возвращает payload с исправленными blank/options (или исходный, если чинить нечего).
export function normalizeFillBlank(payload) {
  if (!payload || typeof payload.sentence !== 'string') return payload
  const idx = payload.sentence.indexOf('___')
  if (idx < 0) return payload

  const before = payload.sentence.slice(0, idx).trim()
  // Последнее слово перед пропуском (без пунктуации), в нижнем регистре
  const lastWord = (before.split(/\s+/).pop() || '')
    .replace(/[^A-Za-zÄÖÜäöüß]/g, '')
    .toLowerCase()

  // Пропуск в начале предложения или после не-детерминатива → артикль в blank уместен, не трогаем
  if (!DETERMINERS.has(lastWord)) return payload

  const newBlank = stripLeadingArticle(payload.blank)
  if (newBlank === payload.blank) return payload // артикля в blank не было — нечего чинить

  const newOptions = Array.isArray(payload.options)
    ? payload.options.map(stripLeadingArticle)
    : payload.options

  return { ...payload, blank: newBlank, options: newOptions }
}
