import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { config } from '../config.js'

const client = new OpenAI({ apiKey: config.openaiApiKey })

function parseJson(text) {
  let clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  // Убираем управляющие символы внутри JSON-строк (частая проблема с GPT)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  try {
    return JSON.parse(clean)
  } catch (e) {
    const lastComma = clean.lastIndexOf('},')
    if (lastComma > 0) {
      const candidate = (clean.startsWith('[') ? '[' : '{') + clean.slice(1, lastComma + 1) + (clean.startsWith('[') ? ']' : '}')
      try { return JSON.parse(candidate) } catch {}
    }
    throw new Error(`Ошибка парсинга JSON от GPT (${clean.length} символов): ${e.message}`)
  }
}

async function ask(prompt, { model = 'gpt-4o-mini', max_tokens = 4096 } = {}) {
  const res = await client.chat.completions.create({
    model,
    max_tokens,
    messages: [{ role: 'user', content: prompt }],
  })
  return res.choices[0].message.content
}

// ─── Целевые (изучаемые) языки — мульти-таргет ──────────────────────────────
const LEARN_LANGS = {
  de: { name: 'немецкий', adjN: 'немецкие', tts: 'de-DE', nounRule: 'существительные ВСЕГДА с артиклем (der/die/das) и с большой буквы' },
  es: { name: 'испанский', adjN: 'испанские', tts: 'es-ES', nounRule: 'существительные с артиклем (el/la/los/las)' },
  fr: { name: 'французский', adjN: 'французские', tts: 'fr-FR', nounRule: 'существительные с артиклем (le/la/les)' },
  it: { name: 'итальянский', adjN: 'итальянские', tts: 'it-IT', nounRule: 'существительные с артиклем (il/la/lo)' },
  en: { name: 'английский', adjN: 'английские', tts: 'en-US', nounRule: 'существительные' },
  pt: { name: 'португальский', adjN: 'португальские', tts: 'pt-PT', nounRule: 'существительные с артиклем (o/a)' },
}
const TL = (code) => LEARN_LANGS[code] || LEARN_LANGS.de
export function targetTtsLocale(code) { return TL(code).tts }
export function targetLangName(code) { return TL(code).name }

const VISION_PROMPT = (t) => `Это фото страницы учебника или тетради школьника, изучающего ${t.name} язык на уровне A1.
Распознай весь текст, включая рукописный. Выдели:
(а) новые ${t.adjN} слова с переводом на русский
(б) грамматические правила/конструкции
(в) примеры предложений

Верни ТОЛЬКО валидный JSON без markdown-обёртки и без блока \`\`\`json:
{
  "words": [{"word_de": "слово", "translation_ru": "перевод", "example_sentence": "пример или null"}],
  "grammar_points": [{"description": "правило", "example": "пример или null"}],
  "example_sentences": ["предложение1"],
  "raw_text": "весь распознанный текст"
}`

function getMimeType(filepath) {
  const ext = filepath.split('.').pop().toLowerCase()
  return { png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg'
}

export async function extractFromPhoto(filepath, targetLang = 'de') {
  const imageData = readFileSync(filepath)
  const base64 = imageData.toString('base64')
  const mimeType = getMimeType(filepath)

  const res = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
        { type: 'text', text: VISION_PROMPT(TL(targetLang)) },
      ],
    }],
  })

  return parseJson(res.choices[0].message.content)
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
  const res = await client.chat.completions.create({
    model: 'gpt-4o', max_tokens: 4096,
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
      { type: 'text', text: prompt },
    ] }],
  })
  return (parseJson(res.choices[0].message.content).words || []).filter(w => w && w.de)
}

const MERGE_PROMPT = (t) => `Объедини данные из нескольких фото страниц урока (${t.name} язык, A1) в единый конспект.
Правила нормализации (соблюдай строго):
- ${t.nounRule}. Если род не указан в тексте — определи сам, ты знаешь ${t.name} язык. Не оставляй существительное без артикля (если в языке есть артикли).
- Глаголы — в инфинитиве, с маленькой буквы.
- Прилагательные, наречия, частицы, местоимения — с маленькой буквы.
- Убери дубли: слово с артиклем и без него — это ОДНО слово, оставь форму с артиклем. Разный регистр одного слова — не новый вход (кроме случаев, где регистр меняет смысл, напр. нем. "Sie/sie").
- Объедини грамматические правила без дублей.

Верни ТОЛЬКО JSON без markdown (поле word_de = слово изучаемого языка):
{"words": [{"word_de": "...", "translation_ru": "...", "example_sentence": "..."}], "grammar_points": [{"description": "...", "example": "..."}]}`

