import { readFileSync } from 'fs'
import { platformClient } from './openaiClient.js'
import { pickSentencesFor } from './sentencePick.js'
import { fixFillBlank, ensureBlank, dedupeOptions } from './fillBlankFix.js'
import { groundFillBlank, groundSentenceWrite } from './grounding.js'
import { joinWrappedLines } from './entryKind.js'
import { normalizeLetterFill } from './letterFill.js'

// Клиент по умолчанию — платформенный (общий ключ .env). Функции пути генерации урока
// принимают необязательный параметр `client`, чтобы работать на ключе владельца урока
// (мультиарендность оплаты). Все прочие вызовы (тренер, тап-перевод, ридер) — на платформенном.

// Вырезает первый сбалансированный JSON-объект/массив из строки (игнорируя текст
// до и после, учитывая строки и экранирование). Спасает от «мусора» вокруг JSON,
// который иногда добавляет GPT (пояснения, второй объект, markdown-хвосты).
function extractBalancedJson(s) {
  const start = s.search(/[{[]/)
  if (start < 0) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else {
      if (ch === '"') inStr = true
      else if (ch === open) depth++
      else if (ch === close) { depth--; if (depth === 0) return s.slice(start, i + 1) }
    }
  }
  return null // не закрылось — JSON обрезан
}

function parseJson(text) {
  let clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  // Убираем управляющие символы внутри JSON-строк (частая проблема с GPT)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  try {
    return JSON.parse(clean)
  } catch (e) {
    // 1) Вырезаем сбалансированный JSON (лишний текст до/после — частый случай)
    const balanced = extractBalancedJson(clean)
    if (balanced) {
      try { return JSON.parse(balanced) } catch {}
    }
    // 2) JSON обрезан (закончились токены) — отрезаем по последнему целому элементу
    const lastComma = clean.lastIndexOf('},')
    if (lastComma > 0) {
      const candidate = (clean.startsWith('[') ? '[' : '{') + clean.slice(1, lastComma + 1) + (clean.startsWith('[') ? ']' : '}')
      try { return JSON.parse(candidate) } catch {}
    }
    throw new Error(`Ошибка парсинга JSON от GPT (${clean.length} символов): ${e.message}`)
  }
}

// Учёт расхода токенов OpenAI — чтобы точно показывать стоимость операций (правило −70$).
// Разовые скрипты (перегенерация) сбрасывают счётчик, гоняют, читают и печатают цену.
export const usage = { calls: 0, promptTokens: 0, completionTokens: 0, byModel: {} }
export function resetUsage() { usage.calls = 0; usage.promptTokens = 0; usage.completionTokens = 0; usage.byModel = {} }
// Цены за 1M токенов (USD), актуально для gpt-4o-mini / gpt-4o.
const PRICE = { 'gpt-4o-mini': { in: 0.15, out: 0.60 }, 'gpt-4o': { in: 2.50, out: 10.00 } }
export function usageCostUSD() {
  let usd = 0
  for (const [m, u] of Object.entries(usage.byModel)) {
    const p = PRICE[m] || { in: 0, out: 0 }
    usd += (u.promptTokens / 1e6) * p.in + (u.completionTokens / 1e6) * p.out
  }
  return usd
}

// Учёт расхода для вызовов, которые идут МИМО ask() — vision дергает SDK напрямую.
// Без этого самый дорогой шаг (разбор фото на gpt-4o) показывал в журнале $0.0000,
// то есть деньги уходили незаметно.
export function trackUsage(model, u = {}) {
  usage.calls++
  usage.promptTokens += u.prompt_tokens || 0
  usage.completionTokens += u.completion_tokens || 0
  const bm = usage.byModel[model] || (usage.byModel[model] = { calls: 0, promptTokens: 0, completionTokens: 0 })
  bm.calls++; bm.promptTokens += u.prompt_tokens || 0; bm.completionTokens += u.completion_tokens || 0
}

async function ask(prompt, { model = 'gpt-4o-mini', max_tokens = 4096, client = platformClient } = {}) {
  const res = await client.chat.completions.create({
    model,
    max_tokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const u = res.usage || {}
  usage.calls++
  usage.promptTokens += u.prompt_tokens || 0
  usage.completionTokens += u.completion_tokens || 0
  const bm = usage.byModel[model] || (usage.byModel[model] = { calls: 0, promptTokens: 0, completionTokens: 0 })
  bm.calls++; bm.promptTokens += u.prompt_tokens || 0; bm.completionTokens += u.completion_tokens || 0
  return res.choices[0].message.content
}

// ─── Целевые (изучаемые) языки — мульти-таргет ──────────────────────────────
// ВАЖНО: у каждого языка свои ПРИМЕРЫ для промптов. Раньше примеры внутри
// EXERCISES_PROMPT были жёстко немецкими («Die ___ trinkt Milch», «Wie heißt das auf
// Russisch»), и модель копировала их язык: в испанском курсе рождались предложения
// вида «Die abeja ist klein», в английском — варианты [Kamera, Fernglas, Linse].
// Аудит 28.07.2026 нашёл 270 таких упражнений. Пример на нужном языке — самая
// действенная часть промпта, поэтому он обязан меняться вместе с языком.
const LEARN_LANGS = {
  de: { name: 'немецкий', adjN: 'немецкие', tts: 'de-DE',
    nounRule: 'существительные ВСЕГДА с артиклем (der/die/das) и с большой буквы',
    exNoun: { sentence: 'Die ___ trinkt Milch.', blank: 'Katze', options: ['Katze', 'Maus', 'Blume'] },
    exVerb: { sentence: 'Ich ___ den Lehrer.', blank: 'frage', options: ['frage', 'antworte', 'sehe'] },
    exMask: { word: 'Hund', masked: 'H_nd', tr: 'собака' },
    artHint: " Если у существительного не было артикля — добавь правильный (род определи сам).",
    exKeepVerb: "leben → leben, НЕ das Leben",
    exProper: "Polen, Russland, München — без артикля; die Türkei, die Schweiz, die USA, der Iran — с артиклем, как принято",
    exBaseForm: "kein/keine/keinen → kein, mein/meine → mein",
    exFunc: "ich, wir, mich, mein, kein, für, mit, wo, welche, nicht",
    askRu: 'Wie heißt das auf Russisch' },
  es: { name: 'испанский', adjN: 'испанские', tts: 'es-ES',
    nounRule: 'существительные с артиклем (el/la/los/las)',
    exNoun: { sentence: 'La ___ bebe leche.', blank: 'gata', options: ['gata', 'ratona', 'flor'] },
    exVerb: { sentence: 'Yo ___ al profesor.', blank: 'pregunto', options: ['pregunto', 'respondo', 'veo'] },
    exMask: { word: 'perro', masked: 'p_rro', tr: 'собака' },
    artHint: " Если у существительного не было артикля — добавь правильный (род определи сам).",
    exKeepVerb: "vivir → vivir, НЕ la vida",
    exProper: "Polonia, Rusia, Múnich — без артикля; los Países Bajos, El Salvador — с артиклем, как принято",
    exBaseForm: "vivo/vives → vivir, mío/mía → mi",
    exFunc: "yo, nosotros, me, mi, ningún, para, con, dónde, cuál, no",
    askRu: 'Cómo se dice en ruso' },
  fr: { name: 'французский', adjN: 'французские', tts: 'fr-FR',
    nounRule: 'существительные с артиклем (le/la/les)',
    exNoun: { sentence: 'Le ___ boit du lait.', blank: 'chat', options: ['chat', 'souris', 'fleur'] },
    exVerb: { sentence: 'Je ___ le professeur.', blank: 'demande', options: ['demande', 'réponds', 'vois'] },
    exMask: { word: 'chien', masked: 'ch_en', tr: 'собака' },
    artHint: " Если у существительного не было артикля — добавь правильный (род определи сам).",
    exKeepVerb: "vivre → vivre, НЕ la vie",
    exProper: "Pologne, Russie, Munich; la France, les Pays-Bas — с артиклем, как принято",
    exBaseForm: "vis/vit → vivre, mien/mienne → mon",
    exFunc: "je, nous, moi, mon, aucun, pour, avec, où, quel, ne",
    askRu: 'Comment dit-on en russe' },
  it: { name: 'итальянский', adjN: 'итальянские', tts: 'it-IT',
    nounRule: 'существительные с артиклем (il/la/lo)',
    exNoun: { sentence: 'Il ___ beve latte.', blank: 'gatto', options: ['gatto', 'topo', 'fiore'] },
    exVerb: { sentence: 'Io ___ il professore.', blank: 'chiedo', options: ['chiedo', 'rispondo', 'vedo'] },
    exMask: { word: 'cane', masked: 'c_ne', tr: 'собака' },
    artHint: " Если у существительного не было артикля — добавь правильный (род определи сам).",
    exKeepVerb: "vivere → vivere, НЕ la vita",
    exProper: "Polonia, Russia, Monaco; gli Stati Uniti, i Paesi Bassi — с артиклем, как принято",
    exBaseForm: "vivo/vivi → vivere, mio/mia → mio",
    exFunc: "io, noi, mi, mio, nessun, per, con, dove, quale, non",
    askRu: 'Come si dice in russo' },
  en: { name: 'английский', adjN: 'английские', tts: 'en-US',
    nounRule: 'существительные',
    exNoun: { sentence: 'The ___ drinks milk.', blank: 'cat', options: ['cat', 'mouse', 'flower'] },
    exVerb: { sentence: 'I ___ the teacher.', blank: 'ask', options: ['ask', 'answer', 'see'] },
    exMask: { word: 'dog', masked: 'd_g', tr: 'собака' },
    artHint: " Артикль к существительному НЕ добавляй: в английском словаре слово стоит без «the» и «a».",
    exKeepVerb: "to work → work, НЕ the work",
    exProper: "Poland, Russia, Munich — без артикля; the USA, the Netherlands — с артиклем, как принято",
    exBaseForm: "works/working → work, mine → my",
    exFunc: "I, we, me, my, no, for, with, where, which, not",
    askRu: 'How do you say it in Russian' },
  pt: { name: 'португальский', adjN: 'португальские', tts: 'pt-PT',
    nounRule: 'существительные с артиклем (o/a)',
    exNoun: { sentence: 'O ___ bebe leite.', blank: 'gato', options: ['gato', 'rato', 'flor'] },
    exVerb: { sentence: 'Eu ___ o professor.', blank: 'pergunto', options: ['pergunto', 'respondo', 'vejo'] },
    exMask: { word: 'cão', masked: 'c_o', tr: 'собака' },
    artHint: " Если у существительного не было артикля — добавь правильный (род определи сам).",
    exKeepVerb: "viver → viver, НЕ a vida",
    exProper: "Polónia, Rússia, Munique; os Estados Unidos, os Países Baixos — с артиклем, как принято",
    exBaseForm: "vivo/vives → viver, meu/minha → meu",
    exFunc: "eu, nós, me, meu, nenhum, para, com, onde, qual, não",
    askRu: 'Como se diz em russo' },
}
const TL = (code) => LEARN_LANGS[code] || LEARN_LANGS.de
export function targetTtsLocale(code) { return TL(code).tts }
export function targetLangName(code) { return TL(code).name }

const VISION_PROMPT = (t) => `Это фото страницы учебника или тетради школьника, изучающего ${t.name} язык (уровень A1).
Распознай ВЕСЬ текст на фото, включая рукописный, мелкий и текст в ЗАГОЛОВКАХ, подписях, таблицах и на полях.

Извлеки МАКСИМАЛЬНО ПОЛНО, ничего не пропуская:
(а) ВСЕ ${t.adjN} слова, которые видно, с переводом на русский — НЕ только «новые», но и простые, служебные, числительные, а также слова из заголовков и подписей. Лучше вернуть лишнее, чем потерять слово.
(б) грамматические правила/конструкции,
(в) примеры предложений — дословно с фото,
(г) заголовки/темы страницы (если есть).

⚠️ КРИТИЧНО: не фильтруй слова по «новизне» и не сокращай список ради краткости — верни ВСЁ, что реально видно на изображении.

Верни ТОЛЬКО валидный JSON без markdown-обёртки и без блока \`\`\`json:
{
  "words": [{"word_de": "слово", "translation_ru": "перевод", "example_sentence": "пример или null"}],
  "grammar_points": [{"description": "правило", "example": "пример или null"}],
  "example_sentences": ["предложение1"],
  "headings": ["заголовок или тема страницы"]
}`

function getMimeType(filepath) {
  const ext = filepath.split('.').pop().toLowerCase()
  return { png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg'
}

export async function extractFromPhoto(filepath, targetLang = 'de', client = platformClient) {
  const imageData = readFileSync(filepath)
  const base64 = imageData.toString('base64')
  const mimeType = getMimeType(filepath)

  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 8192, // плотная страница: 4096 обрывало JSON → терялись слова. 8192 — запас.
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
        { type: 'text', text: VISION_PROMPT(TL(targetLang)) },
      ],
    }],
  })

  trackUsage('gpt-4o', res.usage)   // иначе разбор фото не виден в расходах

  // Пустая/обложечная страница: GPT возвращает отказ («Извините…») вместо JSON.
  // Не роняем урок — считаем страницу пустой (слов нет), обработка идёт дальше.
  try {
    return parseJson(res.choices[0].message.content)
  } catch (e) {
    console.warn('extractFromPhoto: страница без слов (обложка/пустая):', e.message)
    return { words: [], grammar_points: [], sentences: [] }
  }
}

