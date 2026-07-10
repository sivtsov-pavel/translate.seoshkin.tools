import { useState } from 'react'
import { api } from '../api/client.js'

export function ExerciseActions({ de, ru, type, exerciseId, userAnswer, correctAnswer, isCorrect }) {
  const [saved, setSaved]           = useState(false)
  const [explanation, setExplanation] = useState('')
  const [explaining, setExplaining] = useState(false)
  const [explainErr, setExplainErr] = useState('')

  const saveToPhrasebook = async () => {
    if (saved || !de) return
    try {
      await api.post('/phrasebook', {
        de: de.trim(),
        ru: (ru || '').trim() || de.trim(),
        source: 'exercise',
        exercise_id: exerciseId || null,
      })
      setSaved(true)
    } catch (e) {
      alert('Не удалось сохранить: ' + e.message)
    }
  }

  const explain = async () => {
    if (explanation || explaining) return
    setExplaining(true); setExplainErr('')
    try {
      const res = await api.post('/explain-error', {
        de,
        type,
        userAnswer: userAnswer || '',
        correctAnswer: correctAnswer || '',
      })
      setExplanation(res.explanation)
    } catch {
      setExplainErr('Не удалось получить объяснение')
    }
    setExplaining(false)
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* В разговорник */}
        <button onClick={saveToPhrasebook} disabled={saved}
          style={{
            padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: saved ? 'default' : 'pointer',
            border: '1px solid var(--line)',
            background: saved ? 'var(--surface-2)' : 'transparent',
            color: saved ? 'var(--good)' : 'var(--ink-soft)',
            fontWeight: 600, transition: 'all .15s',
          }}>
          {saved ? '✓ В разговорнике' : '📖 В разговорник'}
        </button>

        {/* Объяснить ошибку */}
        {!isCorrect && !explanation && (
          <button onClick={explain} disabled={explaining}
            style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: explaining ? 'default' : 'pointer',
              border: '1px solid var(--line)', background: 'transparent',
              color: 'var(--ink-soft)', fontWeight: 600,
            }}>
            {explaining ? '⏳ Объясняю…' : '❓ Почему?'}
          </button>
        )}
      </div>

      {/* Объяснение */}
      {(explanation || explainErr) && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: 10,
          background: 'var(--surface-2)', fontSize: 13, lineHeight: 1.6,
          color: explainErr ? 'var(--red)' : 'var(--ink)',
          borderLeft: '3px solid var(--accent)',
        }}>
          {explanation || explainErr}
        </div>
      )}
    </div>
  )
}
