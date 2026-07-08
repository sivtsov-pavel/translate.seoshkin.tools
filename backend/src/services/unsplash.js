import { config } from '../config.js'

// Убираем артикль: "der Hund" → "Hund"
function cleanWord(wordDe) {
  return wordDe.replace(/^(der|die|das|ein|eine)\s+/i, '').split(' ')[0]
}

export async function fetchImageUrl(wordDe) {
  if (!config.unsplashAccessKey) return null

  const word = cleanWord(wordDe)
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(word)}&per_page=1&orientation=landscape&content_filter=high&client_id=${config.unsplashAccessKey}`

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  return data?.results?.[0]?.urls?.small ?? null
}