// Камера в читалке: извлечь слова целевого языка с фото + перевод на локаль ученика.
export async function extractWordsFromImage(filepath, lang = 'ru', targetLang = 'de') {
  const base64 = readFileSync(filepath).toString('base64')
  const mimeType = getMimeType(filepath)
  const T = TL(targetLang)
  const langNames = { ru: 'русский', uk: 'українську', de: 'немецкий', en: 'English', bg: 'болгарский', tr: 'турецкий', ar: 'арабский', es: 'испанский', fr: 'французский', sq: 'албанский' }
  const langName = langNames[lang] || 'русский'
  const prompt = `На фото — текст или слова на ${T.name} языке (страница, вывеска, надпись). Извлеки все РАЗНЫЕ ${T.adjN} слова и короткие полезные фразы, которые видно.
${T.nounRule}; глаголы — в инфинитиве. Игнорируй нечитаемое, числа-страницы, мусор.
Для каждого дай перевод на ${langName}.
Верни ТОЛЬКО JSON: {"words":[{"de":"...","tr":"..."}]}`
  const res = await platformClient.chat.completions.create({
    model: 'gpt-4o', max_tokens: 4096,
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
      { type: 'text', text: prompt },
    ] }],
  })
  return (parseJson(res.choices[0].message.content).words || []).filter(w => w && w.de)
}

// Разбор ФОТО ПРЕДЛОЖЕНИЙ: для каждого предложения/абзаца — оригинал, перевод и разбор
// по ключевым словам. Даёт «круче, чем Google Фото»: сверху абзац, под ним перевод, потом слова.
export async function extractSentencesFromImage(filepath, lang = 'ru', targetLang = 'de') {
  const base64 = readFileSync(filepath).toString('base64')
  const mimeType = getMimeType(filepath)
  const T = TL(targetLang)
  const langNames = { ru: 'русский', uk: 'украинский', de: 'немецкий', en: 'английский', bg: 'болгарский', tr: 'турецкий', ar: 'арабский', es: 'испанский', fr: 'французский', sq: 'албанский' }
  const langName = langNames[lang] || 'русский'
  const prompt = `На фото — текст на ${T.name} языке (предложения, абзац, диалог). Извлеки связный текст и разбей на предложения (или короткие абзацы).
Для КАЖДОГО предложения дай:
- "original" — точный текст предложения на ${T.name} языке (как на фото),
- "translation" — естественный перевод на ${langName},
- "words" — разбор по ключевым словам: массив {"de":"...","tr":"..."}. ${T.nounRule}; глаголы — в инфинитиве; служебные слова можно опустить. Перевод слов — на ${langName}.
Игнорируй мусор, номера страниц, нечитаемое.
Верни ТОЛЬКО JSON: {"sentences":[{"original":"...","translation":"...","words":[{"de":"...","tr":"..."}]}]}`
  const res = await platformClient.chat.completions.create({
    model: 'gpt-4o', max_tokens: 4096,
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
      { type: 'text', text: prompt },
    ] }],
  })
  return (parseJson(res.choices[0].message.content).sentences || [])
    .filter(s => s && s.original)
    .map(s => ({ original: s.original, translation: s.translation || '', words: (s.words || []).filter(w => w && w.de) }))
}

const MERGE_PROMPT = (t) => `Объедини данные из нескольких фото страниц урока (${t.name} язык, A1) в единый конспект.
Правила нормализации (соблюдай строго):
- ${t.nounRule}. Если род не указан в тексте — определи сам, ты знаешь ${t.name} язык. Не оставляй существительное без артикля (если в языке есть артикли).
- Глаголы — в инфинитиве, с маленькой буквы.
- Прилагательные, наречия, частицы, местоимения — с маленькой буквы.
- Убери дубли: слово с артиклем и без него — это ОДНО слово, оставь форму с артиклем. Разный регистр одного слова — не новый вход (кроме случаев, где регистр меняет смысл, напр. нем. "Sie/sie").
- ⚠️ КРИТИЧНО: НЕ выбрасывай слова! Сохрани ВСЕ различные слова со всех страниц. Дедуп — ТОЛЬКО точные повторы одного и того же слова. Числительные (напр. 20, 21, 30, 34 → zwanzig, einundzwanzig…), простые и служебные слова — тоже входят в список, не пропускай их.
- Числительные: в переводе ТОЛЬКО слово, БЕЗ цифры в скобках («шесть», НЕ «шесть (6)») — скобки ломают озвучку.
- Объедини грамматические правила без дублей.
- ПРЕДЛОЖЕНИЯ ("sentences"): собери РЕАЛЬНЫЕ предложения-примеры со страниц (учебник/тетрадь/доска) ДОСЛОВНО — не выдумывай новые. Убери дубли и мусор (обрывки, заголовки, номера). Для каждого дай перевод на русский. Это основа для упражнений урока.

Верни ТОЛЬКО JSON без markdown (поле word_de = слово изучаемого языка):
{"words": [{"word_de": "...", "translation_ru": "...", "example_sentence": "..."}], "grammar_points": [{"description": "...", "example": "..."}], "sentences": [{"text": "реальное предложение со страницы", "translation_ru": "перевод"}]}`

