import OpenAI from 'openai'
import { config } from '../config.js'
import { saveOptimizedImage } from './imageOptimize.js'
import { generateImageLocally, conceptToEnglish } from './localAi.js'
import { logOperation } from './opLog.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

// Цена одной картинки, USD. Ради этих цифр и заведён журнал: на 2737 слов gpt-image-1
// даёт больше 100$, а Draw Things на ноутбуке — ноль (только время, ~2 минуты на штуку).
const PRICE_GPT_IMAGE_1 = 0.042  // 1024×1024, quality: medium
const PRICE_DALL_E_2    = 0.018  // 512×512

// Служебные слова — предлоги, артикли, местоимения, числа, союзы, частицы.
// Их бессмысленно иллюстрировать (der/die/zwei/sehr) — пропускаем при генерации.
// Списки РАЗНЫЕ по языкам: раньше английские слова проверялись по немецкому списку,
// и «in the park» (парк) и «an arm» (рука) отбрасывались из-за немецких «in» и «an».
const FUNCTION_WORDS = {
  de: `der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner keines
in an auf vor hinter neben zwischen unter über um durch für gegen ohne bis mit nach bei seit von zu aus außer gegenüber ab entlang
und oder aber denn sondern doch
ich du er sie es wir ihr man mich dich sich uns euch mir dir ihm ihnen ihre sein mein dein
wer was wo wie wann warum wieso welche welcher welches wohin woher
nicht auch nur schon noch sehr ganz hier da dort dann jetzt wenn dass weil also ja nein bitte danke
null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig dreißig vierzig fünfzig sechzig siebzig achtzig neunzig hundert tausend`,
  en: `the a an this that these those
in on at to from with by for of about under over between through into onto off up down
and or but so because if when while
i you he she it we they me him her us them my your his its our their
who what where how why which
not also only just very here there now then yes no please thanks
zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand`,
  es: `el la los las un una unos unas
en a de por para con sin sobre bajo entre hasta desde hacia
y o pero porque si cuando
yo tú él ella nosotros vosotros ellos me te se nos os mi tu su
quién qué dónde cómo por qué cuál
no también solo muy aquí allí ahora entonces sí gracias
cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa cien mil`,
}
const WORD_SETS = Object.fromEntries(
  Object.entries(FUNCTION_WORDS).map(([k, v]) => [k, new Set(v.split(/\s+/))]))
const ANY_ARTICLE = /^(der|die|das|ein|eine|el|la|los|las|the|a|an|un|una)\s+/i

export function isFunctionWord(wordDe, targetLang = 'de') {
  const core = (wordDe || '').trim().toLowerCase().replace(ANY_ARTICLE, '')
  // Фраза из нескольких слов служебной не бывает: «in the park» — это парк, ему нужна
  // картинка, хотя начинается с предлога. Проверяем только одиночные слова.
  if (!core || /\s/.test(core)) return false
  return (WORD_SETS[targetLang] || WORD_SETS.de).has(core)
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
// ctx — контекст для журнала операций: { lessonId, userId }. Не влияет на генерацию.
export async function generateWordImage(wordDe, translationRu, wordId, targetLang = 'de', client = openai, ctx = {}) {
  const t0 = Date.now()
  const logImage = (fields) => logOperation({
    kind: 'image', lessonId: ctx.lessonId ?? null, userId: ctx.userId ?? null,
    durationMs: Date.now() - t0, meta: { word_de: wordDe, word_id: wordId }, ...fields,
  })
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
      const url = await saveOptimizedImage(await generateImageLocally(localPrompt(concept)), wordId)
      await logImage({ provider: 'local', model: 'draw-things', items: 1, message: `концепт: ${concept}` })
      return url
    } catch (e) {
      console.error('draw-things:', e.message)
      // Отдельный статус: локальный генератор не отвечает (Draw Things закрыт / ноут уснул) —
      // это самая частая причина «картинок нет», и в журнале она должна быть видна сразу.
      await logImage({ provider: 'local', model: 'draw-things', status: 'error', message: e.message })
      return null
    }
  }
  try {
    const r = await client.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
    let url = null
    if (r.data?.[0]?.b64_json) url = await saveOptimizedImage(Buffer.from(r.data[0].b64_json, 'base64'), wordId)
    else if (r.data?.[0]?.url) url = await saveOptimizedImage(await fetchToBuffer(r.data[0].url), wordId)
    if (url) {
      await logImage({ provider: 'openai', model: 'gpt-image-1', items: 1, costUsd: PRICE_GPT_IMAGE_1 })
      return url
    }
  } catch (e) {
    console.error('gpt-image-1:', e.message)
    await logImage({ provider: 'openai', model: 'gpt-image-1', status: 'error', message: e.message })
  }
  try {
    const r2 = await client.images.generate({ model: 'dall-e-2', prompt, size: '512x512', n: 1 })
    const url = await saveOptimizedImage(await fetchToBuffer(r2.data[0].url), wordId)
    await logImage({ provider: 'openai', model: 'dall-e-2', items: 1, costUsd: PRICE_DALL_E_2 })
    return url
  } catch (e) {
    console.error('dall-e-2:', e.message)
    await logImage({ provider: 'openai', model: 'dall-e-2', status: 'error', message: e.message })
    return null
  }
}
