// Сборка предложения из слов: разбор эталона и детерминированная проверка ответа.
//
// Зачем. «Напиши предложение» с 29.07.2026 было переводом: даём фразу на языке
// ученика, он пишет её на изучаемом. На A0 это неподъёмно — фразу не из чего
// построить (замечание Павла 14.09.2026). Раньше показывали немецкий образец, но
// тогда ученик его просто списывал, а ИИ-проверка ставила за списанное 2 из 5.
//
// Выход: эталон перед глазами, но разрезан на слова и перемешан — ученик собирает
// порядок сам. Проверка при этом СЧИТАЕТСЯ ЗДЕСЬ, без обращения к модели: слова
// берутся из эталона, значит совпадение проверяется сравнением строк. Это и точнее
// ИИ-оценки, и не тратит платный ключ на каждый ответ.
//
// Логика чистая и живёт отдельно от вёрстки — её закрывают тесты.

// Знаки препинания по краям слова ученик не расставляет: он собирает слова.
// Внутренние знаки (апостроф в «geht's», дефис в «E-Mail») — часть слова.
const LEAD = /^[«»„“”"'(\[{¿¡\-–—]+/
const TAIL = /[«»„“”"')\]}.,!?;:…\-–—]+$/

const stripEdges = (w) => w.replace(LEAD, '').replace(TAIL, '')

// Фраза → массив слов без краевой пунктуации
export function splitWords(sentence) {
  return String(sentence ?? '')
    .trim()
    .split(/\s+/)
    .map(stripEdges)
    .filter(Boolean)
}

// Слова с устойчивыми ключами: одно и то же слово может встретиться дважды
// («Ja, ja»), и по тексту их не различить — React нужен свой id.
export function buildTokens(sentence) {
  return splitWords(sentence).map((text, id) => ({ id, text }))
}

// Собирать есть смысл от двух слов. Фразы короче остаются в прежнем режиме.
export function canBuild(sentence) {
  return splitWords(sentence).length >= 2
}

// Перемешивание Фишера—Йетса. Если случай выдал исходный порядок — пробуем снова:
// ответ, лежащий собранным, упражнением не является.
export function shuffleTokens(tokens, rnd = Math.random) {
  if (tokens.length < 2) return [...tokens]
  let out = [...tokens]
  for (let tries = 0; tries < 8; tries++) {
    out = [...tokens]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp
    }
    if (out.some((tok, i) => tok.id !== tokens[i].id)) break
  }
  return out
}

// Ответ верен, если собранные слова слово в слово совпали с эталоном.
// Регистр важен (в немецком он несёт смысл), пунктуация — нет: её не собирали.
export function isAssembledCorrect(answerTokens, reference) {
  const got = answerTokens.map(tok => tok.text).join(' ')
  return got.length > 0 && got === splitWords(reference).join(' ')
}