// Ключ для дедупа: без ведущего артикля и регистра, чтобы "Kaffee" и "der Kaffee"
// схлопывались в одно. Sie/sie и Ihr/ihr — разные слова, для них ключ различаем.
function wordKey(word_de) {
  const s = (word_de || '').trim()
  const bare = s.toLowerCase().replace(/^(der|die|das)\s+/, '').trim()
  if (bare === 'sie' || bare === 'ihr') return s // регистр важен
  return bare
}
const hasArticle = (s) => /^(der|die|das)\s/i.test(s || '')

async function mergeChunk(extractions, transcription = null, existingWords = [], targetLang = 'de', client = platformClient) {
  const slim = extractions.map(e => ({ words: e.words || [], grammar_points: e.grammar_points || [], example_sentences: e.example_sentences || [] }))
  const input = JSON.stringify({ extractions: slim, transcription }, null, 2)
  // Умная обработка тетради/доски: даём модели список уже имеющихся слов урока,
  // чтобы она НЕ дублировала их, но могла исправить форму (напр. дописать артикль).
  const existingBlock = existingWords.length
    ? `\n\nВ УРОКЕ УЖЕ ЕСТЬ эти слова — не добавляй их повторно. Если новое фото уточняет слово (напр. даёт артикль или пример) — верни исправленную форму, иначе пропусти. Возвращай в основном НОВЫЕ слова:\n${existingWords.slice(0, 200).join(', ')}`
    : ''
  const merged = parseJson(await ask(`${MERGE_PROMPT(TL(targetLang))}\n\nДанные:\n${input}${existingBlock}`, { max_tokens: 8192, client }))

  // 🛟 Страховка от потери слов: если модель выкинула слово из распознавания (напр. числа
  // 20-34 из тетради), возвращаем его обратно. Дедуп по ключу; уже имеющиеся в уроке — пропускаем.
  const mergedKeys = new Set((merged.words || []).map(w => wordKey(w.word_de)))
  const existingKeys = new Set(existingWords.map(wordKey))
  for (const e of extractions) {
    for (const w of (e.words || [])) {
      const de = w?.word_de || w?.de
      if (!de) continue
      const k = wordKey(de)
      if (!k || mergedKeys.has(k) || existingKeys.has(k)) continue
      mergedKeys.add(k)
      ;(merged.words ||= []).push({
        word_de: de,
        translation_ru: w.translation_ru || w.tr || w.translation || '',
        example_sentence: w.example_sentence || null,
      })
    }
  }
  // 🛟 Та же страховка для ПРЕДЛОЖЕНИЙ. На плотных уроках модель их просто выбрасывает:
  // в уроке 18 распознавание нашло 97 предложений на 13 страницах, а сведение вернуло ноль,
  // и учитель видел «Предложений не распознано». Предложения — основа упражнений
  // «напиши предложение» и диктанта по фразе, терять их нельзя.
  // Перевода у подобранных нет (vision отдаёт их строками) — его дописывает enrichLesson.
  const seenText = new Set((merged.sentences || [])
    .map(x => String(typeof x === 'string' ? x : x?.text || '').trim().toLowerCase().slice(0, 80))
    .filter(Boolean))
  for (const e of extractions) {
    // Строки рукописи приходят по одной, и фраза, не поместившаяся в ширину страницы,
    // разорвана на два обрывка. Склеиваем до того, как решать, годится ли она.
    for (const raw of joinWrappedLines(e.example_sentences || [])) {
      const text = String(typeof raw === 'string' ? raw : raw?.text || '').trim()
      const key = text.toLowerCase().slice(0, 80)
      if (text.length < 4 || !key || seenText.has(key)) continue
      seenText.add(key)
      ;(merged.sentences ||= []).push({ text, translation_ru: null })
    }
  }

  return merged
}

export async function mergeLesson(extractions, transcription = null, existingWords = [], targetLang = 'de', client = platformClient) {
  const CHUNK = 6
  if (extractions.length <= CHUNK) {
    return mergeChunk(extractions, transcription, existingWords, targetLang, client)
  }

  const chunks = []
  for (let i = 0; i < extractions.length; i += CHUNK) {
    chunks.push(extractions.slice(i, i + CHUNK))
  }

  const partials = []
  for (let i = 0; i < chunks.length; i++) {
    const partial = await mergeChunk(chunks[i], i === 0 ? transcription : null, existingWords, targetLang, client)
    partials.push(partial)
  }

  const seenWords = new Map()
  for (const p of partials) {
    for (const w of (p.words || [])) {
      const key = wordKey(w.word_de)
      if (!key) continue
      const prev = seenWords.get(key)
      // При дубле предпочитаем форму с артиклем
      if (!prev || (hasArticle(w.word_de) && !hasArticle(prev.word_de))) seenWords.set(key, w)
    }
  }

  const seenGrammar = new Set()
  const grammar_points = []
  for (const p of partials) {
    for (const g of (p.grammar_points || [])) {
      const key = g.description?.slice(0, 50)
      if (key && !seenGrammar.has(key)) { seenGrammar.add(key); grammar_points.push(g) }
    }
  }

  // Консолидируем реальные предложения из всех частей (дедуп по тексту)
  const seenSent = new Set()
  const sentences = []
  for (const p of partials) {
    for (const s of (p.sentences || [])) {
      const text = (typeof s === 'string' ? s : s?.text || '').trim()
      const key = text.toLowerCase().slice(0, 80)
      if (text && !seenSent.has(key)) { seenSent.add(key); sentences.push(typeof s === 'string' ? { text } : s) }
    }
  }

  return { words: [...seenWords.values()], grammar_points, sentences }
}

// AI-название и описание урока по его содержимому (когда учитель не задал тему).
// Возвращает { title, description } по-русски.
export async function generateLessonMeta(words = [], grammarPoints = [], targetLang = 'de', client = platformClient) {
  const wl = words.slice(0, 60).map(w => `${w.word_de} — ${w.translation_ru}`).join(', ')
  const gl = (grammarPoints || []).slice(0, 8).map(g => g.description).filter(Boolean).join('; ')
  const prompt = `Ты помогаешь учителю ${TL(targetLang).name} языка. По содержимому урока придумай:
1) НАЗВАНИЕ — короткое, 3-6 слов, по-русски, БЕЗ слова «Урок» и без номера (например: «Умлаут Ä, семья и заказ еды»).
2) ОПИСАНИЕ — 1-2 предложения по-русски: какие темы и что тренируется.

Слова урока: ${wl || '(нет)'}
Грамматика: ${gl || '—'}

Верни СТРОГО JSON без markdown: {"title":"...","description":"..."}`
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 256,
    temperature: 0.5,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  const data = parseJson(res.choices[0].message.content)
  return { title: (data.title || '').trim(), description: (data.description || '').trim() }
}

