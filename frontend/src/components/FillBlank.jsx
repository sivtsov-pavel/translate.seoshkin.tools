import { useState } from 'react'
import { useI18nStore } from '../store/i18n.js'

export default function FillBlank({ payload, onAnswer }) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { t } = useI18nStore()

  const isCorrect = answer.trim().toLowerCase() === payload.blank.toLowerCase()
  const parts = payload.sentence.split('___')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setSubmitted(true)
  }

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <p style={{ fontSize: 20, marginBottom: 16, lineHeight: 1.6 }}>
        {parts[0]}
        <strong style={{ color: submitted ? (isCorrect ? '#10b981' : '#ef4444') : '#4f46e5', borderBottom: '2px solid currentColor', padding: '0 4px' }}>
          {submitted ? (answer || '___') : '___'}
        </strong>
        {parts[1]}
      </p>

      {!submitted ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={t.exercise.enterWord}
            autoFocus
            style={{ flex: 1, padding: '10px 12px', fontSize: 16, border: '1px solid #d1d5db', borderRadius: 6 }}
          />
          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>
            {t.exercise.checkAnswer}
          </button>
        </form>
      ) : (
        <div>
          {isCorrect
            ? <p style={{ color: '#10b981', fontWeight: 600, fontSize: 16 }}>{t.exercise.correct}</p>
            : <p style={{ color: '#ef4444', fontSize: 16 }}>{t.exercise.wrong} <strong>{payload.blank}</strong></p>}
          <button
            onClick={() => onAnswer(isCorrect ? 5 : 1, answer)}
            style={{ marginTop: 10, padding: '10px 24px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>
            {t.exercise.next}
          </button>
        </div>
      )}
    </div>
  )
}
