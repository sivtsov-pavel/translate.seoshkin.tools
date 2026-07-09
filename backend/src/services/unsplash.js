import { config } from '../config.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

function cleanWord(wordDe) {
  return wordDe.replace(/^(der|die|das|ein|eine)\s+/i, '').split(' ')[0]
}

// Скачивает картинку и сохраняет на сервер, возвращает локальный путь
export async function downloadAndSave(remoteUrl, wordId) {
  if (!remoteUrl) return null
  try {
    const dir = join(config.uploadDir, 'word-images')
    mkdirSync(dir, { recursive: true })
    const res = await fetch(remoteUrl)
    if (!res.ok) return remoteUrl
    const buf = Buffer.from(await res.arrayBuffer())
    const filename = `word_${wordId}.jpg`
    writeFileSync(join(dir, filename), buf)
    return `/uploads/word-images/${filename}`
  } catch {
    return remoteUrl
  }
}

async function searchUnsplash(query, random = false) {
  if (!config.unsplashAccessKey) return null
  const word = cleanWord(query)
  const url = random
    ? `https://api.unsplash.com/photos/random?query=${encodeURIComponent(word)}&orientation=landscape&content_filter=high&client_id=${config.unsplashAccessKey}`
    : `https://api.unsplash.com/search/photos?query=${encodeURIComponent(word)}&per_page=1&orientation=landscape&content_filter=high&client_id=${config.unsplashAccessKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return random ? (data?.urls?.small ?? null) : (data?.results?.[0]?.urls?.small ?? null)
}

export async function fetchImageUrl(wordDe) {
  return searchUnsplash(wordDe, false)
}

export async function fetchRandomImageUrl(wordDe) {
  return searchUnsplash(wordDe, true)
}
