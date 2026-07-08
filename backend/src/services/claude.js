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

export async function extractFromPhoto(filepath, mimeType = 'image/jpeg') {
  const imageData = readFileSync(filepath)
  const base64 = imageData.toString('base64')

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

export async function mergeLesson(extractions, transcription = null) {
  const input = JSON.stringify({ extractions, transcription }, null, 2)
  const prompt = `Объедини данные из нескольких фото страниц урока немецкого (A1) в единый конспект.
Правила:
- Убери дубли слов (оставь лучший вариант с переводом и примером)
- Нормализуй существительные: добавь артикль (der/die/das) если известен
- Объедини грамматические правила без дублей

Верни ТОЛЬКО JSON без markdown:
{"words": [{"word_de": "...", "translation_ru": "...", "example_sentence": "..."}], "grammar_points": [{"description": "...", "example": "..."}]}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: `${prompt}\n\nДанные для объединения:\n${input}` }],
  })

  return parseJson(response.content[0].text)
}

const EXERCISES_PROMPT = `На основе слов и грамматики урока немецкого (A1) создай упражнения для школьника.

Для каждого слова создай 4 упражнения — по одному каждого типа:
1. flashcard — карточка "немецкое слово ↔ перевод"
2. fill_blank — предложение с пропуском (используй example_sentence если есть, или придумай простое)
3. multiple_choice — выбор правильного перевода из 4 вариантов
4. sentence_write — задание написать своё предложение с этим словом (уровень A1, простое)

Верни ТОЛЬКО JSON массив без markdown:
[
  {"type": "flashcard", "word_de": "слово", "payload": {"question": "немецкое слово", "answer": "русский перевод"}},
  {"type": "fill_blank", "word_de": "слово", "payload": {"sentence": "предложение с ___ пропуском", "blank": "слово", "options": ["подсказка1","подсказка2","подсказка3"]}},
  {"type": "multiple_choice", "word_de": "слово", "payload": {"question": "Wie heißt das auf Russisch: слово?", "options": ["вар1","вар2","вар3","вар4"], "correct": 0}},
  {"type": "sentence_write", "word_de": "слово", "payload": {"word_de": "слово", "translation_ru": "перевод", "hint_ru": "Напиши простое предложение со словом «слово». Например: приветствие, описание, вопрос.", "example": "Пример правильного предложения на немецком"}}
]`

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