export const EXERCISES_PROMPT = (t) => `На основе слов и грамматики урока (${t.name} язык, A1) создай упражнения для школьника. Объясняй максимально просто и понятно, как для маленьких детей.

⚠️ ГЛАВНЫЙ ИСТОЧНИК — РЕАЛЬНЫЕ ПРЕДЛОЖЕНИЯ УРОКА:
- В конспекте есть поле "sentences" — это реальные предложения из учебника/тетради/доски, которые класс разбирал.
- Для "fill_blank" и "sentence_write" бери В ПЕРВУЮ ОЧЕРЕДЬ эти предложения (делай пропуск на изучаемом слове, сохраняй их грамматику и склонения — именно это закрепляем).
- Выдумывай НОВОЕ предложение только если среди "sentences" нет подходящего для данного слова.
- Так упражнения тренируют ровно ту тему и формы, что были на уроке, а не абстрактные.

⚠️ ГЛАВНОЕ ПРАВИЛО ЯЗЫКА:
- Все предложения на изучаемом языке (поля "sentence", "example") — на ЧИСТОМ ${t.name} языке (A1), короткие и естественные.
- НИКОГДА не смешивай русский и ${t.name} в одном предложении.
- НИКОГДА не пиши мета-пояснения вида «X значит Y».
- Даже для служебных слов (предлоги, местоимения, глаголы) придумай нормальное предложение на ${t.name} языке, где слово стоит в естественном контексте.
- Русский язык допустим только в переводах ("answer", "translation_ru", "options" у multiple_choice) и в русских подсказках ("hint_ru").

Для каждого слова создай 5 упражнений — по одному каждого типа:
1. flashcard — карточка "слово изучаемого языка ↔ перевод"
2. fill_blank — короткое предложение на ${t.name} языке с пропуском ___ на месте слова. ⚠️ В ПРОПУСК (blank) и в options ставь слово в той ФОРМЕ, что реально нужна в предложении, а НЕ словарную:
   • существительное — БЕЗ артикля (если артикль нужен по грамматике, оставь его в предложении ПЕРЕД ___, не дублируй в пропуске), регистр — по правилу языка: ${t.nounRule};
   • глагол — СПРЯГАЙ под подлежащее предложения (напр. «Ich ___ den Lehrer» → blank «frage», НЕ «fragen»; «Wir ___» → «fragen»);
   • прилагательное/другое — в нужной форме для этого предложения.
   Предложение с подставленным blank должно быть ГРАММАТИЧЕСКИ ВЕРНЫМ. options — РОВНО 3 слова на ${t.name} языке в ТАКОЙ ЖЕ форме: правильное (в точности = blank) и 2 похожих отвлекающих. НЕ русские!
3. multiple_choice — выбор правильного русского перевода слова изучаемого языка из 4 вариантов
4. sentence_write — ПЕРЕВОД предложения: даём русскую фразу, ученик пишет её на изучаемом языке.
   Поле "example" — эталон на изучаемом языке, "example_ru" — та же фраза по-русски (её и видит ученик).
   Фраза короткая (4–8 слов), уровня A1, обязательно содержит изучаемое слово. Свободное сочинение
   на A1 не работает: ученик ещё не умеет строить фразы сам, а списанный пример оценивался низко.
5. letter_fill — слово с пропущенными буквами (замени 1-2 буквы внутри слова на "_", первую букву всегда оставляй видимой; артикль оставляй без изменений)

Верни ТОЛЬКО JSON массив без markdown:
[
  {"type": "flashcard", "word_de": "слово", "payload": {"question": "слово на ${t.name} языке", "answer": "русский перевод"}},
  {"type": "fill_blank", "word_de": "${t.exNoun.blank}", "payload": {"sentence": "${t.exNoun.sentence}", "blank": "${t.exNoun.blank}", "options": ${JSON.stringify(t.exNoun.options)}}},
  {"type": "fill_blank", "word_de": "${t.exVerb.blank}", "payload": {"sentence": "${t.exVerb.sentence}", "blank": "${t.exVerb.blank}", "options": ${JSON.stringify(t.exVerb.options)}}},
  {"type": "multiple_choice", "word_de": "слово", "payload": {"question": "${t.askRu}: слово?", "options": ["вар1","вар2","вар3","вар4"], "correct": 0}},
  {"type": "sentence_write", "word_de": "слово", "payload": {"word_de": "слово", "translation_ru": "перевод", "example": "Короткое предложение на ${t.name} языке (A1) с этим словом", "example_ru": "Перевод этого предложения на русский — это и есть задание ученику"}},
  {"type": "letter_fill", "word_de": "слово", "payload": {"word_de": "${t.exMask.word}", "translation_ru": "${t.exMask.tr}", "masked": "${t.exMask.masked}", "answer": "${t.exMask.word}"}}
]

⚠️ Примеры выше даны на ${t.name} языке НАРОЧНО — весь изучаемый текст должен быть именно на нём.`

const LETTER_FILL_PROMPT = `Для каждого немецкого слова создай упражнение letter_fill.
Правила маски: замени 1-2 буквы ВНУТРИ слова на "_", первую букву всегда оставляй видимой, артикль der/die/das не трогай.
Верни ТОЛЬКО JSON массив без markdown:
[{"type":"letter_fill","word_de":"слово","payload":{"word_de":"Hund","translation_ru":"собака","masked":"H_nd","answer":"Hund"}}]`

const BATCH_SIZE = 15

export async function generateLetterFill(words) {
  const all = []
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)
    const text = await ask(`${LETTER_FILL_PROMPT}\n\nСлова:\n${JSON.stringify(batch, null, 2)}`, { max_tokens: 4096 })
    all.push(...parseJson(text).map(sanitizeExercise).filter(Boolean))
  }
  return all
}

// Единый выходной фильтр упражнений от модели: чиним битые маски «Добавь букву»
// (модель регулярно теряет буквы или меняет длину — упражнение становится невыполнимым)
// и отбрасываем то, что починить нечем. Дальше — перемешивание вариантов ответа.
export function sanitizeExercise(ex) {
  if (!ex || typeof ex !== 'object') return null
  // Пропуск: модель ставит то два подчёркивания, то четыре. Фронт делит предложение
  // строго по «___», поэтому «Ich __ jeden Morgen.» осталось бы без пропуска вовсе.
  // Нормализуем на входе, чтобы в базе лежали чистые данные, а не чинились при показе.
  if (ex.type === 'fill_blank') {
    let payload = ex.payload || {}
    if (typeof payload.sentence === 'string') {
      payload = { ...payload, sentence: payload.sentence.replace(/_{2,}/g, '___') }
    }
    // Три дефекта, которые модель выдаёт регулярно, — чиним ДО записи в базу. Раньше эти
    // функции жили только в разовом скрипте, и каждая новая генерация приносила брак заново:
    //  • пропуск не поставлен вовсе («Heute ist ein schöner Tag.» при ответе «heute»);
    //  • ответ не совпадает ни с одним вариантом;
    //  • один и тот же вариант дважды.
    ex = { ...ex, payload: dedupeOptions(fixFillBlank(ensureBlank(payload))) }
  }

  if (ex.type === 'multiple_choice') {
    ex = { ...ex, payload: dedupeOptions(ex.payload || {}) }
  }

  // Пример в «напиши предложение» обязан быть на ИЗУЧАЕМОМ языке — это эталон перевода.
  // Модель иногда меняет поля местами и кладёт туда русский. Такое упражнение не чиним, а
  // отбрасываем: добивочный проход сгенерирует слову новое, а брак в базу не попадёт.
  if (ex.type === 'sentence_write' && /[А-Яа-яЁё]/.test(String(ex.payload?.example || ''))) return null
  if (ex.type === 'letter_fill') {
    const payload = normalizeLetterFill(ex.payload)
    if (!payload) return null // слово нечем маскировать — упражнения не будет
    return shuffleOptions({ ...ex, payload })
  }
  return shuffleOptions(ex)
}

function shuffleOptions(ex) {
  if (ex.type !== 'multiple_choice' || !Array.isArray(ex.payload?.options)) return ex
  const { options, correct } = ex.payload
  const correctAnswer = options[correct ?? 0]
  const shuffled = [...options].sort(() => Math.random() - 0.5)
  return { ...ex, payload: { ...ex.payload, options: shuffled, correct: shuffled.indexOf(correctAnswer) } }
}

// Разбивка слов урока на тематические группы (для кнопки «Перераспределить»).
// Возвращает [{title, word_ids:[...]}] — каждое слово ровно в одну группу.
export async function groupWordsByTheme(words, targetLang = 'de', client = platformClient) {
  const list = words.map(w => `${w.id}: ${w.word_de} — ${w.translation_ru}`).join('\n')
  const prompt = `Раздели слова урока (${TL(targetLang).name} язык) на 2–6 ТЕМАТИЧЕСКИХ групп по смыслу (например «Школа», «Еда», «Семья», «Глаголы движения»). Каждое слово помести РОВНО в одну группу. Дай каждой группе короткое название по-русски (1–3 слова). Не оставляй слов без группы.
Слова (формат "id: слово — перевод"):
${list}

Верни СТРОГО JSON без markdown: {"groups":[{"title":"Тема","word_ids":[1,2,3]}]}`
  const data = parseJson(await ask(prompt, { max_tokens: 2048, client }))
  return (data.groups || []).filter(g => g && g.title && Array.isArray(g.word_ids) && g.word_ids.length)
}

// Канонические темы наборов (единый список — соответствует set_theme в БД)
export const CANON_THEMES = [
  'Школа и учёба', 'Языки', 'Семья и друзья', 'Глаголы', 'Числа', 'Время', 'Транспорт',
  'Еда и напитки', 'Документы и данные', 'Города и страны', 'Места и направления', 'Грамматика',
  'Эмоции', 'Дом и быт', 'Природа', 'Одежда', 'Покупки', 'Цвета', 'Тело и здоровье',
  'Работа и профессии', 'Технологии', 'Люди', 'Общение', 'Разное',
]

