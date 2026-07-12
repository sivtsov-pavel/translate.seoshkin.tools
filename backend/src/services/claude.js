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

const VISION_PROMPT = `Это фото страницы учебника или тетради школьника, изучающего немецкий язык на уровне A1.
Распознай весь текст, включая рукописный. Выдели:
(а) новые немецкие слова с переводом на русский
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

export async function extractFromPhoto(filepath) {
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
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
  })

  return parseJson(res.choices[0].message.content)
}

const MERGE_PROMPT = `Объедини данные из нескольких фото страниц урока немецкого (A1) в единый конспект.
Правила:
- Убери дубли слов (оставь лучший вариант с переводом и примером)
- Нормализуй существительные: добавь артикль (der/die/das) если известен
- Объедини грамматические правила без дублей

Верни ТОЛЬКО JSON без markdown:
{"words": [{"word_de": "...", "translation_ru": "...", "example_sentence": "..."}], "grammar_points": [{"description": "...", "example": "..."}]}`

async function mergeChunk(extractions, transcription = null) {
  const slim = extractions.map(e => ({ words: e.words || [], grammar_points: e.grammar_points || [] }))
  const input = JSON.stringify({ extractions: slim, transcription }, null, 2)
  return parseJson(await ask(`${MERGE_PROMPT}\n\nДанные:\n${input}`, { max_tokens: 8192 }))
}

export async function mergeLesson(extractions, transcription = null) {
  const CHUNK = 6
  if (extractions.length <= CHUNK) {
    return mergeChunk(extractions, transcription)
  }

  const chunks = []
  for (let i = 0; i < extractions.length; i += CHUNK) {
    chunks.push(extractions.slice(i, i + CHUNK))
  }

  const partials = []
  for (let i = 0; i < chunks.length; i++) {
    const partial = await mergeChunk(chunks[i], i === 0 ? transcription : null)
    partials.push(partial)
  }

  const seenWords = new Map()
  for (const p of partials) {
    for (const w of (p.words || [])) {
      const key = w.word_de?.toLowerCase().trim()
      if (key && !seenWords.has(key)) seenWords.set(key, w)
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

const EXERCISES_PROMPT = `На основе слов и грамматики урока немецкого (A1) создай упражнения для школьника.

Для каждого слова создай 5 упражнений — по одному каждого типа:
1. flashcard — карточка "немецкое слово ↔ перевод"
2. fill_blank — предложение с пропуском (используй example_sentence если есть, или придумай простое)
3. multiple_choice — выбор правильного перевода из 4 вариантов
4. sentence_write — задание написать своё предложение с этим словом (уровень A1, простое)
5. letter_fill — слово с пропущенными буквами (замени 1-2 буквы внутри слова на "_", первую букву всегда оставляй видимой; артикль der/die/das оставляй без изменений)

Верни ТОЛЬКО JSON массив без markdown:
[
  {"type": "flashcard", "word_de": "слово", "payload": {"question": "немецкое слово", "answer": "русский перевод"}},
  {"type": "fill_blank", "word_de": "слово", "payload": {"sentence": "предложение с ___ пропуском", "blank": "слово", "options": ["подсказка1","подсказка2","подсказка3"]}},
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

export async function generateExercises(words, grammar_points) {
  const allExercises = []
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)
    const input = JSON.stringify({ words: batch, grammar_points }, null, 2)
    const text = await ask(`${EXERCISES_PROMPT}\n\nКонспект урока:\n${input}`, { max_tokens: 8192 })
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
      const list = fbItems.map(ex => `${ex.id}: ${JSON.stringify(ex.payload.sentence || '')}`).join('\n')
      try {
        const text = await ask(
          `Переведи следующие немецкие предложения на 9 языков (ru, en, uk, fr, ar, bg, tr, es, sq).
Каждое предложение содержит ___ (пропуск) — сохрани его в переводе.
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
}

const TRAINER_SCENARIOS = {
  intro:     'Знайомство — учень вперше зустрічає тебе і представляється',
  cafe:      'У кав\'ярні — учень замовляє напої та їжу',
  shopping:  'Покупки — учень купує продукти або одяг',
  hotel:     'Готель — учень заселяється або запитує про послуги',
  direction: 'Орієнтування у місті — учень просить дорогу або пояснює де знаходиться',
  free:      'Вільна бесіда на будь-яку тему',
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

export async function chatWithTrainer({ messages, character = 'lena', scenario = 'free', userLang = 'uk' }) {
  const char = TRAINER_CHARACTERS[character] || TRAINER_CHARACTERS.lena
  const scenarioDesc = TRAINER_SCENARIOS[scenario] || TRAINER_SCENARIOS.free
  // Мова підказок/перекладу = мова інтерфейсу учня (усі 10 локалей)
  const userLangName = TRAINER_LANG_NAMES[userLang] || TRAINER_LANG_NAMES.uk

  const systemPrompt = `Ти — ${char.emoji} ${char.name}, ${char.desc}.
Рівень учня: A1–A2 (початківець).
Сценарій: ${scenarioDesc}.

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
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  })
  return parseJson(res.choices[0].message.content)
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
