// Починка «Заполни пропуск», когда правильного ответа нет среди вариантов.
//
// Такое упражнение пройти нельзя в принципе — ученик перебирает варианты, и ни один не
// засчитывается. Аудит помечает это блокером.
//
// Живой случай из урока 18:
//   предложение «Ich ___ die Tür.», ответ «schließen», варианты [schließe, öffne, verstehe]
// Модель положила в ответ СЛОВАРНУЮ форму (инфинитив), а в варианты — ту, что реально нужна
// в предложении («ich schließe»). Правильный вариант на экране есть, но не засчитывается.
//
// Поэтому чиним по порядку:
//  1) среди вариантов есть форма того же слова — она и есть верный ответ, берём её;
//  2) похожей формы нет — добавляем ответ в варианты, чтобы упражнение хотя бы решалось.

// Общее начало двух слов: у «schließen»/«schließe» — 8 символов.
function commonPrefix(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/** Похожи ли слова как формы одного слова (а не просто как соседи по алфавиту). */
export function isSameWordForm(a, b) {
  const x = String(a || '').trim().toLowerCase()
  const y = String(b || '').trim().toLowerCase()
  if (!x || !y || x === y) return x === y && !!x
  const shorter = Math.min(x.length, y.length)
  // Короткие слова не трогаем: у «der»/«den» общее начало 2 из 3, но это разные слова.
  if (shorter < 4) return false
  const common = commonPrefix(x, y)
  // Двух условий мало: у «Kind»/«Kino» общее начало 3 из 4 и одинаковая длина — по
  // «отличаются хвостом» они прошли бы как формы одного слова, и верный ответ подменился
  // бы чужим словом (поймал тест). Поэтому общая часть должна быть ещё и существенной.
  return common >= 4 && common >= shorter - 2 && Math.abs(x.length - y.length) <= 3
}

/**
 * Возвращает исправленный payload или исходный, если чинить нечего.
 * @param {{sentence?: string, blank?: string, options?: string[]}} payload
 */
export function fixFillBlank(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const options = Array.isArray(payload.options) ? payload.options.filter(o => typeof o === 'string') : []
  const blank = String(payload.blank || '').trim()
  if (!blank || options.length < 2) return payload
  if (options.some(o => o.trim() === blank)) return payload

  const form = options.find(o => isSameWordForm(o, blank))
  if (form) return { ...payload, blank: form.trim() }
  return { ...payload, options: [...options, blank] }
}

// Пропуск в предложении вовсе не поставлен: «Heute ist ein schöner Tag.» при ответе «heute».
// Ученик видит целую фразу и не понимает, куда писать — аудит помечает это блокером.
// Слово в предложении есть, значит упражнение спасается: ставим на него пропуск.
export function ensureBlank(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const sentence = String(payload.sentence || '')
  if (!sentence || sentence.includes('___')) return payload
  const blank = String(payload.blank || '').trim()
  if (!blank) return payload
  const re = new RegExp(`(^|[^\\p{L}])(${blank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([^\\p{L}]|$)`, 'iu')
  const m = sentence.match(re)
  if (!m) return payload
  const form = m[2]
  // Ответом становится форма ИЗ предложения («Heute» с заглавной), поэтому её нужно
  // подставить и в варианты: иначе ответа не окажется среди них и упражнение снова
  // станет непроходимым — ровно это и вышло при первом заходе.
  const options = Array.isArray(payload.options)
    ? payload.options.map(o => String(o).trim().toLowerCase() === form.toLowerCase() ? form : o)
    : payload.options
  return { ...payload, sentence: sentence.replace(form, '___'), blank: form, options }
}

// Один и тот же вариант дважды: выбор превращается в угадайку, а «правильных» кнопок две.
export function dedupeOptions(payload) {
  if (!payload || !Array.isArray(payload.options)) return payload
  const seen = new Set()
  const options = []
  for (const o of payload.options) {
    const k = String(o).trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k); options.push(String(o).trim())
  }
  if (options.length === payload.options.length) return payload
  if (options.length < 2) return payload // чинить нечем — это другой дефект
  const next = { ...payload, options }
  // У «выбери ответ» правильный задан ИНДЕКСОМ — после удаления дубля он бы уехал.
  if (Number.isInteger(payload.correct)) {
    const right = payload.options[payload.correct]
    const idx = options.findIndex(o => o.trim().toLowerCase() === String(right).trim().toLowerCase())
    next.correct = idx >= 0 ? idx : 0
  }
  return next
}
