// Словарный гейт: проверка распознанного слова по настоящему hunspell-словарю.
//
// Зачем: разбор фото тетради приносит битые слова («Hommian», «Peda», «Quit tungen»,
// «Furzehen») — а генератор потом строит вокруг них грамотные упражнения про
// несуществующие слова. ИИ-аудит 07.08.2026 нашёл 428 таких проблем, накопленных
// месяцами. Проверка по словарю — детерминированная, офлайн и бесплатная, поэтому
// работает на любом объёме пользователей без вычитки глазами.
//
// Устройство: nspell (чистый JS-hunspell) + словари dictionary-de/en(+gb)/es.
// Гейт откалиброван прогоном по всей боевой базе (4115 слов, 08.08.2026):
//  • немецкие композиты hunspell знает не все — есть рекурсивное разбиение на части
//    с соединительными -s-/-n-/… («Volkshochschule» = Volk+s+Hochschule);
//  • английский принимает и en-US, и en-GB (neighbour/favourite);
//  • дефисные слова проверяются по частям (T-shirt, U-Bahn);
//  • аббревиатуры (GSM), грамматические огрызки с дефисом (welch-) и немецкие
//    топонимы (…straße/…stadt) не считаются браком.
//
// Правило из docs/OPERATIONS.md: правило с исключениями хуже его отсутствия. Поэтому
// гейт НЕ чинит слово сам — он только отвечает ok/не ok и предлагает варианты, а
// решение (поправить/принять как есть) остаётся за человеком в превью урока.
import nspell from 'nspell'

const LOADERS = {
  de: [() => import('dictionary-de')],
  en: [() => import('dictionary-en'), () => import('dictionary-en-gb')],
  es: [() => import('dictionary-es')],
}
const spellers = new Map() // lang -> nspell[] | null (null = словаря нет, гейт пропускает всё)

async function getSpellers(lang) {
  if (spellers.has(lang)) return spellers.get(lang)
  const loaders = LOADERS[lang]
  if (!loaders) { spellers.set(lang, null); return null }
  const list = []
  for (const loader of loaders) {
    try {
      const mod = (await loader()).default
      // dictionary-* отдаёт либо {aff, dic}, либо колбэк-функцию (старые версии)
      const dict = typeof mod === 'function'
        ? await new Promise((res, rej) => mod((e, d) => e ? rej(e) : res(d)))
        : mod
      list.push(nspell(dict))
    } catch (e) {
      console.error(`wordGate: словарь ${lang} не загрузился: ${e.message}`)
    }
  }
  const result = list.length ? list : null
  spellers.set(lang, result)
  return result
}

const ARTICLES = /^(der|die|das|den|dem|ein|eine|the|a|an|el|la|los|las|un|una|unos|unas)$/i
// Междометия и учебные пометки, которых нет в hunspell, но в учебнике они законны
const WHITELIST = new Set(['ah', 'oh', 'äh', 'hm', 'na', 'oje', 'ups', 'okay', 'ok'])
// Немецкие топонимные суффиксы: «Veststraße», «Neustadt» — имена собственные, не брак
const DE_TOPONYM = /(straße|strasse|platz|stadt|berg|burg|dorf|hausen|heim)$/i
// Соединительные элементы немецких композитов
const DE_JOINTS = ['', 's', 'n', 'en', 'es', 'e', 'er']

function knownPlain(sps, token) {
  for (const sp of sps) {
    if (sp.correct(token)) return true
    const lower = token.toLowerCase()
    if (lower !== token && sp.correct(lower)) return true
    const upper = lower.charAt(0).toUpperCase() + lower.slice(1)
    if (upper !== token && sp.correct(upper)) return true
  }
  return false
}

// Композит: делится ли слово на словарные части (только de, рекурсия до 3 частей)
function knownCompound(sps, token, depth = 0) {
  if (token.length < 7 || depth > 1) return false
  for (let i = 3; i <= token.length - 3; i++) {
    const left = token.slice(0, i)
    const rest0 = token.slice(i)
    for (const j of DE_JOINTS) {
      if (j && !left.endsWith(j)) continue
      const head = j ? left.slice(0, left.length - j.length) : left
      if (head.length < 3 || !knownPlain(sps, head)) continue
      const rest = rest0.charAt(0).toUpperCase() + rest0.slice(1)
      if (knownPlain(sps, rest0) || knownPlain(sps, rest)) return true
      if (knownCompound(sps, rest0, depth + 1)) return true
    }
  }
  return false
}

function knownToken(sps, token, lang) {
  if (WHITELIST.has(token.toLowerCase())) return true
  if (/^\p{Lu}{2,5}$/u.test(token)) return true          // аббревиатуры: GSM, USA
  if (token.endsWith('-')) return true                    // грамматические огрызки: welch-
  if (/\d/.test(token)) return true                       // «100», «2-й», «6»
  if (/^[a-zäöüß]\.([a-zäöüß]\.?)*$/i.test(token)) return true // сокращения: z.B. / z.B
  // Дефисные — по частям: T-shirt, U-Bahn, ice-skating (одиночная буква слева — ок)
  if (token.includes('-')) {
    return token.split('-').filter(Boolean).every(part =>
      part.length === 1 || knownToken(sps, part, lang))
  }
  if (knownPlain(sps, token)) return true
  if (lang === 'de' && DE_TOPONYM.test(token) && /^\p{Lu}/u.test(token)) return true
  if (lang === 'de' && knownCompound(sps, token)) return true
  return false
}

