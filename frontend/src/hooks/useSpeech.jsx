import { useState, useCallback, useEffect, useRef } from 'react'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
const AUTO_KEY  = 'auto_speak'
const VOICE_KEY = 'de_voice_name'

export function isAutoSpeakEnabled() {
  return localStorage.getItem(AUTO_KEY) !== 'false'
}

function getSelectedVoiceName() {
  return localStorage.getItem(VOICE_KEY) || ''
}

function getDeVoices() {
  if (!synth) return []
  return synth.getVoices().filter(v => v.lang.startsWith('de'))
}

function pickVoice() {
  const saved = getSelectedVoiceName()
  const voices = getDeVoices()
  if (!voices.length) return null
  if (saved) return voices.find(v => v.name === saved) || voices[0]
  // По умолчанию предпочитаем Google Deutsch
  return voices.find(v => v.name === 'Google Deutsch')
      || voices.find(v => v.name.toLowerCase().includes('google') && v.lang.startsWith('de'))
      || voices[0]
}

export function speak(text, lang = 'de-DE', rate = 0.9) {
  if (!synth) return
  synth.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = lang
  utt.rate = rate
  const v = pickVoice()
  if (v) utt.voice = v
  synth.speak(utt)
}

export function speakAuto(text, lang = 'de-DE') {
  if (isAutoSpeakEnabled()) speak(text, lang)
}

export function cancel() {
  synth?.cancel()
}

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

// Блок управления: вкл/выкл авто + выбор голоса
export function AutoSpeakToggle() {
  const [on, setOn]         = useState(isAutoSpeakEnabled)
  const [open, setOpen]     = useState(false)
  const [voices, setVoices] = useState([])
  const [selected, setSelected] = useState(getSelectedVoiceName)
  const ref = useRef(null)

  // Голоса грузятся асинхронно в браузере
  useEffect(() => {
    const load = () => setVoices(getDeVoices())
    load()
    synth?.addEventListener('voiceschanged', load)
    return () => synth?.removeEventListener('voiceschanged', load)
  }, [])

  // Закрытие по клику снаружи
  useEffect(() => {
    if (!open) return
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = useCallback(() => {
    const next = !on
    localStorage.setItem(AUTO_KEY, next ? 'true' : 'false')
    setOn(next)
  }, [on])

  const selectVoice = (name) => {
    localStorage.setItem(VOICE_KEY, name)
    setSelected(name)
    // Пример произношения
    setTimeout(() => speak('Guten Tag! Ich lerne Deutsch.'), 100)
  }

  const currentVoice = voices.find(v => v.name === selected) || voices[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Кнопка вкл/выкл */}
        <button
          onClick={toggle}
          title={on ? 'Автопроизношение включено' : 'Автопроизношение выключено'}
          style={{
            background: on ? '#eef2ff' : '#f3f4f6',
            border: `1px solid ${on ? '#818cf8' : '#d1d5db'}`,
            color: on ? '#4f46e5' : '#9ca3af',
            borderRadius: '20px 0 0 20px', padding: '4px 10px', fontSize: 13,
            cursor: 'pointer', fontWeight: 600, transition: 'all .15s',
          }}
        >
          🔊 {on ? 'вкл' : 'выкл'}
        </button>
        {/* Кнопка выбора голоса */}
        <button
          onClick={() => setOpen(v => !v)}
          title="Выбрать голос"
          style={{
            background: open ? '#eef2ff' : on ? '#eef2ff' : '#f3f4f6',
            border: `1px solid ${on ? '#818cf8' : '#d1d5db'}`,
            borderLeft: 'none',
            color: on ? '#4f46e5' : '#9ca3af',
            borderRadius: '0 20px 20px 0', padding: '4px 8px', fontSize: 11,
            cursor: 'pointer', transition: 'all .15s',
          }}
        >
          {currentVoice ? currentVoice.name.split(' ')[0] : 'голос'} ▾
        </button>
      </div>

      {/* Дропдаун с голосами */}
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 1000,
          backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,.12)', minWidth: 220, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #f3f4f6', textTransform: 'uppercase' }}>
            Немецкие голоса
          </div>
          {voices.length === 0 && (
            <div style={{ padding: '12px', fontSize: 13, color: '#6b7280' }}>Голоса не найдены</div>
          )}
          {voices.map(v => (
            <button key={v.name} onClick={() => { selectVoice(v.name); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                backgroundColor: (selected === v.name || (!selected && v === voices[0])) ? '#eef2ff' : '#fff',
                color: (selected === v.name || (!selected && v === voices[0])) ? '#4f46e5' : '#374151',
                fontWeight: (selected === v.name || (!selected && v === voices[0])) ? 700 : 400,
                borderBottom: '1px solid #f9fafb',
              }}>
              {(selected === v.name || (!selected && v === voices[0])) ? '✓ ' : '   '}
              {v.name}
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>{v.lang}</span>
            </button>
          ))}
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af', borderTop: '1px solid #f3f4f6' }}>
            Нажми — услышишь пример
          </div>
        </div>
      )}
    </div>
  )
}
