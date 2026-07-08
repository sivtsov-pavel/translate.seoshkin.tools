import { useState, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'

export default function MultipleChoice({ payload, onAnswer, lessonTitle, wordDe }) {
  const [selected, setSelected] = useState(null)
  const { t } = useI18nStore()

  // Из вопроса "Wie heißt das auf Russisch: [word]?" извлекаем немецкое слово
  const germanWord = wordDe || payload.question.replace(/^.*:\s*/i, '').replace(/\?$/, '').trim()

  useEffect(() => {
    if (germanWord) speakAuto(germanWord)
  }, [germanWord])

  const handleSelect = (idx) => {
    if (selected !== null) return
    setSelected(idx)
    setTimeout(() => onAnswer(idx === payload.correct ? 5 : 1), 1100)
  }

  const getStyle = (idx) => {
    const base = {
      padding: '12px 16px', marginBottom: 8, borderRadius: 8, cursor: 'pointer',
      border: '2px solid', width: '100%', textAlign: 'left', fontSize: 16,
      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
    }
    if (selected === null) return { ...base, borderColor: '#e5e7eb', backgroundColor: '#fff' }
    if (idx === payload.correct) return { ...base, borderColor: '#10b981', backgroundColor: '#d1fae5', cursor: 'default' }
    if (idx === selected)        return { ...base, borderColor: '#ef4444', backgroundColor: '#fee2e2', cursor: 'default' }
    return { ...base, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', cursor: 'default', opacity: 0.6 }
  }

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>

      {lessonTitle && (
        <div style={{ fontSize: 12, color: '#a5b4fc', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      {/* Немецкое слово крупно */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '18px 20px', marginBottom: 18, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: '#1e1b4b' }}>{germanWord}</span>
          <SpeakButton text={germanWord} size={24} />
        </div>
        <p style={{ fontSize: 14, color: '#9ca3af', margin: '8px 0 0' }}>Выбери правильный перевод:</p>
      </div>

      {/* Варианты уже на русском */}
      {payload.options.map((opt, idx) => (
        <button key={idx} style={getStyle(idx)} onClick={() => handleSelect(idx)}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            backgroundColor: selected === null ? '#e5e7eb'
              : idx === payload.correct ? '#10b981'
              : idx === selected ? '#ef4444' : '#e5e7eb',
            color: selected !== null && (idx === payload.correct || idx === selected) ? '#fff' : '#6b7280',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
          }}>
            {String.fromCharCode(65 + idx)}
          </span>
          {opt}
          {selected !== null && idx === payload.correct && (
            <span style={{ marginLeft: 'auto', color: '#10b981', fontWeight: 700 }}>✓</span>
          )}
        </button>
      ))}

      {selected !== null && (
        <p style={{ marginTop: 10, fontSize: 15, color: selected === payload.correct ? '#10b981' : '#ef4444', fontWeight: 700 }}>
          {selected === payload.correct
            ? `✓ ${t.exercise.correct}`
            : `✗ ${t.exercise.wrong} — ${payload.options[payload.correct]}`}
        </p>
      )}
    </div>
  )
}
