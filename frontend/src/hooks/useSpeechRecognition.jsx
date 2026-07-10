import { useState, useRef, useCallback } from 'react'

// Проверяем поддержку Web Speech API (только Chrome/Edge/Android)
export const isSpeechRecognitionSupported = () =>
  typeof window !== 'undefined' &&
  Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

// Нормализация слова: строчные, без статей, без лишних символов
function normalizeWord(s) {
  return s
    .toLowerCase()
    .replace(/^(der|die|das|ein|eine)\s+/i, '')
    .replace(/[^a-zäöüß]/gi, '')
    .trim()
}

// Расстояние Левенштейна — для расчёта процента совпадения
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

// Возвращает [0..1] — насколько transcript похож на expected
export function speechSimilarity(transcript, expected) {
  const a = normalizeWord(transcript)
  const b = normalizeWord(expected)
  if (!a || !b) return 0
  if (a === b) return 1
  // Принимаем если expected является частью transcript (длинные фразы)
  if (a.includes(b) || b.includes(a)) return 0.9
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - dist / maxLen
}

// Хук для работы с микрофоном: start() → listening → onResult(transcript)
export function useSpeechRecognition({ lang = 'de-DE', onResult } = {}) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const recRef = useRef(null)

  const isSupported = isSpeechRecognitionSupported()

  const start = useCallback(() => {
    if (!isSupported || listening) return
    setTranscript('')
    setError('')

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = lang
    rec.interimResults = false
    rec.maxAlternatives = 3
    rec.continuous = false

    rec.onstart  = () => setListening(true)
    rec.onend    = () => setListening(false)
    rec.onerror  = (e) => {
      setListening(false)
      // 'no-speech' — пользователь молчал, не ошибка браузера
      if (e.error !== 'no-speech') setError(e.error)
    }
    rec.onresult = (e) => {
      // Берём лучший вариант из всех альтернатив
      const alts = Array.from(e.results[0]).map(r => r.transcript)
      const best = alts[0] || ''
      setTranscript(best)
      onResult?.(best, alts)
    }

    recRef.current = rec
    rec.start()
  }, [isSupported, listening, lang, onResult])

  const stop = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
  }, [])

  return { start, stop, listening, transcript, isSupported, error }
}
