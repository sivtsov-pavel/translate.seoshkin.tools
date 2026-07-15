import OpenAI from 'openai'
import { config } from '../config.js'
import { saveOptimizedImage } from './imageOptimize.js'

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
export async function generateWordImage(wordDe, translationRu, wordId, targetLang = 'de') {
  const prompt = `Simple cheerful flat vector illustration for a children's flashcard. Show clearly the concept: "${translationRu}". Cute minimalist cartoon, bright friendly colors, plain light background, one centered object or simple scene, thick clean outlines, kindergarten style.
IMPORTANT: absolutely NO text, NO letters, NO words, NO signs, NO captions in any language — only the drawing.`
  try {
    const r = await openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
    if (r.data?.[0]?.b64_json) return await saveOptimizedImage(Buffer.from(r.data[0].b64_json, 'base64'), wordId)
    if (r.data?.[0]?.url) return await saveOptimizedImage(await fetchToBuffer(r.data[0].url), wordId)
  } catch (e) {
    console.error('gpt-image-1:', e.message)
  }
  try {
    const r2 = await openai.images.generate({ model: 'dall-e-2', prompt, size: '512x512', n: 1 })
    return await saveOptimizedImage(await fetchToBuffer(r2.data[0].url), wordId)
  } catch (e) {
    console.error('dall-e-2:', e.message)
    return null
  }
}
