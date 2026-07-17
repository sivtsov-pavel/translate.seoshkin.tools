import { useState, useCallback, useEffect, useRef } from 'react'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
const AUTO_KEY        = 'auto_speak'
const VOICE_KEY       = 'de_voice_name'
const SPEAK_TRANS_KEY = 'speak_translation'

// Локаль озвучки по активному изучаемому языку (мульти-таргет)
const TARGET_LOCALE = { de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', en: 'en-US', pt: 'pt-PT' }
export function targetLocale() {
  return TARGET_LOCALE[localStorage.getItem('target_lang') || 'de'] || 'de-DE'
}

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
  // Голоса для АКТИВНОГО изучаемого языка (мульти-таргет)
  const prefix = targetLocale().slice(0, 2)
  return synth.getVoices().filter(v => v.lang.startsWith(prefix))
}

function pickVoice() {
  const prefix = targetLocale().slice(0, 2)
  const saved = getSelectedVoiceName()
  const voices = getDeVoices()
  if (!voices.length) return null
  // Сохранённый голос применяем только если он того же языка
  if (saved) { const s = voices.find(v => v.name === saved); if (s) return s }
  // Предпочитаем Google-голос нужного языка
  return voices.find(v => v.name.toLowerCase().includes('google') && v.lang.startsWith(prefix))
      || voices[0]
}

function getSavedRate() {
  const v = parseFloat(localStorage.getItem('voice_rate'))
  return isNaN(v) ? 0.9 : Math.max(0.5, Math.min(1.5, v))
}

// Чистка текста для озвучки (на экране текст остаётся полным):
// «шесть (6)» и «умер (причастие от sterben)» — пояснение в скобках TTS читает как
// повтор/мусор; «станция / отделение» — слэш читается словом. Скобки убираем,
// слэш превращаем в паузу-запятую.
function speakable(text) {
  return String(text ?? '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\/\s*/g, ', ')
    .trim()
}

export function speak(text, lang = targetLocale(), rate = null) {
  if (!synth) return
  synth.cancel()
  // Chrome bug: cancel() и speak() в одном тике → utterance молча сбрасывается
  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(speakable(text))
    utt.lang = lang
    utt.rate = rate ?? getSavedRate()
    const v = pickVoice()
    if (v) utt.voice = v
    synth.speak(utt)
  }, 50)
}

export function speakAuto(text, lang = targetLocale()) {
  if (isAutoSpeakEnabled()) speak(text, lang)
}

// Озвучка с событиями начала/конца — для голосового режима тренера (hands-free):
// пока аватар «говорит» — микрофон молчит, после onEnd — снова слушаем.
export function speakWithEvents(text, lang = targetLocale(), { onStart, onEnd } = {}) {
  if (!synth || !text) { onEnd?.(); return }
  synth.cancel()
  setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(speakable(text))
    utt.lang = lang
    utt.rate = getSavedRate()
    const v = pickVoice()
    if (v) utt.voice = v
    utt.onstart = () => onStart?.()
    utt.onend   = () => onEnd?.()
    utt.onerror = () => onEnd?.()
    synth.speak(utt)
  }, 50)
}

export function cancel() {
  synth?.cancel()
}

// Добавить в очередь синтеза без отмены текущего — для произношения перевода после немецкого слова
export function speakAppend(text, lang = 'ru-RU') {
  if (!synth || !isSpeakTranslationEnabled() || !text) return
  const utt = new SpeechSynthesisUtterance(speakable(text))
  utt.lang = lang
  utt.rate = 1.0
  synth.speak(utt)
}

export function SpeakButton({ text, lang = targetLocale(), size = 18, style = {}, appendText = null }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); speak(text, lang); if (appendText) speakAppend(appendText) }}
      title="Произнести"
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: size, padding: '2px 4px', borderRadius: 6,
        color: 'var(--ink-soft)', transition: 'color .15s', flexShrink: 0,
        lineHeight: 1, ...style,
      }}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-soft)'}
    ><i className="bi bi-volume-up-fill" /></button>
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
      <i className="bi bi-translate" /> {on ? 'перевод вкл' : 'перевод выкл'}
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
            <i className="bi bi-volume-up-fill" /> {on ? 'вкл' : 'выкл'}
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
