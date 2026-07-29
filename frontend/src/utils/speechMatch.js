// Насколько произнесённое похоже на нужное слово: 0 … 1.
//
// Распознавание речи в браузере отдаёт текст, а не звук, и на этом ломается очевидное:
// «Tschüss» Павел произносил верно, а упражнение не засчитывалось. Причина в том, что на
// Android распознавание нередко записывает услышанное КИРИЛЛИЦЕЙ — «чус», «чусс». Прежнее
// сравнение оставляло в строке только латиницу с умлаутами, поэтому кириллический ответ
// превращался в пустую строку и давал ноль: правильное произношение = «попробуй ещё».
//
// Поэтому сравниваем по двум дорожкам и берём лучший результат:
//  • латиница — с самим словом («tschüs» против «tschüss» — почти совпадение);
//  • кириллица — с русской транскрипцией слова («чусс» против «чюсс»).
import { germanPhonetic } from './germanPhonetic.js'

const ARTICLE = /^(der|die|das|ein|eine|el|la|los|las|the|a|an)\s+/i

function normLatin(s) {
  return String(s || '').toLowerCase().replace(ARTICLE, '').replace(/[^a-zäöüß]/gi, '').trim()
}

// Русская транскрипция немецкого — приблизительная по своей природе, и распознавание тоже
// приблизительно. Поэтому перед сравнением снимаем различия, которые на слух не значимы:
// «чюсс», «чусс» и «чус» — это одно и то же произнесённое Tschüss. Без этого «чус» против
// «чюсс» давало 0.5 — две правки на четыре буквы — и правильный ответ не засчитывался.
function normCyrillic(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^а-яё]/gi, '')
    .replace(/[юё]/g, m => (m === 'ю' ? 'у' : 'о'))   // мягкость гласной на слух не различить
    .replace(/[яэ]/g, m => (m === 'я' ? 'а' : 'е'))
    .replace(/ы/g, 'и')
    .replace(/(.)\1+/g, '$1')                         // удвоенные согласные: «чусс» → «чус»
    .trim()
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function ratio(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  // Слово целиком внутри фразы: ученик сказал «tschüss zusammen» — слово произнесено.
  if (a.includes(b) || b.includes(a)) return 0.9
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen
}

/**
 * @param {string} transcript что услышал микрофон
 * @param {string} expected эталонное слово на изучаемом языке
 * @param {string} [phonetic] русская транскрипция; по умолчанию считается из слова
 */
export function speechSimilarity(transcript, expected, phonetic = null) {
  const byLatin = ratio(normLatin(transcript), normLatin(expected))
  // Транскрипцию считаем только когда в ответе есть кириллица — для латинского ответа
  // она бесполезна, а на длинных словах вычисления не бесплатны.
  const cyr = normCyrillic(transcript)
  if (!cyr) return byLatin
  const byPhonetic = ratio(cyr, normCyrillic(phonetic ?? germanPhonetic(expected)))
  return Math.max(byLatin, byPhonetic)
}