// Классификация + НОРМАЛИЗАЦИЯ слов: существительные → с артиклем, глаголы → инфинитив,
// каждое слово → РОВНО в одну канонической тему. Основа чистого банка без свалки.
// Батч классификации. Ответ на одно слово — строка JSON примерно на 30 токенов, при
// max_tokens 3000 в ответ влезает около 90 слов. Раньше все слова уходили одним запросом:
// урок на 116 слов (реальный, «Kapitel 17») обрезался на середине ответа, и хвост слов
// молча не попадал ни в один набор. Ошибки при этом не было — просто тишина.
const CLASSIFY_BATCH = 50

export async function classifyWordsToThemes(words, targetLang = 'de', client = platformClient) {
  if (!words.length) return []
  if (words.length > CLASSIFY_BATCH) {
    const out = []
    for (let i = 0; i < words.length; i += CLASSIFY_BATCH) {
      out.push(...await classifyWordsToThemes(words.slice(i, i + CLASSIFY_BATCH), targetLang, client))
    }
    return out
  }
  const list = words.map((w, i) => `${i}: ${w.de}${w.tr ? ' — ' + w.tr : ''}`).join('\n')
  const L = TL(targetLang)
  const prompt = `Есть слова на ${L.name} языке. Для КАЖДОГО слова:
1) Нормализуй форму "de" по правилам ${L.name} языка: ${L.nounRule}; глагол — инфинитив с маленькой буквы; остальное — как есть.${L.artHint}
   НЕ МЕНЯЙ часть речи: глагол остаётся глаголом (${L.exKeepVerb}), существительное — существительным.
   ИСКЛЮЧЕНИЕ — имена собственные: страны и города пиши так, как принято в ${L.name} языке (${L.exProper}).
   Разные формы одного слова приводи к базовой (${L.exBaseForm}).
2) Дай перевод "tr" на русский (если не задан или неточен — исправь).
3) Отнеси РОВНО к одной теме из списка (строкой в точности как в списке): ${CANON_THEMES.join(', ')}. Если ничего не подходит — "Разное".
   Ориентируйся на СМЫСЛ слова, а не на созвучие: крыша — «Дом и быт», а не «Города и страны»; снаружи/внутри — «Места и направления».
   Местоимения, артикли, предлоги, союзы, частицы, вопросительные слова и др. служебные/грамматические слова (${L.exFunc}) — ВСЕГДА тема «Грамматика», не «Разное».
Верни СТРОГО JSON без markdown: {"items":[{"i":0,"de":"...","tr":"...","theme":"..."}]}
Слова:
${list}`
  const data = parseJson(await ask(prompt, { model: 'gpt-4o', max_tokens: 3000, client }))
  return (data.items || [])
    .filter(it => it && it.de && it.theme)
    .map(it => ({ de: String(it.de).trim(), tr: String(it.tr || '').trim(), theme: CANON_THEMES.includes(it.theme) ? it.theme : 'Разное' }))
}

// Core-типы, которые генерирует EXERCISES_PROMPT (по одному на слово)
export const CORE_EXERCISE_TYPES = ['flashcard', 'fill_blank', 'multiple_choice', 'sentence_write', 'letter_fill']
// Батч генерации упражнений: 8 слов × 5 типов = 40 объектов — влезает в max_tokens без усечения
// (при 15 словах модель регулярно обрезала хвост батча → у части слов не хватало типов)
const EX_BATCH = 8
const exWordKey = (s) => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/, '').trim()

export async function generateExercises(words, grammar_points, targetLang = 'de', sentences = [], client = platformClient) {
  const allExercises = []
  // Реальные предложения урока — приоритетный источник для fill_blank/sentence_write.
  // Подбираем их ПОД КАЖДУЮ пачку слов, а не берём первые 40 по порядку: на плотном уроке
  // (в уроке 8 предложений 164) слова из конца оставались без своих примеров, и модель
  // сочиняла им фразы с нуля, теряя грамматику урока.
  const gen = async (batch) => {
    const input = JSON.stringify({
      words: batch, grammar_points,
      sentences: pickSentencesFor(sentences, batch, targetLang, 40),
    }, null, 2)
    const text = await ask(`${EXERCISES_PROMPT(TL(targetLang))}\n\nКонспект урока:\n${input}`, { max_tokens: 8192, client })
    return parseJson(text).map(sanitizeExercise).filter(Boolean)
  }
  for (let i = 0; i < words.length; i += EX_BATCH) {
    allExercises.push(...await gen(words.slice(i, i + EX_BATCH)))
  }
  // Промпт ПРОСИТ модель брать реальные фразы урока, и она это регулярно игнорирует: замер
  // по уроку 19 дал 5% упражнений на живых предложениях при потолке 33%. Просьбу заменяем
  // действием — если для слова фраза со страницы есть, подставляем её кодом.
  const realSentences = (sentences || []).map(s => (typeof s === 'string' ? s : s?.text)).filter(Boolean)
  if (realSentences.length) {
    for (const ex of allExercises) {
      if (ex.type === 'fill_blank') ex.payload = groundFillBlank(ex.payload, realSentences, targetLang)
      else if (ex.type === 'sentence_write') ex.payload = groundSentenceWrite(ex.payload, realSentences, targetLang)
    }
  }
  // Контроль покрытия: у КАЖДОГО слова должны быть все core-типы. Модель может пропустить/усечь —
  // до двух добивочных проходов маленькими батчами только по недобранным словам.
  for (let pass = 0; pass < 2; pass++) {
    const have = new Map() // ключ слова -> Set(типов)
    for (const ex of allExercises) {
      const k = exWordKey(ex.word_de)
      if (!have.has(k)) have.set(k, new Set())
      have.get(k).add(ex.type)
    }
    const missing = words.filter(w => {
      const set = have.get(exWordKey(w.word_de)) || new Set()
      return CORE_EXERCISE_TYPES.some(t => !set.has(t))
    })
    if (!missing.length) break
    for (let i = 0; i < missing.length; i += 5) {
      try {
        const extra = await gen(missing.slice(i, i + 5))
        for (const ex of extra) {
          const k = exWordKey(ex.word_de)
          const set = have.get(k) || new Set()
          if (set.has(ex.type)) continue // дубликаты не добавляем
          allExercises.push(ex)
          set.add(ex.type)
          have.set(k, set)
        }
      } catch (e) { console.error('generateExercises top-up:', e.message) }
    }
  }
  return allExercises
}

const LANG_NAMES = { ru: 'русском', en: 'English', uk: 'українською', de: 'Deutsch', fr: 'français', ar: 'العربية', bg: 'български', tr: 'Türkçe', es: 'español', sq: 'shqip' }

export async function checkSentence(wordDe, translationRu, userSentence, lang = 'ru', expected = null, taskRu = null) {
  const langName = LANG_NAMES[lang] || 'русском'
  // Есть эталон — значит это ПЕРЕВОД заданной фразы, а не свободное сочинение. Оцениваем
  // соответствие смыслу, а не литературность: ученик A1 не обязан угадать формулировку
  // слово в слово, и снижать оценку за синоним — значит наказывать за правильный ответ.
  const task = expected
    ? `The student was asked to translate this sentence into German: "${taskRu || ''}"
Reference translation: "${expected}"
Student's answer: "${userSentence}"

Evaluate:
1. Meaning matches the reference (synonyms and different word order are FINE)
2. Word "${wordDe}" is used in a correct form
3. Grammar is acceptable for A1
Be generous: if the meaning is right and the sentence is understandable, quality is 4-5.`
    : `Word to use: "${wordDe}" (${translationRu})
Student's sentence: "${userSentence}"

Evaluate:
1. Word "${wordDe}" is present (or its correct form)
2. Sentence is grammatically acceptable for A1 level
3. Meaning is clear`
  const prompt = `You are a German language teacher. A student (level A1) answered an exercise.

${task}

Reply ONLY with JSON (no markdown), feedback in ${langName}:
{
  "correct": true/false,
  "quality": 0-5,
  "feedback_ru": "Brief comment in ${langName} (1-2 sentences). If error — explain what exactly.",
  "corrected": "Corrected version if there are errors, otherwise null",
  "corrected_translation": "Translation of the corrected version into ${langName}; if corrected is null, translate the student's own sentence into ${langName}"
}

Шкала quality: 5=отлично, 4=хорошо, 3=приемлемо с мелкими ошибками, 2=понятно но с ошибками, 1=слово есть но много ошибок, 0=слово не использовано или непонятно`

  return parseJson(await ask(prompt, { max_tokens: 400 }))
}