// Ключ для дедупа: без ведущего артикля и регистра, чтобы "Kaffee" и "der Kaffee"
// схлопывались в одно. Sie/sie и Ihr/ihr — разные слова, для них ключ различаем.
function wordKey(word_de) {
  const s = (word_de || '').trim()
  const bare = s.toLowerCase().replace(/^(der|die|das)\s+/, '').trim()
  if (bare === 'sie' || bare === 'ihr') return s // регистр важен
  return bare
}
const hasArticle = (s) => /^(der|die|das)\s/i.test(s || '')

async function mergeChunk(extractions, transcription = null, existingWords = [], targetLang = 'de') {
  const slim = extractions.map(e => ({ words: e.words || [], grammar_points: e.grammar_points || [] }))
  const input = JSON.stringify({ extractions: slim, transcription }, null, 2)
  // Умная обработка тетради/доски: даём модели список уже имеющихся слов урока,
  // чтобы она НЕ дублировала их, но могла исправить форму (напр. дописать артикль).
  const existingBlock = existingWords.length
    ? `\n\nВ УРОКЕ УЖЕ ЕСТЬ эти слова — не добавляй их повторно. Если новое фото уточняет слово (напр. даёт артикль или пример) — верни исправленную форму, иначе пропусти. Возвращай в основном НОВЫЕ слова:\n${existingWords.slice(0, 200).join(', ')}`
    : ''
  return parseJson(await ask(`${MERGE_PROMPT(TL(targetLang))}\n\nДанные:\n${input}${existingBlock}`, { max_tokens: 8192 }))
}

export async function mergeLesson(extractions, transcription = null, existingWords = [], targetLang = 'de') {
  const CHUNK = 6
  if (extractions.length <= CHUNK) {
    return mergeChunk(extractions, transcription, existingWords, targetLang)
  }

  const chunks = []
  for (let i = 0; i < extractions.length; i += CHUNK) {
    chunks.push(extractions.slice(i, i + CHUNK))
  }

  const partials = []
  for (let i = 0; i < chunks.length; i++) {
    const partial = await mergeChunk(chunks[i], i === 0 ? transcription : null, existingWords, targetLang)
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

  return { words: [...seenWords.values()], grammar_points }
}

// AI-название и описание урока по его содержимому (когда учитель не задал тему).
// Возвращает { title, description } по-русски.
export async function generateLessonMeta(words = [], grammarPoints = [], targetLang = 'de') {
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

const EXERCISES_PROMPT = (t) => `На основе слов и грамматики урока (${t.name} язык, A1) создай упражнения для школьника. Объясняй максимально просто и понятно, как для маленьких детей.

⚠️ ГЛАВНОЕ ПРАВИЛО ЯЗЫКА:
- Все предложения на изучаемом языке (поля "sentence", "example") — на ЧИСТОМ ${t.name} языке (A1), короткие и естественные.
- НИКОГДА не смешивай русский и ${t.name} в одном предложении.
- НИКОГДА не пиши мета-пояснения вида «X значит Y».
- Даже для служебных слов (предлоги, местоимения, глаголы) придумай нормальное предложение на ${t.name} языке, где слово стоит в естественном контексте.
- Русский язык допустим только в переводах ("answer", "translation_ru", "options" у multiple_choice) и в русских подсказках ("hint_ru").

Для каждого слова создай 5 упражнений — по одному каждого типа:
1. flashcard — карточка "слово изучаемого языка ↔ перевод"
2. fill_blank — короткое предложение на ${t.name} языке с пропуском ___ на месте слова (blank = само слово). options — РОВНО 3 слова на ${t.name} языке: правильное (в точности = blank) и 2 похожих отвлекающих. НЕ русские! (ученик вставляет выбранное слово прямо в пропуск)
3. multiple_choice — выбор правильного русского перевода слова изучаемого языка из 4 вариантов
4. sentence_write — задание написать своё предложение с этим словом (уровень A1, простое)
5. letter_fill — слово с пропущенными буквами (замени 1-2 буквы внутри слова на "_", первую букву всегда оставляй видимой; артикль оставляй без изменений)

Верни ТОЛЬКО JSON массив без markdown:
[
  {"type": "flashcard", "word_de": "слово", "payload": {"question": "немецкое слово", "answer": "русский перевод"}},
  {"type": "fill_blank", "word_de": "Katze", "payload": {"sentence": "Die ___ trinkt Milch.", "blank": "Katze", "options": ["Katze","Hund","Maus"]}},
  {"type": "multiple_choice", "word_de": "слово", "payload": {"question": "Wie heißt das auf Russisch: слово?", "options": ["вар1","вар2","вар3","вар4"], "correct": 0}},
  {"type": "sentence_write", "word_de": "слово", "payload": {"word_de": "слово", "translation_ru": "перевод", "hint_ru": "Напиши простое предложение со словом «слово». Например: приветствие, описание, вопрос.", "example": "Пример правильного предложения на немецком"}},
  {"type": "letter_fill", "word_de": "слово", "payload": {"word_de": "Hund", "translation_ru": "собака", "masked": "H_nd", "answer": "Hund"}}
]`

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
    all.push(...parseJson(text))
  }
  return all
}

