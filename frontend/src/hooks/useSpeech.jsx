import { useState, useCallback, useEffect, useRef } from 'react'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
const AUTO_KEY        = 'auto_speak'
const VOICE_KEY       = 'de_voice_name'
const SPEAK_TRANS_KEY = 'speak_translation'

export function isAutoSpeakEnabled() {
  return localStorage.getItem(AUTO_KEY) !== 'false'
}

export function isSpeakTranslationEnabled() {
  return localStorage.getItem(SPEAK_TRANS_KEY) !== 'false'
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

// Добавить в очередь синтеза без отмены текущего — для произношения перевода после немецкого слова
export function speakAppend(text, lang = 'ru-RU') {
  if (!synth || !isSpeakTranslationEnabled() || !text) return
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang = lang
  utt.rate = 1.0
  synth.speak(utt)
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

export function SpeakTranslationToggle() {
  const [on, setOn] = useState(() => localStorage.getItem(SPEAK_TRANS_KEY) !== 'false')

  const toggle = () => {
    const next = !on
    localStorage.setItem(SPEAK_TRANS_KEY, next ? 'true' : 'false')
    setOn(next)
  }

  return (
    <button onClick={toggle} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: on ? 'rgba(78,154,110,0.15)' : 'var(--surface-2)',
      border: '1px solid var(--line)', borderRadius: 999,
      padding: '8px 12px', fontSize: 13,
      color: on ? 'var(--good)' : 'var(--ink-soft)', cursor: 'pointer',
    }}>
      🌐 {on ? 'перевод вкл' : 'перевод выкл'}
    </button>
  )
}

// Блок управления: вкл/выкл авто + выбор голоса
export function AutoSpeakToggle({ pill = false }) {
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

  if (pill) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <button onClick={toggle} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: on ? 'rgba(78,154,110,0.15)' : 'var(--surface-2)',
            border: '1px solid var(--line)', borderRadius: '999px 0 0 999px',
            padding: '8px 10px', fontSize: 13,
            color: on ? 'var(--good)' : 'var(--ink-soft)', cursor: 'pointer',
          }}>
            🔊 {on ? 'вкл' : 'выкл'}
          </button>
          <button onClick={() => setOpen(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'var(--surface-2)',
            border: '1px solid var(--line)', borderLeft: 'none',
            borderRadius: '0 999px 999px 0',
            padding: '8px 10px', fontSize: 12,
            color: 'var(--ink-soft)', cursor: 'pointer',
          }}>
            {currentVoice ? currentVoice.name.split(' ')[0] : '🎤'} ▾
          </button>
        </div>

        {open && (
          <div style={{
            position: 'absolute', bottom: '110%', left: 0, zIndex: 1000,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 12, boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
            minWidth: 220, overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase' }}>
              Немецкие голоса
            </div>
            {voices.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--ink-soft)' }}>Голоса не найдены</div>}
            {voices.map(v => {
              const active = selected === v.name || (!selected && v === voices[0])
              return (
                <button key={v.name} onClick={() => { selectVoice(v.name); setOpen(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--ink)',
                    fontWeight: active ? 700 : 400,
                    borderBottom: '1px solid var(--line)',
                  }}>
                  {active ? '✓ ' : '   '}{v.name}
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginLeft: 6 }}>{v.lang}</span>
                </button>
              )
            })}
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-soft)', borderTop: '1px solid var(--line)' }}>
              Нажми — услышишь пример
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button onClick={toggle} title={on ? 'Автопроизношение включено' : 'Автопроизношение выключено'}
          style={{
            background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
            color: on ? 'var(--accent)' : 'var(--ink-soft)',
            borderRadius: '20px 0 0 20px', padding: '5px 10px', fontSize: 13,
            cursor: 'pointer', fontWeight: 600,
          }}>
          🔊 {on ? 'вкл' : 'выкл'}
        </button>
        <button onClick={() => setOpen(v => !v)} title="Выбрать голос"
          style={{
            background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
            borderLeft: 'none',
            color: on ? 'var(--accent)' : 'var(--ink-soft)',
            borderRadius: '0 20px 20px 0', padding: '5px 8px', fontSize: 11,
            cursor: 'pointer',
          }}>
          {currentVoice ? currentVoice.name.split(' ')[0] : 'голос'} ▾
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 1000,
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.5)',
          minWidth: 220, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-soft)', fontWeight: 600, borderBottom: '1px solid var(--line)', textTransform: 'uppercase' }}>
            Немецкие голоса
          </div>
          {voices.length === 0 && <div style={{ padding: '12px', fontSize: 13, color: 'var(--ink-soft)' }}>Голоса не найдены</div>}
          {voices.map(v => {
            const active = selected === v.name || (!selected && v === voices[0])
            return (
              <button key={v.name} onClick={() => { selectVoice(v.name); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--ink)',
                  fontWeight: active ? 700 : 400,
                  borderBottom: '1px solid var(--line)',
                }}>
                {active ? '✓ ' : '   '}{v.name}
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginLeft: 6 }}>{v.lang}</span>
              </button>
            )
          })}
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-soft)', borderTop: '1px solid var(--line)' }}>
            Нажми — услышишь пример
          </div>
        </div>
      )}
    </div>
  )
}