export async function enrichWords(words, client = platformClient) {
  const list = words.map((w, i) => `${i + 1}. ${w.word_de}`).join('\n')
  const text = await ask(`Для каждого немецкого слова/выражения уровня A1 дай:
- translation_ru: перевод на русский (кратко)
- example_sentence: простое немецкое предложение с этим словом (A1 уровень)
- example_sentence_ru: перевод этого предложения на русский

Верни ТОЛЬКО JSON-массив в том же порядке, без пояснений:
[{"translation_ru": "...", "example_sentence": "...", "example_sentence_ru": "..."}, ...]

Слова:
${list}`, { max_tokens: 2048, client })
  const results = parseJson(text)
  return words.map((w, i) => ({ id: w.id, ...results[i] }))
}

// de включён: для НЕ-немецких курсов (англ/исп) немецкий — валидная родная локаль (иммигранты в Германии).
// Для немецкого курса de не выбирается через activeLocales (там ['ru']), так что дубля нет.
const TARGET_LANGS = ['en', 'uk', 'de', 'fr', 'ar', 'bg', 'tr', 'es', 'sq']
const TARGET_LANG_NAMES = { en: 'English', uk: 'українською', de: 'Deutsch', fr: 'français', ar: 'العربية', bg: 'български', tr: 'Türkçe', es: 'español', sq: 'shqip' }
// Для заголовков/описаний уроков переводим И на немецкий (учитель немецкого проверяет контент)
const META_LANGS = ['en', 'uk', 'de', 'fr', 'ar', 'bg', 'tr', 'es', 'sq']

// Перевод заголовка и описания урока с русского на локали интерфейса (для страницы «Сегодня»
// и списка уроков). База — русский (title/description уже по-русски). onlyLangs — активные локали.
// Возвращает { title: {lang: '...'}, description: {lang: '...'} }.
export async function translateLessonMeta(title, description, onlyLangs = null, client = platformClient) {
  const langs = onlyLangs ? META_LANGS.filter(l => onlyLangs.includes(l)) : META_LANGS
  if (!langs.length || !title) return { title: {}, description: {} }
  const prompt = `Переведи НАЗВАНИЕ и ОПИСАНИЕ урока с русского на языки: ${langs.map(l => TARGET_LANG_NAMES[l] || l).join(', ')}.
Сохраняй смысл, естественность и краткость. НЕ добавляй слово «Урок» и номера.

Название: "${title}"
Описание: "${(description || '').replace(/"/g, "'")}"

Верни СТРОГО JSON без markdown — для каждого языка объект {title, description}:
{ ${langs.map(l => `"${l}": {"title":"...","description":"..."}`).join(', ')} }`
  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 900, temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    const data = parseJson(res.choices[0].message.content)
    const titleT = {}, descT = {}
    for (const l of langs) {
      if (data[l]?.title) titleT[l] = String(data[l].title).trim()
      if (data[l]?.description) descT[l] = String(data[l].description).trim()
    }
    return { title: titleT, description: descT }
  } catch (e) {
    console.error('translateLessonMeta:', e.message)
    return { title: {}, description: {} }
  }
}

// onlyLangs — ограничить набор языков (напр. ['es'] для испанского контента: только ru[база]+es).
export async function translateWordsToAllLangs(words, onlyLangs = null, client = platformClient) {
  const langs = onlyLangs ? TARGET_LANGS.filter(l => onlyLangs.includes(l)) : TARGET_LANGS
  if (!langs.length) return {} // активна только базовая локаль — переводить нечего
  const jsonShape = `{ ${langs.map(l => `"${l}": "..."`).join(', ')} }`
  const BATCH = 20
  const results = {}
  for (let i = 0; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH)
    const list = batch.map(w => `${w.id}: ${w.word_de} → ${w.translation_ru}`).join('\n')
    try {
      const text = await ask(
        `Переведи эти слова на языки (${langs.join(', ')}).
Слова в формате "id: слово → перевод_на_русский".
Верни ТОЛЬКО JSON (без markdown): { "<id>": ${jsonShape} }
Переводы должны быть краткими (слово или словосочетание), как в словаре.

${list}`,
        { max_tokens: 4096, client }
      )
      const parsed = parseJson(text)
      for (const [id, t] of Object.entries(parsed)) results[id] = t
    } catch (e) {
      // Пропускаем битый батч — переводы для этих слов останутся пустыми
      console.error(`translateWordsToAllLangs: батч ${i}-${i + BATCH} пропущен: ${e.message}`)
    }
  }
  return results
}

// Возвращает объект { id: { en: {...}, fr: {...} } } для упражнений
// fill_blank: переводим немецкое предложение на 8 языков (включая ru)
// multiple_choice + sentence_write: переводим русский текст на 7 языков
export async function translateExercisePayloads(exercises, onlyLangs = null, client = platformClient) {
  const BATCH = 15
  const results = {}
  const FB_ALL = ['ru', 'en', 'uk', 'fr', 'ar', 'bg', 'tr', 'es', 'sq'] // fill_blank (вкл ru)
  const RU_ALL = ['en', 'uk', 'fr', 'ar', 'bg', 'tr', 'es', 'sq']       // mc/sw (из русского)
  const fbLangs = onlyLangs ? FB_ALL.filter(l => onlyLangs.includes(l)) : FB_ALL
  const ruLangs = onlyLangs ? RU_ALL.filter(l => onlyLangs.includes(l)) : RU_ALL

  for (let i = 0; i < exercises.length; i += BATCH) {
    const batch = exercises.slice(i, i + BATCH)

    // fill_blank переводим отдельно: немецкое → ru + 7 языков
    const fbItems = batch.filter(ex => ex.type === 'fill_blank')
    // mc и sw переводим вместе: русский → 7 языков
    const ruItems = batch.filter(ex => ex.type !== 'fill_blank').map(ex => {
      if (ex.type === 'multiple_choice') return { id: ex.id, type: ex.type, data: ex.payload.options }
      if (ex.type === 'sentence_write')  return { id: ex.id, type: ex.type, data: ex.payload.hint_ru || '' }
      return null
    }).filter(Boolean)

    // Перевод fill_blank (предложение изучаемого языка → активные локали)
    if (fbItems.length && fbLangs.length) {
      // Переводим ПОЛНОЕ предложение (пропуск заменён словом) — чтобы в ответе был
      // нормальный перевод без прочерка. Во время вопроса перевод не показываем.
      const list = fbItems.map(ex => {
        const full = (ex.payload.sentence || '').replace('___', ex.payload.blank || '')
        return `${ex.id}: ${JSON.stringify(full)}`
      }).join('\n')
      try {
        const text = await ask(
          `Переведи следующие предложения (полные, без пропусков) на языки (${fbLangs.join(', ')}).
Верни ТОЛЬКО JSON (без markdown):
{ "<id>": { ${fbLangs.map(l => `"${l}": "..."`).join(', ')} } }

${list}`,
          { max_tokens: 4096, client }
        )
        const parsed = parseJson(text)
        for (const [id, langs] of Object.entries(parsed)) results[id] = langs
      } catch (e) {
        console.error(`translateExercisePayloads fill_blank батч ${i}: ${e.message}`)
      }
    }

    // Перевод mc + sentence_write (русский → активные локали)
    if (ruItems.length && ruLangs.length) {
      const list = ruItems.map(it => `${it.id}|${it.type}: ${JSON.stringify(it.data)}`).join('\n')
      try {
        const text = await ask(
          `Переведи следующие фрагменты текста с русского на языки (${ruLangs.join(', ')}).
Для multiple_choice — массив вариантов, сохрани порядок.
Для sentence_write — одна строка.
Верни ТОЛЬКО JSON (без markdown):
{ "<id>": { ${ruLangs.map(l => `"${l}": <перевод>`).join(', ')} } }

${list}`,
          { max_tokens: 4096, client }
        )
        const parsed = parseJson(text)
        for (const [id, langs] of Object.entries(parsed)) results[id] = langs
      } catch (e) {
        console.error(`translateExercisePayloads ru батч ${i}: ${e.message}`)
      }
    }
  }
  return results
}

const LESSON_LANGS = ['de', 'en', 'uk', 'fr', 'ar', 'bg', 'tr', 'es', 'sq']

// Переводим заголовки уроков на 9 языков (включая de — немецкий и sq — албанский)
export async function translateLessonTitles(lessons) {
  const list = lessons.map(l => `${l.id}: ${l.title}`).join('\n')
  const text = await ask(
    `Переведи следующие названия уроков немецкого языка на 9 языков.
Верни ТОЛЬКО JSON (без markdown):
{ "<id>": { "de": "...", "en": "...", "uk": "...", "fr": "...", "ar": "...", "bg": "...", "tr": "...", "es": "...", "sq": "..." } }

${list}`,
    { max_tokens: 4096 }
  )
  return parseJson(text)
}

