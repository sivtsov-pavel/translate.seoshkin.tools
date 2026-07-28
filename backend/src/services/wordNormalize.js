// Не пускаем в базу мусор и опечатки, пришедшие с распознавания фото.
//
// Два реальных случая с прода:
//   «verb: kochen»      — служебный префикс от модели уехал прямо в слово урока;
//   «Enthschuldigung»   — опечатка распознавания при живом «die Entschuldigung» в том же
//                         уроке. Ученик получал диктант, который нельзя пройти: система
//                         требовала ввести слово с ошибкой.
//
// Логика: сначала срезаем явный мусор, потом сверяем с уже известными словами языка.
// Если нашли почти такое же — берём УЖЕ ПРИНЯТОЕ написание, а не новое.

// Служебные префиксы, которые модель иногда добавляет к слову вместо поля.
const JUNK_PREFIX = /^\s*(verb|noun|adj|adjective|adverb|substantiv|nomen|глагол|существительное|прилагательное)\s*[:.\-–—]\s*/i

export function stripJunk(word) {
  return String(word || '')
    .replace(JUNK_PREFIX, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Расстояние Левенштейна — сколько правок нужно, чтобы получить одно слово из другого.
export function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

// Минимальная длина, при которой различие в одну букву — почти наверняка опечатка,
// а не другое слово. На коротких («Buch»/«Bach», «Haus»/«Maus») так рисковать нельзя.
const MIN_LEN = 8

// Похоже ли `candidate` на опечатку от `known`?
// Ключевая тонкость: различие в ОКОНЧАНИИ — это грамматическая форма, а не ошибка.
// «arbeitet»/«arbeiten» отличаются одной буквой, но это разные формы глагола, и слить
// их было бы грубой ошибкой. Поэтому требуем совпадения начала И конца слова.
export function looksLikeTypo(candidate, known) {
  const a = String(candidate || '').toLowerCase()
  const b = String(known || '').toLowerCase()
  // Дешёвые проверки раньше дорогой: слов в базе тысячи, levenshtein по каждому был бы
  // заметной нагрузкой на каждый импорт урока.
  if (a === b) return false
  if (a.length < MIN_LEN || b.length < MIN_LEN) return false
  if (Math.abs(a.length - b.length) > 1) return false
  // Начало и конец должны совпадать: правка в ОКОНЧАНИИ — это грамматическая форма
  // («arbeitet»/«arbeiten»), а не опечатка.
  if (a.slice(0, 3) !== b.slice(0, 3) || a.slice(-2) !== b.slice(-2)) return false
  return levenshtein(a, b) === 1
}

// Ищет уже принятое написание среди известных слов. Возвращает его или null.
// Артикль у известного слова сохраняем: «Enthschuldigung» → «die Entschuldigung».
export function findAcceptedSpelling(word, knownWords) {
  const ART = /^(der|die|das|ein|eine|el|la|los|las|the)\s+/i
  const core = String(word || '').replace(ART, '').trim()
  if (!core) return null

  const matches = []
  for (const known of knownWords || []) {
    const knownCore = String(known || '').replace(ART, '').trim()
    if (looksLikeTypo(core, knownCore)) matches.push(known)
  }
  if (!matches.length) return null

  // Подходящих эталонов может быть несколько, и среди них попадается свой же мусор
  // (в базе рядом с «die Entschuldigung» лежала строчная «entschuldigung»). Берём
  // самый качественный: с артиклем и с заглавной буквы — для немецкого это норма
  // записи существительного.
  return matches.sort((a, b) =>
    Number(ART.test(b)) - Number(ART.test(a)) ||
    Number(/^\p{Lu}/u.test(b.replace(ART, ''))) - Number(/^\p{Lu}/u.test(a.replace(ART, ''))) ||
    a.length - b.length)[0]
}

// Полная нормализация слова перед записью в базу.
// knownWords — слова этого же изучаемого языка, уже принятые в системе.
export function normalizeIncomingWord(word, knownWords = []) {
  const cleaned = stripJunk(word)
  if (!cleaned) return null                       // пустое — не добавляем вовсе
  return findAcceptedSpelling(cleaned, knownWords) || cleaned
}
