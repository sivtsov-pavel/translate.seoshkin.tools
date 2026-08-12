// Проверка, что фраза соответствует уровню. Детерминированно, без ИИ.
//
// Зачем кодом, а не просьбой в промпте: слово «A1» модель понимает вольно и на голубом
// глазу выдаёт «Nachdem ich gekocht hatte, esse ich». Вывод из docs/OPERATIONS.md —
// пример в промпте сильнее инструкции, а гарантия нужна ещё сильнее примера.

// Союзы, вводящие придаточное — на A0/A1 их не бывает
const SUBORDINATE = /\b(dass|weil|wenn|obwohl|nachdem|bevor|während|damit|falls|sobald|seitdem|ob)\b/i
// Вспомогательный глагол + причастие рядом = Perfekt
const PERFEKT = /\b(habe|hast|hat|haben|habt|bin|bist|ist|sind|seid)\b[^.!?]*\bge\w+(t|en)\b/i
// Претерит вспомогательных и частых глаголов
const PRAETERITUM = /\b(war|warst|waren|wart|hatte|hattest|hatten|hattet|ging|kam|machte|sagte)\b/i

const LIMITS = {
  A0: { maxWords: 6,  allowSubordinate: false, allowPast: false, allowComma: false },
  A1: { maxWords: 9,  allowSubordinate: false, allowPast: false, allowComma: false },
  A2: { maxWords: 12, allowSubordinate: false, allowPast: true,  allowComma: true  },
  B1: { maxWords: 18, allowSubordinate: true,  allowPast: true,  allowComma: true  },
  B2: { maxWords: 25, allowSubordinate: true,  allowPast: true,  allowComma: true  },
}

export function checkPhraseLevel(text, level = 'A1') {
  const s = String(text || '').trim()
  if (!s) return ['пустая фраза']

  const problems = []
  const lim = LIMITS[level] || LIMITS.A1

  if (!/[.!?]$/.test(s)) problems.push('нет точки в конце')
  if (/[Ѐ-ӿ]/.test(s)) problems.push('кириллица в целевом языке')

  const words = s.split(/\s+/).filter(Boolean)
  if (words.length > lim.maxWords) problems.push(`слишком длинная: ${words.length} слов при пределе ${lim.maxWords}`)
  if (words.length < 3) problems.push('слишком короткая: меньше трёх слов')

  if (!lim.allowSubordinate && SUBORDINATE.test(s)) problems.push('придаточное предложение — не для этого уровня')
  if (!lim.allowComma && s.includes(',')) problems.push('запятая: на этом уровне фраза одна и простая')
  if (!lim.allowPast && (PERFEKT.test(s) || PRAETERITUM.test(s))) problems.push('прошедшее время — не для этого уровня')

  return problems
}

export function isAcceptablePhrase(text, level = 'A1') {
  return checkPhraseLevel(text, level).length === 0
}