// Переводим варианты multiple_choice с русского на немецкий (для проверки учителем)
export async function translateMcOptionsToGerman(exercises) {
  const BATCH = 20
  const results = {}
  for (let i = 0; i < exercises.length; i += BATCH) {
    const batch = exercises.slice(i, i + BATCH)
    const list = batch.map(ex => `${ex.id}: ${JSON.stringify(ex.payload.options)}`).join('\n')
    try {
      const text = await ask(
        `Переведи следующие массивы вариантов ответов с русского на немецкий язык.
Сохрани порядок вариантов. Верни ТОЛЬКО JSON (без markdown):
{ "<id>": ["вариант1_de", "вариант2_de", "вариант3_de", "вариант4_de"] }

${list}`,
        { max_tokens: 4096 }
      )
      const parsed = parseJson(text)
      for (const [id, opts] of Object.entries(parsed)) results[id] = opts
    } catch (e) {
      console.error(`translateMcOptionsToGerman батч ${i}: ${e.message}`)
    }
  }
  return results
}

const LANG_NAMES_EN = {
  de: 'German', ru: 'Russian', en: 'English', uk: 'Ukrainian',
  fr: 'French', es: 'Spanish', tr: 'Turkish', ar: 'Arabic', bg: 'Bulgarian', sq: 'Albanian',
}

export async function translateParagraphs(paragraphs, sourceLang = 'de', targetLang = 'ru', model = 'gpt-4o') {
  const from = LANG_NAMES_EN[sourceLang] || sourceLang
  const to   = LANG_NAMES_EN[targetLang] || targetLang
  const list = paragraphs.map((p, i) => `${i + 1}: ${p}`).join('\n\n')
  const text = await ask(
    `Translate the following ${from} paragraphs to ${to}.
Return ONLY a JSON array of strings in the same order (no markdown): ["translation1", "translation2", ...]

${list}`,
    { model, max_tokens: 4096 }
  )
  return parseJson(text)
}

export async function translateSingle(text, sourceLang, targetLang, model = 'gpt-4o') {
  const from = LANG_NAMES_EN[sourceLang] || sourceLang
  const to   = LANG_NAMES_EN[targetLang] || targetLang
  const result = await ask(
    `Translate this ${from} text to ${to}. Return only the translation, nothing else:\n\n${text}`,
    { model, max_tokens: 1024 }
  )
  return result.trim()
}

export async function explainGrammarError({ de, type, userAnswer, correctAnswer }) {
  const typeNames = { fill_blank: 'Вставить слово', multiple_choice: 'Выбор ответа', dictation: 'Диктант', letter_fill: 'Вставить буквы', sentence_write: 'Написать предложение' }
  const typeName = typeNames[type] || type
  const text = await ask(
    `Ученик изучает немецкий (уровень A1).
Тип упражнения: ${typeName}.
Фраза/слово: "${de}"
Ответ ученика: "${userAnswer}"
Правильный ответ: "${correctAnswer}"

Объясни коротко (2-3 предложения на русском) почему правильный ответ именно "${correctAnswer}".
Назови грамматическое правило если есть. Только русский язык, без немецких терминов.`,
    { max_tokens: 300 }
  )
  return text.trim()
}

export async function justifyAnswer({ wordDe, correctAnswer, sentence, type }) {
  const typeNames = { fill_blank: 'заполни пропуск', multiple_choice: 'выбор ответа', dictation: 'диктант', letter_fill: 'добавь букву', flashcard: 'карточка', sentence_write: 'напиши предложение' }
  const text = await ask(
    `Ты объясняешь немецкое слово/фразу ученику уровня A1 простым языком — как другу, не как учителю.

Слово / правильный ответ: "${correctAnswer}"
${wordDe && wordDe !== correctAnswer ? `Контекст / предложение: "${wordDe}"` : ''}
${sentence ? `Предложение: "${sentence}"` : ''}
Тип упражнения: ${typeNames[type] || type}

Объясни в 3–5 предложениях на русском:
1. Что это слово значит буквально и в каких ситуациях используется
2. Если у слова несколько значений — перечисли основные
3. Дай один живой пример из реальной жизни (не из учебника)
4. НЕ объясняй грамматику — только смысл и контекст употребления

Пиши просто, как объясняешь ребёнку 10 лет.`,
    { max_tokens: 400 }
  )
  return text.trim()
}

const LANG_NAMES_RU = { ru: 'русский', en: 'английский', de: 'немецкий', uk: 'украинский', fr: 'французский', ar: 'арабский', bg: 'болгарский', tr: 'турецкий', es: 'испанский', sq: 'албанский' }

export async function translateText(text, from = 'de', to = 'ru') {
  const fromName = LANG_NAMES_RU[from] || from
  const toName   = LANG_NAMES_RU[to]   || to
  const result = await ask(
    `Переведи следующий текст с ${fromName} на ${toName}. Верни ТОЛЬКО перевод, без кавычек, пояснений и комментариев.\n\nТекст: ${text}`,
    { max_tokens: 256 }
  )
  return result.trim()
}

const TRAINER_CHARACTERS = {
  lena:  { name: 'Лена',  emoji: '🧑‍🏫', desc: 'досвідчена вчителька німецької мови з Берліна. Ти терпляча, підбадьорююча, пояснюєш граматику просто' },
  max:   { name: 'Макс',  emoji: '☕',    desc: 'бариста у берлінській кав\'ярні. Ти дружній, невимушений, говориш про каву та меню' },
  hanna: { name: 'Ганна', emoji: '🛒',   desc: 'продавчиня у супермаркеті. Ти ввічлива, допомагаєш знайти товари, розповідаєш про ціни' },
  otto:  { name: 'Отто',  emoji: '🏨',   desc: 'портьє в готелі у центрі Берліна. Ти професійний, допомагаєш з заселенням та туристичними порадами' },
  hr:    { name: 'Фрау Вебер', emoji: '💼', desc: 'HR-менеджерка німецької компанії. Ти проводиш співбесіду на роботу: ввічлива, професійна, ставиш типові питання роботодавця та підбадьорюєш кандидата' },
  pablo: { name: 'Pablo Seoshkin', emoji: '🤓', desc: 'засновник цього застосунку, доброзичливий наставник. Ти підбадьорюєш, пояснюєш просто, віриш в учня і робиш навчання теплим' },
}

const TRAINER_SCENARIOS = {
  intro:     'Знайомство — учень вперше зустрічає тебе і представляється',
  cafe:      'У кав\'ярні — учень замовляє напої та їжу',
  shopping:  'Покупки — учень купує продукти або одяг',
  hotel:     'Готель — учень заселяється або запитує про послуги',
  direction: 'Орієнтування у місті — учень просить дорогу або пояснює де знаходиться',
  free:      'Вільна бесіда на будь-яку тему',
  lesson:    'Тренування слів конкретного уроку — веди коротку розмову, у якій учень вживає САМЕ слова цього уроку. Став прості питання, перевіряй значення і вимову цих слів, хвали спроби. Не йди в сторонні теми. Рівень A1',
  family_love: 'Любов до дітей — ти допомагаєш батькові навчитися говорити ласкаві слова та компліменти своїм дітям німецькою. Пропонуй теплі прості фрази (компліменти доньці, добрі слова синові, побажання на ніч, похвала). Хвали спроби, підказуй нові фрази, підтримуй теплу атмосферу. Рівень A1-A2',
  interview_it:    'Співбесіда на роботу в IT-агентство. Ти роботодавець: питаєш про досвід, технічні навички, попередні проєкти та чому кандидат хоче цю роботу. Питання прості, рівень A1-A2',
  interview_clean: 'Співбесіда на роботу в клінінгову компанію (прибирання приміщень). Ти роботодавець: питаєш про досвід прибирання, готовність до фізичної роботи, графік та надійність. Питання прості, рівень A1-A2',
  interview_food:  'Співбесіда на роботу в кафе або ресторан (офіціант або кухня). Ти роботодавець: питаєш про досвід у сфері обслуговування, роботу в команді, готовність працювати ввечері та у вихідні. Питання прості, рівень A1-A2',
  interview_hotel: 'Співбесіда на роботу в готель (обслуговуючий персонал — покоївка, портьє). Ти роботодавець: питаєш про досвід, знання мов, готовність працювати позмінно та ставлення до гостей. Питання прості, рівень A1-A2',
}

// Мови інтерфейсу → назва мови для підказок/перекладу тренера
const TRAINER_LANG_NAMES = {
  uk: 'українською',
  ru: 'російською (по-русски)',
  en: 'English',
  de: 'German (auf Deutsch)',
  bg: 'Bulgarian (български)',
  tr: 'Turkish (Türkçe)',
  ar: 'Arabic (العربية)',
  es: 'Spanish (español)',
  fr: 'French (français)',
  sq: 'Albanian (shqip)',
}

