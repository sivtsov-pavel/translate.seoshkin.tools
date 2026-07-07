import { useState } from 'react'
import { useI18nStore } from '../store/i18n.js'

export default function Flashcard({ payload, onAnswer }) {
  const [revealed, setRevealed] = useState(false)
  const { t } = useI18nStore()

  return (
    <div>
      <div
        onClick={() => setRevealed(true)}
        style={{
          minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', border: '2px solid #e5e7eb', borderRadius: 12,
          padding: 32, cursor: revealed ? 'default' : 'pointer',
          backgroundColor: '#fafafa', marginBottom: 16, userSelect: 'none',
        }}>
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 16, textAlign: 'center' }}>
          {payload.question}
        </div>
        {revealed
          ? <div style={{ fontSize: 26, color: '#4f46e5', textAlign: 'center' }}>{payload.answer}</div>
          : <div style={{ color: '#9ca3af', fontSize: 14 }}>{t.exercise.tapToReveal}</div>}
      </div>

      {revealed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAnswer(1)} style={{ ...answerBtn, backgroundColor: '#ef4444' }}>
            {t.exercise.forgot}
          </button>
          <button onClick={() => onAnswer(3)} style={{ ...answerBtn, backgroundColor: '#f59e0b' }}>
            {t.exercise.hard}
          </button>
          <button onClick={() => onAnswer(5)} style={{ ...answerBtn, backgroundColor: '#10b981' }}>
            {t.exercise.remembered}
          </button>
        </div>
      )}
    </div>
  )
}

const answerBtn = {
  flex: 1, padding: 12, color: '#fff', border: 'none', borderRadius: 6,
  cursor: 'pointer', fontSize: 15, fontWeight: 500,
}
