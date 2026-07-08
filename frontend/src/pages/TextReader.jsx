import { useState, useRef, useEffect } from 'react'
import { speak, cancel } from '../hooks/useSpeech.jsx'

// Разбиваем текст на предложения
function splitSentences(text) {
  return text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map(s => s.trim()).filter(Boolean) ?? []
}

export default function TextReader() {
  const [text, setText]         = useState('')
  const [sentences, setSentences] = useState([])
  const [active, setActive]     = useState(-1)
  const [playing, setPlaying]   = useState(false)
  const [rate, setRate]         = useState(0.85)
  const idxRef = useRef(0)
  const cancelRef = useRef(false)

  useEffect(() => () => { cancel(); cancelRef.current = true }, [])

  const start = async (fromIdx = 0) => {
    const parts = splitSentences(text)
    if (!parts.length) return
    setSentences(parts)
    setPlaying(true)
    setActive(fromIdx)
    cancelRef.current = false
    idxRef.current = fromIdx

    const playNext = (i) => {
      if (cancelRef.current || i >= parts.length) {
        setPlaying(false)
        setActive(-1)
        return
      }
      setActive(i)
      idxRef.current = i

      const synth = window.speechSynthesis
      synth.cancel()
      const utt = new SpeechSynthesisUtterance(parts[i])
      utt.lang = 'de-DE'
      utt.rate = rate
      const voices = synth.getVoices()
      const deVoice = voices.find(v => v.lang.startsWith('de'))
      if (deVoice) utt.voice = deVoice
      utt.onend = () => { if (!cancelRef.current) playNext(i + 1) }
      utt.onerror = () => { if (!cancelRef.current) playNext(i + 1) }
      synth.speak(utt)
    }

    playNext(fromIdx)
  }

  const stop = () => {
    cancelRef.current = true
    cancel()
    setPlaying(false)
    setActive(-1)
  }

  const prepare = () => {
    const parts = splitSentences(text)
    setSentences(parts)
    setActive(-1)
  }

  return (
    <div>
      <h1>📖 Читалка</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>
        Вставь немецкий текст — программа прочитает его вслух с подсветкой каждого предложения.
      </p>

      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSentences([]); setActive(-1) }}
        placeholder="Вставь сюда немецкий текст..."
        rows={7}
        style={{
          width: '100%', padding: 14, fontSize: 15, border: '1px solid #d1d5db',
          borderRadius: 10, resize: 'vertical', fontFamily: 'inherit',
          lineHeight: 1.6, boxSizing: 'border-box',
        }}
      />

      {/* Скорость */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Скорость:</span>
        {[0.7, 0.85, 1.0, 1.2].map(r => (
          <button key={r} onClick={() => setRate(r)}
            style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 13,
              border: '1px solid #d1d5db', cursor: 'pointer',
              backgroundColor: rate === r ? '#4f46e5' : '#fff',
              color: rate === r ? '#fff' : '#374151',
              fontWeight: rate === r ? 700 : 400,
            }}>
            {r === 0.7 ? '🐢 медленно' : r === 0.85 ? '🚶 обычно' : r === 1.0 ? '🏃 быстро' : '⚡ очень'}
          </button>
        ))}
      </div>

      {/* Кнопки управления */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {!playing ? (
          <button onClick={() => start(0)} disabled={!text.trim()}
            style={{ padding: '10px 24px', backgroundColor: text.trim() ? '#4f46e5' : '#e5e7eb', color: text.trim() ? '#fff' : '#9ca3af', border: 'none', borderRadius: 8, cursor: text.trim() ? 'pointer' : 'default', fontSize: 15, fontWeight: 600 }}>
            ▶ Читать
          </button>
        ) : (
          <button onClick={stop}
            style={{ padding: '10px 24px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
            ⏹ Стоп
          </button>
        )}
        {!playing && sentences.length === 0 && text.trim() && (
          <button onClick={prepare}
            style={{ padding: '10px 20px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 15 }}>
            Разбить на предложения
          </button>
        )}
      </div>

      {/* Текст с подсветкой */}
      {sentences.length > 0 && (
        <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 20, lineHeight: 2 }}>
          {sentences.map((s, i) => (
            <span
              key={i}
              onClick={() => !playing && start(i)}
              style={{
                display: 'inline',
                backgroundColor: active === i ? '#fef9c3' : 'transparent',
                borderRadius: 4,
                padding: '2px 4px',
                cursor: playing ? 'default' : 'pointer',
                fontSize: 17,
                fontWeight: active === i ? 600 : 400,
                color: active === i ? '#1e1b4b' : '#374151',
                borderBottom: active === i ? '2px solid #fbbf24' : 'none',
                transition: 'background-color .2s',
              }}>
              {s}{' '}
            </span>
          ))}
        </div>
      )}

      {sentences.length === 0 && !text && (
        <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 24, color: '#9ca3af', textAlign: 'center' }}>
          <p style={{ fontSize: 32 }}>🎧</p>
          <p>Вставь немецкий текст и нажми "Читать"</p>
          <p style={{ fontSize: 13 }}>Можно кликнуть на конкретное предложение чтобы начать с него</p>
        </div>
      )}
    </div>
  )
}