// Слово без перевода — второй сигнал брака: у выдуманных слов («Briefland», «Superdug»)
// модель честно пишет «нет перевода», а разбиение композитов их пропускает (Brief+Land —
// формально валидное словообразование). Проверка перевода ловит их детерминированно.
const NO_TRANSLATION = /^(нет перевода|no translation|без перевода|[-—?…]*)$/i

// Проверка одного словарного слова/фразы. Возвращает:
//   { ok: true }                              — слово словарное (или гейт не применим)
//   { ok: false, bad: ['Peda'], suggest: [] } — какие токены не прошли + подсказки hunspell
// translationRu передаётся там, где он есть: пустой/заглушечный перевод — тоже брак.
export async function checkWord(wordDe, targetLang = 'de', translationRu = undefined) {
  if (translationRu !== undefined && NO_TRANSLATION.test(String(translationRu ?? '').trim())) {
    return { ok: false, bad: [String(wordDe || '')], suggest: [], reason: 'нет перевода' }
  }
  const sps = await getSpellers(targetLang)
  if (!sps) return { ok: true } // нет словаря — не блокируем (например, новый язык)

  const bad = []
  const suggest = []
  // «sie/Sie lesen», «der Kuchen», «That's a pity.» — проверяем каждый токен.
  // Апостроф НЕ срезаем: hunspell знает «that's»; срезаем только внешнюю пунктуацию.
  const tokens = String(wordDe || '')
    .split(/[\s/,…]+/)
    .map(t => t.replace(/^[.!?;:«»"()]+|[.!?;:«»"()]+$/g, ''))
    .filter(Boolean)
  if (!tokens.length) return { ok: false, bad: [String(wordDe || '')], suggest: [] }

  for (const t of tokens) {
    if (ARTICLES.test(t)) continue
    if (/\d/.test(t)) continue // «6 Millionen» — цифры не брак
    if (t.length === 1 && !/^[iyoae]$/i.test(t)) { bad.push(t); continue } // огрызки: «n», «q»
    if (t.length === 1) continue // «I», «y»/«o» (es) — законные однобуквенные
    if (knownToken(sps, t, targetLang)) continue
    bad.push(t)
    try { suggest.push(...sps[0].suggest(t).slice(0, 3)) } catch { /* пусто */ }
  }
  return bad.length ? { ok: false, bad, suggest: [...new Set(suggest)].slice(0, 5) } : { ok: true }
}

// Детерминированная проверка ПРЕДЛОЖЕНИЯ из разбора тетради: ловим OCR-мусор, который
// нельзя показывать ученику как эталон. Возвращает { ok } или { ok: false, reason }.
// Грамматику здесь не проверяем (это делает ИИ-слой в saveSentences) — только целостность.
export async function checkSentenceText(text, targetLang = 'de') {
  const t = String(text || '').trim()
  if (t.length < 4 || t.length > 220) return { ok: false, reason: 'длина' }
  if (/_/.test(t)) return { ok: false, reason: 'незаполненный пропуск' }
  if (/[Ѐ-ӿ]/.test(t) && targetLang !== 'ru') return { ok: false, reason: 'кириллица в тексте курса' }
  const tokens = t.split(/\s+/).map(x => x.replace(/^[.,!?;:«»"()]+|[.,!?;:«»"()]+$/g, '')).filter(Boolean)
  // «qu iet schen», «___ Sie _ie ih i.» — разорванные слова дают россыпь коротких огрызков
  const stubs = tokens.filter(x => x.length <= 2 && !/^\d+$/.test(x) && !/^(zu|ab|an|in|im|am|es|er|du|wo|ja|ob|um|so|da|is|a|i|o|el|la|un|at|on|it|to|by|of|we|he|me|my|us|no|or|if|y|e)$/i.test(x))
  if (stubs.length >= 2) return { ok: false, reason: `огрызки слов: ${stubs.slice(0, 4).join(' ')}` }
  // Доля несловарных длинных токенов: >трети — распознавание сломало предложение
  const sps = await getSpellers(targetLang)
  if (sps) {
    const long = tokens.filter(x => x.length >= 4 && !/\d/.test(x))
    if (long.length >= 3) {
      const unknown = long.filter(x => !knownToken(sps, x, targetLang))
      if (unknown.length / long.length > 0.34) return { ok: false, reason: `несловарные слова: ${unknown.slice(0, 4).join(' ')}` }
    }
  }
  return { ok: true }
}

// Пакетная проверка [{word_de}] → [{word_de, ok, bad, suggest}]
export async function checkWords(words, targetLang = 'de') {
  const out = []
  for (const w of words) {
    const word = typeof w === 'string' ? w : w.word_de
    out.push({ word_de: word, ...(await checkWord(word, targetLang)) })
  }
  return out
}
