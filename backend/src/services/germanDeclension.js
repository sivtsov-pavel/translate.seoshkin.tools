// Склонение немецкого существительного по четырём падежам — rule-based, без OpenAI.
//
// Зачем: спряжение (conjugation) есть только у глаголов, их в базе 317 против 1029
// существительных. Из-за этого в уроке оказывалось одно-два упражнения «Склонение»,
// хотя склоняемых слов там десяток.
//
// Что НЕ делаем сознательно:
//   • множественное число — оно в немецком нерегулярно (Buch→Bücher, Tisch→Tische,
//     Auto→Autos), правилом не выводится, а учить неверной форме хуже, чем не учить;
//   • слабое склонение мужского рода на -e (der Kunde → den Kunden) — слишком много
//     исключений, такие слова пропускаем.
// Правило проекта: лучше нет упражнения, чем упражнение с неверными формами.

const ARTICLES = new Set(['der', 'die', 'das'])

// Родительный падеж: -es после шипящих, -s в остальных случаях.
// Односложные тоже чаще берут -es (des Hauses, des Kindes).
function genitiveSuffix(noun) {
  const w = noun.toLowerCase()
  if (/(s|ß|z|x|tz|sch)$/.test(w)) return 'es'
  // Односложное (одна гласная группа) → -es, многосложное → -s
  const syllables = (w.match(/[aeiouäöüy]+/g) || []).length
  return syllables <= 1 ? 'es' : 's'
}

export function isDeclinableNoun(wordDe) {
  const s = String(wordDe || '').trim()
  if (!s || s.includes('/')) return false
  const parts = s.split(/\s+/)
  if (parts.length !== 2) return false
  const [article, noun] = parts
  if (!ARTICLES.has(article.toLowerCase())) return false
  if (!/^[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ-]+$/.test(noun)) return false
  // Слабое склонение мужского рода на -e — пропускаем (der Kunde → den Kunden)
  if (article.toLowerCase() === 'der' && /e$/.test(noun)) return false
  return true
}

export function declineNoun(wordDe) {
  if (!isDeclinableNoun(wordDe)) return null
  const [articleRaw, noun] = String(wordDe).trim().split(/\s+/)
  const article = articleRaw.toLowerCase()

  if (article === 'die') {
    return {
      article, noun,
      nom: `die ${noun}`, akk: `die ${noun}`, dat: `der ${noun}`, gen: `der ${noun}`,
    }
  }

  const gen = `des ${noun}${genitiveSuffix(noun)}`
  if (article === 'der') {
    return { article, noun, nom: `der ${noun}`, akk: `den ${noun}`, dat: `dem ${noun}`, gen }
  }
  // das
  return { article, noun, nom: `das ${noun}`, akk: `das ${noun}`, dat: `dem ${noun}`, gen }
}
