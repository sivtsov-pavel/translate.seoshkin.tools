import OpenAI from 'openai'
import { config } from '../config.js'
import { saveOptimizedImage } from './imageOptimize.js'
import { generateImageLocally, conceptToEnglish } from './localAi.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

// Служебные слова — предлоги, артикли, местоимения, числа, союзы, частицы.
// Их бессмысленно иллюстрировать (der/die/zwei/sehr) — пропускаем при генерации.
const FUNCTION_WORDS = new Set(`der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner keines
in an auf vor hinter neben zwischen unter über um durch für gegen ohne bis mit nach bei seit von zu aus außer gegenüber ab entlang
und oder aber denn sondern doch
ich du er sie es wir ihr man mich dich sich uns euch mir dir ihm ihnen ihre sein mein dein
wer was wo wie wann warum wieso welche welcher welches wohin woher
nicht auch nur schon noch sehr ganz hier da dort dann jetzt wenn dass weil also ja nein bitte danke
null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig hundert tausend`.split(/\s+/))

export function isFunctionWord(wordDe) {
  const base = (wordDe || '').toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, '').split(/\s+/)[0]
  return FUNCTION_WORDS.has(base)
}

// Скачивает картинку по URL в буфер (для фолбэка dall-e, который отдаёт url, а не b64).
async function fetchToBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch image ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// Генерирует «детсадовскую» иллюстрацию слова (как школьная карточка). Возвращает локальный URL.
// Пробует gpt-image-1 (base64), фолбэк — dall-e-2 (url). Всё пережимается в webp (imageOptimize).
// Картинка = СМЫСЛ (концепт), без текста → одна на все 10 языков (банк слов делит её между
// нем./исп./фр…). Отсутствие текста заодно чинит баг «надпись не на том языке».
// client — OpenAI-клиент; по умолчанию платформенный, но processor передаёт клиент владельца
// урока (генерация картинок идёт за счёт учителя, если у него задан свой ключ).
export async function generateWordImage(wordDe, translationRu, wordId, targetLang = 'de', client = openai) {
  const prompt = `Simple cheerful flat vector illustration for a children's flashcard. Show clearly the concept: "${translationRu}". Cute minimalist cartoon, bright friendly colors, plain light background, one centered object or simple scene, thick clean outlines, kindergarten style.
IMPORTANT: absolutely NO text, NO letters, NO words, NO signs, NO captions in any language — only the drawing.`
  // Промпт для локальной модели — БЕЗ кавычек вокруг понятия и без слова «concept»:
  // диффузионная модель читает «...concept: "suitcase"» как приказ нарисовать НАДПИСЬ
  // (проверено: с кавычками на чемодане появилось «Suitcae», без — чистая картинка).
  // Negative prompt тут почти не работает: у turbo-модели cfg=2, при низком cfg негатив слаб.
  const localPrompt = (concept) => `A ${concept}, simple cheerful flat vector illustration for a children flashcard, cute minimalist cartoon, bright friendly colors, plain light background, one centered object, thick clean outlines, kindergarten style`
  // Локальный режим: рисуем на ноутбуке через Draw Things — бесплатно.
  // При сбое НЕ уходим молча в платный OpenAI (правило денег): вернём null,
  // слово останется без картинки до починки локального генератора.
  if (config.aiImageProvider === 'local') {
    try {
      // Русский концепт локальная модель не понимает и рисует НАДПИСЬ («стол» → буквы «СТОЛ»).
      // Переводим понятие на английский локальной же моделью — бесплатно. Если не вышло,
      // берём слово на изучаемом языке без артикля: латиница модели ближе, чем кириллица.
      const concept = await conceptToEnglish(translationRu, wordDe)
        || String(wordDe || '').replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/i, '').trim()
        || translationRu
      return await saveOptimizedImage(await generateImageLocally(localPrompt(concept)), wordId)
    } catch (e) {
      console.error('draw-things:', e.message)
      return null
    }
  }
  try {
    const r = await client.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
    if (r.data?.[0]?.b64_json) return await saveOptimizedImage(Buffer.from(r.data[0].b64_json, 'base64'), wordId)
    if (r.data?.[0]?.url) return await saveOptimizedImage(await fetchToBuffer(r.data[0].url), wordId)
  } catch (e) {
    console.error('gpt-image-1:', e.message)
  }
  try {
    const r2 = await client.images.generate({ model: 'dall-e-2', prompt, size: '512x512', n: 1 })
    return await saveOptimizedImage(await fetchToBuffer(r2.data[0].url), wordId)
  } catch (e) {
    console.error('dall-e-2:', e.message)
    return null
  }
}
