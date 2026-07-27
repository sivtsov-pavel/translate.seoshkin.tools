// Диктант: сверка ответа ученика со словом урока.
//
// В базе часть слов записана несколькими формами через «/»:
//   «die Lehrerin / die Kursleiterin» — два синонима, каждый самодостаточен;
//   «sie/Sie möchten», «er/sie/es hofft» — местоимения с ОБЩИМ хвостом-глаголом.
// Новичку ввести всю строку целиком нереально, поэтому засчитываем ЛЮБУЮ одну
// корректную форму (а также строку целиком — если кто-то всё же впишет всё).

// Срезаем хвост-подсказку в скобках («(z.B.)», «(Wörter)») и лишние пробелы.
export const cleanAnswer = (s) => (s || '')
  .replace(/\s*\([^)]*\)\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// Все формы, которые считаем верным ответом.
// «Kunde/Kundin» → [Kunde, Kundin]
// «er/sie/es hofft» → [er hofft, sie hofft, es hofft]  (хвост «hofft» общий)
export function answerVariants(wordDe) {
  const whole = cleanAnswer(wordDe)
  if (!whole.includes('/')) return [whole]

  const parts = whole.split('/').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return [whole]

  const lastWords = parts[parts.length - 1].split(/\s+/)
  const others = parts.slice(0, -1)
  // Общий хвост есть, если слева от «/» стоят одиночные слова (местоимения),
  // а справа — слово + хвост: «er/sie/es hofft» → хвост «hofft» относится ко всем.
  const sharedTail = lastWords.length > 1 && others.every(p => !/\s/.test(p))

  const variants = sharedTail
    ? [...others, lastWords[0]].map(p => `${p} ${lastWords.slice(1).join(' ')}`)
    : parts

  return [...new Set([whole, ...variants])]
}

// Что диктовать вслух. Синтезатор читает «die Lehrerin / die Kursleiterin» целиком, со слэшем —
// новичок не понимает, что писать. Озвучиваем ОДНУ форму (первую), а засчитываем любую.
export function spokenForm(wordDe) {
  const v = answerVariants(wordDe)
  return v.length > 1 ? v[1] : v[0]
}

// Результат проверки: correct — засчитано; caseHint — буквы верные, но перепутан регистр
// (в немецком существительные с заглавной — тренируемся писать правильно).
export function checkDictation(input, wordDe) {
  const answer   = cleanAnswer(input)
  const variants = answerVariants(wordDe)
  if (!answer) return { correct: false, caseHint: false }

  const correct  = variants.includes(answer)
  const caseHint = !correct && variants.some(v => v.toLowerCase() === answer.toLowerCase())
  return { correct, caseHint }
}
