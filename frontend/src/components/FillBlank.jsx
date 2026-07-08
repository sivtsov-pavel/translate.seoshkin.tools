import { useState, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speak, SpeakButton } from '../hooks/useSpeech.jsx'

export default function FillBlank({ payload, onAnswer, lessonTitle }) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { t } = useI18nStore()
  const inputRef = useRef(null)

  const isCorrect = answer.trim().toLowerCase() === payload.blank.toLowerCase()
  const parts = payload.sentence.split('___')

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setSubmitted(true)
    setTimeout(() => speak(payload.blank), 300)
  }

  const fullSentence = parts[0] + payload.blank + (parts[1] ?? '')

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>

      {lessonTitle && (
        <div style={{ fontSize: 12, color: '#a5b4fc', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      {/* Предложение с пропуском */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
        <p style={{ fontSize: 19, margin: 0, lineHeight: 1.7 }}>
          {parts[0]}
          <span style={{
            color: submitted ? (isCorrect ? '#10b981' : '#ef4444') : '#4f46e5',
            borderBottom: `2px solid ${submitted ? (isCorrect ? '#10b981' : '#ef4444') : '#818cf8'}`,
            padding: '0 6px', fontWeight: 700, minWidth: 60, display: 'inline-block', textAlign: 'center',
          }}>
            {submitted ? (answer || '___') : (answer || '   ')}
          </span>
          {parts[1]}
        </p>
        {payload.sentence_ru && (
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0 0', fontStyle: 'italic' }}>
            {payload.sentence_ru}
          </p>
        )}
      </div>

      {/* Слова-подсказки из урока */}
      {!submitted && payload.options?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Слова из урока — нажми чтобы вставить:</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[payload.blank, ...payload.options].sort(() => Math.random() - 0.5).map((opt, i) => (
              <button key={i} onClick={() => setAnswer(opt)}
                style={{
                  fontSize: 14, color: answer === opt ? '#4f46e5' : '#374151',
                  background: answer === opt ? '#eef2ff' : '#f3f4f6',
                  border: `1px solid ${answer === opt ? '#818cf8' : '#e5e7eb'}`,
                  borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: answer === opt ? 600 : 400,
                }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {!submitted ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={t.exercise.enterWord}
            style={{ flex: 1, padding: '10px 12px', fontSize: 16, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
          <button type="submit"
            style={{ padding: '10px 20px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>
            {t.exercise.checkAnswer}
          </button>
        </form>
      ) : (
        <div>
          {isCorrect
            ? <p style={{ color: '#10b981', fontWeight: 700, fontSize: 16, margin: '0 0 10px' }}>✓ {t.exercise.correct}</p>
            : (
              <div style={{ marginBottom: 10 }}>
                <p style={{ color: '#ef4444', fontSize: 15, margin: '0 0 6px' }}>✗ {t.exercise.wrong}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: '#166534' }}>{payload.blank}</span>
                  <SpeakButton text={payload.blank} />
                  <span style={{ color: '#4b5563', fontSize: 14 }}>→</span>
                  <span style={{ fontSize: 14, color: '#6b7280', fontStyle: 'italic' }}>{fullSentence}</span>
                  <SpeakButton text={fullSentence} size={14} />
                </div>
              </div>
            )
          }
          <button
            onClick={() => onAnswer(isCorrect ? 5 : 1, answer)}
            style={{ padding: '10px 28px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
            {t.exercise.next} →
          </button>
        </div>
      )}
    </div>
  )
}
