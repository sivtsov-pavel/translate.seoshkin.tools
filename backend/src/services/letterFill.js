// Упражнение «Добавь букву»: маска слова с пропущенными буквами.
//
// Маску придумывает модель, и она регулярно её ломает — проверено на локальной qwen3:
//   masked "wünshe_n" при answer "wünschen" (потерялась «c»)
//   masked "ich _n"   при answer "ich bin"  (длины вообще разные)
// Такое упражнение невыполнимо: подставь букву — слово всё равно не сойдётся.
// Валидации не было ни в одном из путей генерации, поэтому брак уезжал прямо в базу.
//
// Решение: маску ПРОВЕРЯЕМ, а битую строим сами — детерминированно, без ИИ и без денег.

// Артикли изучаемых языков — их не маскируем, ученик тренирует само слово.
const ARTICLE_RE = /^(der|die|das|ein|eine|el|la|los|las|le|les|the)\s+/i

// Маска валидна, если её можно «дозаполнить» до ответа: та же длина, все открытые
// символы совпадают, есть хотя бы одна дырка — и открытой осталась хотя бы треть букв.
// Порог по доле, а не жёсткое «1–2 буквы»: на проде почти 300 нормальных упражнений
// имеют 3–4 дырки («d__i__g» из «dreißig» решается), переделывать их незачем.
// А «H___» из «Hund» — уже угадайка, а не упражнение.
export function isValidMask(masked, answer) {
  if (typeof masked !== 'string' || typeof answer !== 'string') return false
  if (!masked || !answer || masked.length !== answer.length) return false
  let holes = 0, letters = 0
  for (let i = 0; i < answer.length; i++) {
    if (/\p{L}/u.test(answer[i])) letters++
    if (masked[i] === '_') { holes++; continue }
    if (masked[i] !== answer[i]) return false
  }
  return holes >= 1 && holes * 3 <= letters * 2
}

// Строим маску сами: артикль не трогаем, первую и последнюю буквы слова оставляем видимыми,
// прячем 1–2 буквы внутри. Детерминированно — один и тот же ответ даёт одну и ту же маску.
export function buildMask(answer) {
  if (typeof answer !== 'string' || !answer.trim()) return null
  const m = answer.match(ARTICLE_RE)
  const prefix = m ? m[0] : ''
  const core = [...answer.slice(prefix.length)]
  // Кандидаты на пропуск — буквы внутри слова (не первая, не последняя, не пробел/дефис)
  const idx = []
  for (let i = 1; i < core.length - 1; i++) if (/\p{L}/u.test(core[i])) idx.push(i)
  if (!idx.length) return null
  const picks = new Set([idx[Math.floor(idx.length / 2)]])
  if (core.length >= 7 && idx.length >= 3) picks.add(idx[Math.floor(idx.length / 4)])
  for (const i of picks) core[i] = '_'
  return prefix + core.join('')
}

// Приводит payload упражнения letter_fill в рабочий вид.
// Возвращает исправленный payload либо null, если слово замаскировать нечем (2 буквы и т.п.).
export function normalizeLetterFill(payload) {
  if (!payload) return null
  const answer = String(payload.answer || payload.word_de || '').trim()
  if (!answer) return null
  if (isValidMask(payload.masked, answer)) return { ...payload, answer }
  const masked = buildMask(answer)
  if (!masked) return null
  return { ...payload, answer, masked }
}
