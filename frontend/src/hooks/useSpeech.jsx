import { useState, useCallback } from 'react'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
const AUTO_KEY = 'auto_speak'

export function isAutoSpeakEnabled() {
  return localStorage.getItem(AUTO_KEY) !== 'false'
}

export function speak(text, lang = 'de-DE', rate = 0.9) {
  if (!synth) return
  synth.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = lang
  utt.rate = rate
  const voices = synth.getVoices()
  const deVoice = voices.find(v => v.lang.startsWith('de'))
  if (deVoice) utt.voice = deVoice
  synth.speak(utt)
}

// Произносит только если автопроизношение включено
export function speakAuto(text, lang = 'de-DE') {
  if (isAutoSpeakEnabled()) speak(text, lang)
}

export function cancel() {
  synth?.cancel()
}

// Кнопка 🔊 — произнести вручную
export function SpeakButton({ text, lang = 'de-DE', size = 18, style = {} }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); speak(text, lang) }}
      title="Произнести"
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: size, padding: '2px 4px', borderRadius: 6,
        color: '#6b7280', transition: 'color .15s', flexShrink: 0,
        lineHeight: 1, ...style,
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#4f46e5'}
      onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
    >🔊</button>
  )
}

// Переключатель автопроизношения — сохраняется в localStorage
export function AutoSpeakToggle() {
  const [on, setOn] = useState(isAutoSpeakEnabled)
  const toggle = useCallback(() => {
    const next = !on
    localStorage.setItem(AUTO_KEY, next ? 'true' : 'false')
    setOn(next)
  }, [on])

  return (
    <button
      onClick={toggle}
      title={on ? 'Автопроизношение включено' : 'Автопроизношение выключено'}
      style={{
        background: on ? '#eef2ff' : '#f3f4f6',
        border: `1px solid ${on ? '#818cf8' : '#d1d5db'}`,
        color: on ? '#4f46e5' : '#9ca3af',
        borderRadius: 20, padding: '4px 12px', fontSize: 13,
        cursor: 'pointer', fontWeight: 600, display: 'flex',
        alignItems: 'center', gap: 4, transition: 'all .15s',
      }}
    >
      🔊 {on ? 'авто вкл' : 'авто выкл'}
    </button>
  )
}
