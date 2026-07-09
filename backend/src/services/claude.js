import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { config } from '../config.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

// Парсим JSON из ответа Claude — зачищаем markdown-обёртку
function parseJson(text) {
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(clean)
  } catch (e) {
    // Пробуем обрезать до последнего полного элемента (если ответ Claude обрезан)
    const lastComma = clean.lastIndexOf('},')
    if (lastComma > 0) {
      const candidate = (clean.startsWith('[') ? '[' : '{') + clean.slice(1, lastComma + 1) + (clean.startsWith('[') ? ']' : '}')
      try { return JSON.parse(candidate) } catch {}
    }
    throw new Error(`Ошибка парсинга JSON от Claude (${clean.length} символов): ${e.message}`)
  }
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

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
  })

  return parseJson(response.content[0].text)
}

const MERGE_PROMPT = `Объедини данные из нескольких фото страниц урока немецкого (A1) в единый конспект.
Правила:
- Убери дубли слов (оставь лучший вариант с переводом и примером)
- Нормализуй существительные: добавь артикль (der/die/das) если известен
- Объедини грамматические правила без дублей

Верни ТОЛЬКО JSON без markdown:
{"words": [{"word_de": "...", "translation_ru": "...", "example_sentence": "..."}], "grammar_points": [{"description": "...", "example": "..."}]}`

async function mergeChunk(extractions, transcription = null) {
  // Оставляем только нужные поля — raw_text и example_sentences не нужны для мержа
  const slim = extractions.map(e => ({ words: e.words || [], grammar_points: e.grammar_points || [] }))
  const input = JSON.stringify({ extractions: slim, transcription }, null, 2)
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: `${MERGE_PROMPT}\n\nДанные:\n${input}` }],
  })
  return parseJson(response.content[0].text)
}

export async function mergeLesson(extractions, transcription = null) {
  const CHUNK = 6
  if (extractions.length <= CHUNK) {
    return mergeChunk(extractions, transcription)
  }

  // Большой урок — мержим батчами, финальную дедупликацию делаем в JS
  // (финальный Claude-мерж тоже упирается в 8192 токенов вывода)
  const chunks = []
  for (let i = 0; i < extractions.length; i += CHUNK) {
    chunks.push(extractions.slice(i, i + CHUNK))
  }

  const partials = []
  for (let i = 0; i < chunks.length; i++) {
    const partial = await mergeChunk(chunks[i], i === 0 ? transcription : null)
    partials.push(partial)
  }

  // JS-дедупликация: первое встреченное слово побеждает
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

export async function generateLetterFill(words) {
  const all = []
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: `${LETTER_FILL_PROMPT}\n\nСлова:\n${JSON.stringify(batch, null, 2)}` }],
    })
    const exercises = parseJson(response.content[0].text)
    all.push(...exercises)
  }
  return all
}

// Генерируем упражнения батчами по 15 слов — чтобы не превышать лимит токенов
const BATCH_SIZE = 15

export async function generateExercises(words, grammar_points) {
  const allExercises = []

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE)
    const input = JSON.stringify({ words: batch, grammar_points }, null, 2)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: `${EXERCISES_PROMPT}\n\nКонспект урока:\n${input}` }],
    })

    const exercises = parseJson(response.content[0].text)
    allExercises.push(...exercises)
  }

  return allExercises
}

export async function checkSentence(wordDe, translationRu, userSentence) {
  const prompt = `Ты учитель немецкого языка. Ученик (уровень A1) написал предложение.

Слово для использования: "${wordDe}" (${translationRu})
Предложение ученика: "${userSentence}"

Оцени по критериям:
1. Слово "${wordDe}" присутствует в предложении (или его правильная форма)
2. Предложение грамматически приемлемо для уровня A1
3. Смысл понятен

Верни ТОЛЬКО JSON без markdown:
{
  "correct": true/false,
  "quality": 0-5,
  "feedback_ru": "Краткий комментарий на русском (1-2 предложения). Если ошибка — укажи что именно.",
  "corrected": "Исправленный вариант если есть ошибки, иначе null"
}

Шкала quality: 5=отлично, 4=хорошо, 3=приемлемо с мелкими ошибками, 2=понятно но с ошибками, 1=слово есть но много ошибок, 0=слово не использовано или непонятно`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  return parseJson(response.content[0].text)
}

// Дополняем слова: перевод + пример предложения (батч)
export async function enrichWords(words) {
  // words = [{id, word_de, needs_translation, needs_example}]
  const list = words.map((w, i) => `${i + 1}. ${w.word_de}`).join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Для каждого немецкого слова/выражения уровня A1 дай:
- translation_ru: перевод на русский (кратко)
- example_sentence: простое немецкое предложение с этим словом (A1 уровень)
- example_sentence_ru: перевод этого предложения на русский

Верни ТОЛЬКО JSON-массив в том же порядке, без пояснений:
[{"translation_ru": "...", "example_sentence": "...", "example_sentence_ru": "..."}, ...]

Слова:
${list}`,
    }],
  })

  const results = parseJson(response.content[0].text)
  return words.map((w, i) => ({ id: w.id, ...results[i] }))
}

// Перевод примеров предложений батчами по 25
export async function translateSentences(pairs) {
  const BATCH = 25
  const all = []
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH)
    const list = batch.map((p, j) => `${j + 1}. ${p.sentence}`).join('\n')
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Переведи каждое немецкое предложение на русский язык. Верни ТОЛЬКО JSON-массив строк в том же порядке, без пояснений:\n${list}`,
      }],
    })
    const translations = parseJson(response.content[0].text)
    batch.forEach((p, j) => all.push({ id: p.id, translation: translations[j] || null }))
  }
  return all
}
