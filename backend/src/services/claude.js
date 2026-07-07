import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { config } from '../config.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

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

// Извлечение слов и грамматики из фото учебника/тетради
export async function extractFromPhoto(filepath, mimeType = 'image/jpeg') {
  const imageData = readFileSync(filepath)
  const base64 = imageData.toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
  })

  const text = response.content[0].text.trim()
  // Убираем возможную markdown-обёртку на случай если модель всё же добавит
  const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean)
}

// Объединение результатов нескольких фото и транскрипции в единый конспект урока
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
    max_tokens: 3000,
    messages: [{ role: 'user', content: `${prompt}\n\nДанные для объединения:\n${input}` }],
  })

  const text = response.content[0].text.trim()
  const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean)
}

const EXERCISES_PROMPT = `На основе слов и грамматики урока немецкого (A1) создай упражнения для школьника.

Для каждого слова создай МИНИМУМ 3 упражнения — по одному каждого типа:
1. flashcard — карточка "немецкое слово ↔ перевод"
2. fill_blank — предложение с пропуском (используй example_sentence если есть, или придумай простое)
3. multiple_choice — выбор правильного перевода из 4 вариантов

Верни ТОЛЬКО JSON массив без markdown:
[
  {"type": "flashcard", "word_de": "слово", "payload": {"question": "немецкое слово", "answer": "русский перевод"}},
  {"type": "fill_blank", "word_de": "слово", "payload": {"sentence": "предложение с ___ пропуском", "blank": "слово", "options": ["подсказка1","подсказка2","подсказка3"]}},
  {"type": "multiple_choice", "word_de": "слово", "payload": {"question": "Wie heißt das auf Russisch: слово?", "options": ["вар1","вар2","вар3","вар4"], "correct": 0}}
]`

// Генерация упражнений по конспекту урока
export async function generateExercises(words, grammar_points) {
  const input = JSON.stringify({ words, grammar_points }, null, 2)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: `${EXERCISES_PROMPT}\n\nКонспект урока:\n${input}` }],
  })

  const text = response.content[0].text.trim()
  const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  return JSON.parse(clean)
}
