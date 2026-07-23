// Разовый скрипт: прямоугольные детские иллюстрации для экрана выбора курса (CourseGate) —
// заменяют эмодзи-флаг у каждого из 6 языков (de/es/en/fr/it/pt). Стиль как у обложек курсов
// (кремовый фон, чёткий контур, без текста/букв — только рисунок). Статические файлы,
// не привязаны к БД (CourseGate.jsx ссылается на /uploads/lang-cards/{code}.webp напрямую).
// Запуск внутри backend-контейнера: node scripts/generate-lang-gate-images.mjs
import OpenAI from 'openai'
import { config } from '../src/config.js'
import { saveLangCard } from '../src/services/imageOptimize.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

const STYLE = 'Simple cheerful flat vector illustration for a children\'s language-course flag card. Bright friendly colors, plain cream background, thick clean black outlines, cute simplified character design, kindergarten flashcard style, landscape rectangular composition. IMPORTANT: absolutely NO sentences, NO words, NO letters, NO captions, NO signs in any language — only the drawing.'

const LANGS = [
  { code: 'de', prompt: `${STYLE} Show a cute cartoon fox character wearing a scarf striped black-red-gold, next to a small pretzel and a German flag ribbon.` },
  { code: 'es', prompt: `${STYLE} Show a cute cartoon rabbit character wearing a red-yellow-red scarf, next to a small folding fan and castanets, Spanish-style ribbon.` },
  { code: 'en', prompt: `${STYLE} Show a cute cartoon bear character wearing a red-white-blue scarf, next to a small red double-decker toy bus and a Union Jack ribbon.` },
  { code: 'fr', prompt: `${STYLE} Show a cute cartoon cat character wearing a blue-white-red scarf, next to a croissant and a small Eiffel Tower toy, French flag ribbon.` },
  { code: 'it', prompt: `${STYLE} Show a cute cartoon mouse character wearing a green-white-red scarf, next to a pizza slice and a small toy gondola, Italian flag ribbon.` },
  { code: 'pt', prompt: `${STYLE} Show a cute cartoon rooster character (Barcelos rooster style) with green-red feathers, next to a small guitar, Portuguese flag ribbon.` },
]

for (const l of LANGS) {
  console.log(`${l.code}: генерирую...`)
  try {
    const r = await openai.images.generate({ model: 'gpt-image-1', prompt: l.prompt, size: '1536x1024', quality: 'medium', n: 1 })
    const buffer = Buffer.from(r.data[0].b64_json, 'base64')
    const url = await saveLangCard(buffer, l.code)
    console.log(`${l.code}: сохранено ${url}`)
  } catch (e) {
    console.error(`${l.code}: ОШИБКА — ${e.message}`)
  }
}
console.log('Готово.')
process.exit(0)