// bilingual (§1.8/§5 ТЗ): переводить ли реплику тренера на язык ученика.
// По умолчанию ВЫКЛ — тренер говорит только на изучаемом языке, без перевода (§5).
// Тумблер «сначала на родном» может включить перевод; тогда translation заполняется.
// Изучаемый язык → как называть его в промте тренера (на каком языке отвечать)
const LEARN_LANG_NAMES = {
  de: 'німецькою мовою (German)', en: 'англійською мовою (English)', es: 'іспанською мовою (español)',
  fr: 'французькою мовою (français)', it: 'італійською мовою (italiano)', pt: 'португальською мовою (português)',
}
export async function chatWithTrainer({ messages, character = 'lena', scenario = 'free', userLang = 'uk', memory = null, targetWords = null, bilingual = false, targetLang = 'de' }) {
  const char = TRAINER_CHARACTERS[character] || TRAINER_CHARACTERS.lena
  const scenarioDesc = TRAINER_SCENARIOS[scenario] || TRAINER_SCENARIOS.free
  // Мова підказок/перекладу = мова інтерфейсу учня (усі 10 локалей)
  const userLangName = TRAINER_LANG_NAMES[userLang] || TRAINER_LANG_NAMES.uk
  // Мова, якою тренер ВЕДЕ розмову = вивчувана мова учня (de/en/es…)
  const learnLangName = LEARN_LANG_NAMES[targetLang] || LEARN_LANG_NAMES.de

  // Режим «Тренер по уроку»: фокус на словах конкретного урока
  let wordsBlock = ''
  if (Array.isArray(targetWords) && targetWords.length) {
    wordsBlock = `\nСЛОВА ЦЬОГО УРОКУ (тренуй САМЕ їх: природно вплітай у діалог, став питання так, щоб учень вживав ці слова, м'яко перевіряй чи він їх знає):\n${targetWords.slice(0, 25).join(', ')}\n`
  }

  // Память о ученике (§3 ТЗ): накопительная выжимка + топ повторяющихся ошибок
  let memoryBlock = ''
  if (memory && (memory.summary_text || (memory.recurring_mistakes || []).length)) {
    const sum = memory.summary_text ? `Що ти вже знаєш про учня: ${memory.summary_text}` : ''
    const mist = (memory.recurring_mistakes || []).slice(0, 3).map(m => m.type).filter(Boolean).join(', ')
    const mistLine = mist ? `Його повторювані помилки — м'яко давай практику на них: ${mist}.` : ''
    memoryBlock = `\nПАМʼЯТЬ ПРО УЧНЯ (ти спілкувався раніше — поводься природно, ненавʼязливо покажи, що памʼятаєш його):\n${sum}\n${mistLine}\n`
  }

  // Правило перекладу залежить від bilingual: за замовчуванням перекладу немає (§5).
  const translationRule = bilingual
    ? `5. Дай переклад своєї відповіді мовою: ${userLangName} (translation)`
    : `5. НЕ перекладай свою відповідь. Поле translation завжди null — учень має розуміти з контексту (§5).`
  const translationSchema = bilingual ? '"translation":"..."' : '"translation":null'

  const systemPrompt = `Ти — ${char.emoji} ${char.name}, ${char.desc}.
Рівень учня: A1–A2 (початківець).
Сценарій: ${scenarioDesc}.
${wordsBlock}${memoryBlock}
Правила:
1. Основна відповідь ЗАВЖДИ тільки ${learnLangName} (reply)
2. Якщо учень написав іншою мовою — зрозумій сенс та відповідай так, ніби він написав правильно ${learnLangName}
3. Виправляй помилки учня дружньо, без осуду (correction — мовою: ${userLangName})
4. Якщо помилок немає — correction: null
${translationRule}
6. Речення короткі, прості, рівень A1
7. Вітайся ТІЛЬКИ на початку розмови, а не в кожній репліці. Не повторюй привітання.
8. НЕ хвали і НЕ лай у кожній репліці ("молодець", "чудово", "неправильно" тощо). Веди природний живий діалог, як реальна людина. Оцінка і розбір помилок — не в кожній фразі, а в підсумковому звіті сесії.

СТРОГО повертай лише JSON без markdown:
{"reply":"...","correction":"...або null",${translationSchema}}`

  const res = await platformClient.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    response_format: { type: 'json_object' },   // модель обязана вернуть валидный JSON
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  })
  const content = res.choices[0].message.content
  try {
    const parsed = parseJson(content)
    // Гарантия §5: без bilingual перевода не отдаём, даже если модель его вернула
    if (!bilingual) parsed.translation = null
    return parsed
  } catch {
    // Подстраховка: если модель всё же вернула не-JSON — не падаем, берём как reply
    return { reply: content, correction: null, translation: null }
  }
}

// §3 ТЗ: суммаризация завершённой сессии в накопительную память.
// Вход: текущая выжимка + лог сессии → структурное обновление памяти.
export async function summarizeTrainerSession({ existingSummary = '', messages = [], userLang = 'uk' }) {
  const langName = TRAINER_LANG_NAMES[userLang] || TRAINER_LANG_NAMES.uk
  const dialog = (messages || [])
    .map(m => `${m.role === 'user' ? 'Учень' : 'Тренер'}: ${m.text}${m.correction && m.correction !== 'null' ? ` [виправлення: ${m.correction}]` : ''}`)
    .join('\n')

  const prompt = `Ти ведеш памʼять про учня, який тренує німецьку з AI-тренером.
Поточна памʼять (вижимка минулих розмов): ${existingSummary || '(порожньо, це перша сесія)'}

Лог щойно завершеної сесії:
${dialog}

Онови памʼять. Поверни СТРОГО JSON без markdown:
{"summary_text":"коротка накопичувальна вижимка (2-4 речення: хто учень, що обговорювали, над чим працює)","known_facts":{},"recurring_mistakes":[{"type":"тип помилки коротко","example":"приклад"}],"topics_covered":[{"topic":"тема сесії"}]}

ДУЖЕ ВАЖЛИВО: поле summary_text напиши САМЕ мовою користувача — ${langName}. Це мова інтерфейсу учня, а не обовʼязково українська.`

  const res = await platformClient.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 700,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  try {
    return parseJson(res.choices[0].message.content)
  } catch {
    return { summary_text: existingSummary, known_facts: {}, recurring_mistakes: [], topics_covered: [] }
  }
}

export async function translateSentences(pairs) {
  const BATCH = 25
  const all = []
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH)
    const list = batch.map((p, j) => `${j + 1}. ${p.sentence}`).join('\n')
    const text = await ask(`Переведи каждое немецкое предложение на русский язык. Верни ТОЛЬКО JSON-массив строк в том же порядке, без пояснений:\n${list}`, { max_tokens: 4096 })
    const translations = parseJson(text)
    batch.forEach((p, j) => all.push({ id: p.id, translation: translations[j] || null }))
  }
  return all
}

// ─── Игра «Класс говорит» ───────────────────────────────────────────────────
// Генерируем N пар «вопрос — ответ» на немецком A1 из слов урока.
// Каждая пара — связный мини-диалог (ответ отвечает на вопрос).
export async function generateClassPairs(words, count = 12) {
  const wl = words.map(w => w.word_de).slice(0, 60).join(', ')
  const prompt = `Составь ${count} РАЗНЫХ пар «вопрос — ответ» на немецком уровня A1 для чтения вслух в классе, используя лексику урока: ${wl}.
В каждой паре ответ логично отвечает на вопрос. Предложения короткие, простые, естественные, пары не повторяются.
Верни ТОЛЬКО JSON: {"pairs":[{"question":"...?","answer":"..."}]}`
  const data = parseJson(await ask(prompt, { max_tokens: 4096 }))
  return (data.pairs || []).filter(p => p.question && p.answer).slice(0, count)
}

// Перевод фраз на все локали интерфейса (кроме de). Возвращает массив объектов
// {ru, uk, en, bg, tr, ar, es, fr, sq} в том же порядке, что и sentences.
export async function translateSentencesAllLangs(sentences) {
  const LANGS = { ru: 'русский', uk: 'українська', en: 'English', bg: 'български', tr: 'Türkçe', ar: 'العربية', es: 'español', fr: 'français', sq: 'shqip' }
  const codes = Object.keys(LANGS)
  const out = sentences.map(() => ({}))
  const BATCH = 12
  for (let i = 0; i < sentences.length; i += BATCH) {
    const batch = sentences.slice(i, i + BATCH)
    const list = batch.map((s, j) => `${j + 1}. ${s}`).join('\n')
    const langList = codes.map(c => `"${c}" (${LANGS[c]})`).join(', ')
    const prompt = `Переведи каждое немецкое предложение на ВСЕ языки: ${langList}.
Верни ТОЛЬКО JSON вида {"1":{"ru":"...","uk":"...","en":"...","bg":"...","tr":"...","ar":"...","es":"...","fr":"...","sq":"..."}, ...} для номеров 1..${batch.length}.
Предложения:\n${list}`
    try {
      const map = parseJson(await ask(prompt, { max_tokens: 8192 }))
      batch.forEach((_, j) => { out[i + j] = map[String(j + 1)] || {} })
    } catch (e) { console.error('translateSentencesAllLangs batch', e.message) }
  }
  return out
}
