import { useState } from 'react'
import { useI18nStore } from '../store/i18n.js'

export default function MultipleChoice({ payload, onAnswer }) {
  const [selected, setSelected] = useState(null)
  const { t } = useI18nStore()

  const handleSelect = (idx) => {
    if (selected !== null) return
    setSelected(idx)
    // Короткая пауза чтобы пользователь увидел результат
    setTimeout(() => onAnswer(idx === payload.correct ? 5 : 1), 900)
  }

  const getStyle = (idx) => {
    const base = { padding: 12, marginBottom: 8, borderRadius: 8, cursor: 'pointer', border: '2px solid', width: '100%', textAlign: 'left', fontSize: 16, transition: 'all 0.15s' }
    if (selected === null) return { ...base, borderColor: '#d1d5db', backgroundColor: '#fff' }
    if (idx === payload.correct) return { ...base, borderColor: '#10b981', backgroundColor: '#d1fae5', cursor: 'default' }
    if (idx === selected) return { ...base, borderColor: '#ef4444', backgroundColor: '#fee2e2', cursor: 'default' }
    return { ...base, borderColor: '#d1d5db', backgroundColor: '#f9fafb', cursor: 'default' }
  }

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <p style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{payload.question}</p>
      {payload.options.map((opt, idx) => (
        <button key={idx} style={getStyle(idx)} onClick={() => handleSelect(idx)}>
          {opt}
        </button>
      ))}
      {selected !== null && (
        <p style={{ marginTop: 8, fontSize: 14, color: selected === payload.correct ? '#10b981' : '#ef4444', fontWeight: 600 }}>
          {selected === payload.correct ? t.exercise.correct : `${t.exercise.wrong} ${payload.options[payload.correct]}`}
        </p>
      )}
    </div>
  )
}
