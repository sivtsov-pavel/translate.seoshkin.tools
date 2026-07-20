import OpenAI from 'openai'
import { createReadStream } from 'fs'
import { config } from '../config.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

// Транскрипция аудиофайла — поддерживает микс немецкого и русского (code-switching).
// client — по умолчанию платформенный; processLesson передаёт клиент владельца урока
// (транскрипция аудио урока идёт за счёт учителя, если у него задан свой ключ).
export async function transcribeAudio(filepath, client = openai) {
  const response = await client.audio.transcriptions.create({
    file: createReadStream(filepath),
    model: 'whisper-1',
    // Немецкий как основной язык; русские вставки Whisper обрабатывает автоматически
    language: 'de',
    response_format: 'text',
  })
  return response
}