function shuffleOptions(ex) {
  if (ex.type !== 'multiple_choice' || !Array.isArray(ex.payload?.options)) return ex
  const { options, correct } = ex.payload
  const correctAnswer = options[correct ?? 0]
  const shuffled = [...options].sort(() => Math.random() - 0.5)
  return { ...ex, payload: { ...ex.payload, options: shuffled, correct: shuffled.indexOf(correctAnswer) } }
}

export async function generateExercises(words, grammar_points, targetLang = 'de') {
  const allExercises = []
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)
    const input = JSON.stringify({ words: batch, grammar_points }, null, 2)
    const text = await ask(`${EXERCISES_PROMPT(TL(targetLang))}\n\nКонспект урока:\n${input}`, { max_tokens: 8192 })
    allExercises.push(...parseJson(text).map(shuffleOptions))
  }
  return allExercises
}

const LANG_NAMES = { ru: 'русском', en: 'English', uk: 'українською', de: 'Deutsch', fr: 'français', ar: 'العربية', bg: 'български', tr: 'Türkçe', es: 'español', sq: 'shqip' }

export async function checkSentence(wordDe, translationRu, userSentence, lang = 'ru') {
  const langName = LANG_NAMES[lang] || 'русском'
  const prompt = `You are a German language teacher. A student (level A1) wrote a sentence.

Word to use: "${wordDe}" (${translationRu})
Student's sentence: "${userSentence}"

Evaluate:
1. Word "${wordDe}" is present (or its correct form)
2. Sentence is grammatically acceptable for A1 level
3. Meaning is clear

Reply ONLY with JSON (no markdown), feedback in ${langName}:
{
  "correct": true/false,
  "quality": 0-5,
  "feedback_ru": "Brief comment in ${langName} (1-2 sentences). If error — explain what exactly.",
  "corrected": "Corrected version if there are errors, otherwise null"
}

Шкала quality: 5=отлично, 4=хорошо, 3=приемлемо с мелкими ошибками, 2=понятно но с ошибками, 1=слово есть но много ошибок, 0=слово не использовано или непонятно`

  return parseJson(await ask(prompt, { max_tokens: 400 }))
}

export async function enrichWords(words) {
  const list = words.map((w, i) => `${i + 1}. ${w.word_de}`).join('\n')
  const text = await ask(`Для каждого немецкого слова/выражения уровня A1 дай:
- translation_ru: перевод на русский (кратко)
- example_sentence: простое немецкое предложение с этим словом (A1 уровень)
- example_sentence_ru: перевод этого предложения на русский

Верни ТОЛЬКО JSON-массив в том же порядке, без пояснений:
[{"translation_ru": "...", "example_sentence": "...", "example_sentence_ru": "..."}, ...]

Слова:
${list}`, { max_tokens: 2048 })
  const results = parseJson(text)
  return words.map((w, i) => ({ id: w.id, ...results[i] }))
}

const TARGET_LANGS = ['en', 'uk', 'fr', 'ar', 'bg', 'tr', 'es', 'sq']

