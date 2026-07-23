// Разовый скрипт: сгенерировать мультяшные обложки для курсов 2 (Deutsch A1), 5 (English for kids),
// 7 (Español — Alfabetización) через gpt-image-1, в стиле карточек слов (кремовый фон, чёткий контур,
// плоская иллюстрация). Сохраняет через существующую saveCourseCover, пишет cover_image_url.
// Запуск внутри backend-контейнера: node scripts/generate-course-covers.mjs
import OpenAI from 'openai'
import { config } from '../src/config.js'
import { db } from '../src/db/index.js'
import { saveCourseCover } from '../src/services/imageOptimize.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

const STYLE = 'Simple cheerful flat vector illustration for a children\'s language-course cover. Bright friendly colors, plain cream background, thick clean black outlines, cute simplified character design, kindergarten flashcard style. Decorative alphabet toy blocks with single letters A B C are fine as playful shapes. IMPORTANT: absolutely NO sentences, NO words, NO captions, NO signs in any language — only the drawing and lone decorative letters on blocks.'

const COURSES = [
  { id: 2, prompt: `${STYLE} Show a cute cartoon fox character wearing a scarf striped black-red-gold, standing next to colorful alphabet toy blocks, a small pretzel and a German flag ribbon.` },
  { id: 5, prompt: `${STYLE} Show a cute cartoon bear character wearing a red-white-blue scarf, standing next to colorful alphabet toy blocks, a small red double-decker toy bus and a Union Jack ribbon.` },
  { id: 7, prompt: `${STYLE} Show a cute cartoon rabbit character wearing a red-yellow-red scarf, standing next to colorful alphabet toy blocks, a small folding fan and castanets, Spanish-style ribbon.` },
]

for (const c of COURSES) {
  console.log(`Курс ${c.id}: генерирую...`)
  const r = await openai.images.generate({ model: 'gpt-image-1', prompt: c.prompt, size: '1024x1024', quality: 'medium', n: 1 })
  const buffer = Buffer.from(r.data[0].b64_json, 'base64')
  const url = await saveCourseCover(buffer, c.id)
  await db.query('UPDATE courses SET cover_image_url = $1 WHERE id = $2', [url, c.id])
  console.log(`Курс ${c.id}: сохранено ${url}`)
}
console.log('Готово.')
process.exit(0)
