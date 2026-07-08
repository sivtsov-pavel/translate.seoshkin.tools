import { useState, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, speak, SpeakButton } from '../hooks/useSpeech.jsx'
import WordImage from './WordImage.jsx'

export default function LetterFill({ payload, onAnswer, lessonTitle, imageUrl }) {
  const [input, setInput]       = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect]   = useState(false)
  const inputRef = useRef(null)
  const { t } = useI18nStore()

  useEffect(() => {
    inputRef.current?.focus()
    speakAuto(payload.word_de)
  }, [payload.word_de])

  const handleSubmit = () => {
    if (!input.trim() || submitted) return
    const isCorrect = input.trim().toLowerCase() === payload.answer.toLowerCase()
    setCorrect(isCorrect)
    setSubmitted(true)
    setTimeout(() => speak(payload.word_de), 300)
    setTimeout(() => onAnswer(isCorrect ? 5 : 1, input.trim()), 1500)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  // Разбиваем маску на части: "H_nd" → [{text:"H",blank:false},{text:"_",blank:true},{text:"nd",blank:false}]
  const parts = []
  let buf = ''
  let inBlank = false
  for (const ch of payload.masked) {
    if (ch === '_') {
      if (!inBlank && buf) { parts.push({ text: buf, blank: false }); buf = '' }
      inBlank = true
      buf += '_'
    } else {
      if (inBlank && buf) { parts.push({ text: buf, blank: true }); buf = '' }
      inBlank = false
      buf += ch
    }
  }
  if (buf) parts.push({ text: buf, blank: inBlank })

  const resultColor = submitted ? (correct ? '#10b981' : '#ef4444') : '#4f46e5'

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: '#a5b4fc', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <WordImage imageUrl={imageUrl} size={240} />

      {/* Перевод как подсказка */}
      <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 15, marginBottom: 16 }}>
        Вспомни немецкое слово: <strong style={{ color: '#1e1b4b' }}>{payload.translation_ru}</strong>
      </p>

      {/* Маска слова */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0, fontSize: 38, fontWeight: 700, letterSpacing: 2 }}>
          {parts.map((part, i) => (
            part.blank
              ? <span key={i} style={{ color: '#c7d2fe', borderBottom: '3px solid #4f46e5', minWidth: part.text.length * 22, display: 'inline-block', textAlign: 'center' }}>
                  {submitted ? (
                    <span style={{ color: resultColor }}>{payload.answer.slice(payload.masked.indexOf('_'), payload.masked.indexOf('_') + part.text.length) || '?'}</span>
                  ) : part.text}
                </span>
              : <span key={i} style={{ color: '#1e1b4b' }}>{part.text}</span>
          ))}
          <SpeakButton text={payload.word_de} size={22} style={{ marginLeft: 10 }} />
        </div>
      </div>

      {/* Поле ввода полного слова */}
      <div style={{ display: 'flex', gap: 8, maxWidth: 340, margin: '0 auto' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={submitted}
          placeholder="Напиши слово целиком..."
          style={{
            flex: 1, padding: '12px 14px', fontSize: 18, borderRadius: 8,
            border: `2px solid ${submitted ? resultColor : '#e5e7eb'}`,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        {!submitted && (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            style={{
              padding: '12px 20px', backgroundColor: '#4f46e5', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, fontWeight: 700,
            }}>
            ✓
          </button>
        )}
      </div>

      {submitted && (
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 16, fontWeight: 700, color: resultColor }}>
          {correct
            ? `✓ Верно! ${payload.answer}`
            : `✗ Правильно: ${payload.answer}`}
        </div>
      )}
    </div>
  )
}