export async function translateWordsToAllLangs(words) {
  const BATCH = 20
  const results = {}
  for (let i = 0; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH)
    const list = batch.map(w => `${w.id}: ${w.word_de} → ${w.translation_ru}`).join('\n')
    try {
      const text = await ask(
        `Переведи эти немецкие слова на 8 языков (en, uk, fr, ar, bg, tr, es, sq).
Слова в формате "id: слово → перевод_на_русский".
Верни ТОЛЬКО JSON (без markdown): { "<id>": { "en": "...", "uk": "...", "fr": "...", "ar": "...", "bg": "...", "tr": "...", "es": "...", "sq": "..." } }
Переводы должны быть краткими (слово или словосочетание), как в словаре.

${list}`,
        { max_tokens: 4096 }
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
export async function translateExercisePayloads(exercises) {
  const BATCH = 15
  const results = {}

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

    // Перевод fill_blank (немецкое предложение → ru, en, uk, fr, ar, bg, tr, es)
    if (fbItems.length) {
      // Переводим ПОЛНОЕ предложение (пропуск заменён словом) — чтобы в ответе был
      // нормальный перевод без прочерка. Во время вопроса перевод не показываем.
      const list = fbItems.map(ex => {
        const full = (ex.payload.sentence || '').replace('___', ex.payload.blank || '')
        return `${ex.id}: ${JSON.stringify(full)}`
      }).join('\n')
      try {
        const text = await ask(
          `Переведи следующие немецкие предложения (полные, без пропусков) на 9 языков (ru, en, uk, fr, ar, bg, tr, es, sq).
Верни ТОЛЬКО JSON (без markdown):
{ "<id>": { "ru": "...", "en": "...", "uk": "...", "fr": "...", "ar": "...", "bg": "...", "tr": "...", "es": "...", "sq": "..." } }

${list}`,
          { max_tokens: 4096 }
        )
        const parsed = parseJson(text)
        for (const [id, langs] of Object.entries(parsed)) results[id] = langs
      } catch (e) {
        console.error(`translateExercisePayloads fill_blank батч ${i}: ${e.message}`)
      }
    }

    // Перевод mc + sentence_write (русский → 7 языков)
    if (ruItems.length) {
      const list = ruItems.map(it => `${it.id}|${it.type}: ${JSON.stringify(it.data)}`).join('\n')
      try {
        const text = await ask(
          `Переведи следующие фрагменты текста с русского на 8 языков (en, uk, fr, ar, bg, tr, es, sq).
Для multiple_choice — массив вариантов, сохрани порядок.
Для sentence_write — одна строка.
Верни ТОЛЬКО JSON (без markdown):
{ "<id>": { "en": <перевод>, "uk": <перевод>, "fr": <перевод>, "ar": <перевод>, "bg": <перевод>, "tr": <перевод>, "es": <перевод>, "sq": <перевод> } }

${list}`,
          { max_tokens: 4096 }
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

export async function translateParagraphs(paragraphs, sourceLang = 'de', targetLang = 'ru', model = 'gpt-4o-mini') {
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

export async function translateSingle(text, sourceLang, targetLang, model = 'gpt-4o-mini') {
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

export async function chatWithTrainer({ messages, character = 'lena', scenario = 'free', userLang = 'uk', memory = null, targetWords = null }) {
  const char = TRAINER_CHARACTERS[character] || TRAINER_CHARACTERS.lena
  const scenarioDesc = TRAINER_SCENARIOS[scenario] || TRAINER_SCENARIOS.free
  // Мова підказок/перекладу = мова інтерфейсу учня (усі 10 локалей)
  const userLangName = TRAINER_LANG_NAMES[userLang] || TRAINER_LANG_NAMES.uk

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

  const systemPrompt = `Ти — ${char.emoji} ${char.name}, ${char.desc}.
Рівень учня: A1–A2 (початківець).
Сценарій: ${scenarioDesc}.
${wordsBlock}${memoryBlock}
Правила:
1. Основна відповідь ЗАВЖДИ тільки німецькою мовою (reply)
2. Якщо учень написав не-німецькою — зрозумій сенс та відповідай так, ніби він написав правильно по-німецьки
3. Виправляй помилки учня дружньо, без осуду (correction — мовою: ${userLangName})
4. Якщо помилок немає — correction: null
5. Дай переклад своєї відповіді мовою: ${userLangName} (translation)
6. Речення короткі, прості, рівень A1

СТРОГО повертай лише JSON без markdown:
{"reply":"...","correction":"...або null","translation":"..."}`

  const res = await client.chat.completions.create({
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
    return parseJson(content)
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

  const res = await client.chat.completions.create({
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
