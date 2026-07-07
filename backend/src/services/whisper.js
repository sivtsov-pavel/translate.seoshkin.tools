import OpenAI from 'openai'
import { createReadStream } from 'fs'
import { config } from '../config.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

// Транскрипция аудиофайла — поддерживает микс немецкого и русского (code-switching)
export async function transcribeAudio(filepath) {
  const response = await openai.audio.transcriptions.create({
    file: createReadStream(filepath),
    model: 'whisper-1',
    // Немецкий как основной язык; русские вставки Whisper обрабатывает автоматически
    language: 'de',
    response_format: 'text',
  })
  return response
}
