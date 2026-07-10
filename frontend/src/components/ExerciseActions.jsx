import { useState } from 'react'
import { api } from '../api/client.js'

export function ExerciseActions({ de, ru, type, exerciseId, userAnswer, correctAnswer, isCorrect }) {
  const [saved, setSaved]               = useState(false)
  const [grammarExp, setGrammarExp]     = useState('')
  const [grammarLoading, setGrammarLoading] = useState(false)
  const [grammarErr, setGrammarErr]     = useState('')
  const [justifyExp, setJustifyExp]     = useState('')
  const [justifyLoading, setJustifyLoading] = useState(false)
  const [justifyErr, setJustifyErr]     = useState('')

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

  const explainError = async () => {
    if (grammarExp || grammarLoading) return
    setGrammarLoading(true); setGrammarErr('')
    try {
      const res = await api.post('/explain-error', {
        de, type, userAnswer: userAnswer || '', correctAnswer: correctAnswer || '',
      })
      setGrammarExp(res.explanation)
    } catch {
      setGrammarErr('Не удалось получить объяснение')
    }
    setGrammarLoading(false)
  }

  const justify = async () => {
    if (justifyExp || justifyLoading) return
    setJustifyLoading(true); setJustifyErr('')
    try {
      const res = await api.post('/justify-answer', {
        wordDe: de,
        correctAnswer: correctAnswer || de,
        type,
      })
      setJustifyExp(res.explanation)
    } catch {
      setJustifyErr('Не удалось получить обоснование')
    }
    setJustifyLoading(false)
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
            fontWeight: 600,
          }}>
          {saved ? '✓ В разговорнике' : '📖 В разговорник'}
        </button>

        {/* Почему ошибка — только при неверном ответе */}
        {!isCorrect && (
          <button onClick={explainError} disabled={grammarLoading}
            style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: grammarLoading ? 'default' : 'pointer',
              border: '1px solid var(--line)', background: 'transparent',
              color: 'var(--red)', fontWeight: 600,
            }}>
            {grammarLoading ? '⏳…' : '❓ Почему ошибка?'}
          </button>
        )}

        {/* Обоснуй ответ — всегда доступна */}
        <button onClick={justify} disabled={justifyLoading}
          style={{
            padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: justifyLoading ? 'default' : 'pointer',
            border: '1px solid var(--accent)',
            background: justifyExp ? 'var(--accent-soft)' : 'transparent',
            color: 'var(--accent)', fontWeight: 600,
          }}>
          {justifyLoading ? '⏳ Думаю…' : justifyExp ? '💡 Обоснование ↓' : '💡 Обоснуй'}
        </button>
      </div>

      {/* Объяснение ошибки */}
      {(grammarExp || grammarErr) && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: 10,
          background: 'var(--surface-2)', fontSize: 13, lineHeight: 1.6,
          color: grammarErr ? 'var(--red)' : 'var(--ink)',
          borderLeft: '3px solid var(--red)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Разбор ошибки</div>
          {grammarExp || grammarErr}
        </div>
      )}

      {/* Обоснование правильного ответа */}
      {(justifyExp || justifyErr) && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: 10,
          background: 'var(--accent-soft)', fontSize: 13, lineHeight: 1.7,
          color: justifyErr ? 'var(--red)' : 'var(--ink)',
          borderLeft: '3px solid var(--accent)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 Почему именно это слово?</div>
          {justifyExp || justifyErr}
        </div>
      )}
    </div>
  )
}

// Кнопка «Обоснуй» до ответа — встраивается прямо в карточку упражнения
export function JustifyHint({ wordDe, correctAnswer, type }) {
  const [exp, setExp]       = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen]     = useState(false)

  const fetch = async () => {
    if (exp) { setOpen(v => !v); return }
    setLoading(true)
    try {
      const res = await api.post('/justify-answer', { wordDe, correctAnswer, type })
      setExp(res.explanation)
      setOpen(true)
    } catch {
      setExp('Не удалось получить подсказку')
      setOpen(true)
    }
    setLoading(false)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={fetch} disabled={loading}
        style={{
          padding: '4px 12px', fontSize: 12, borderRadius: 20, cursor: loading ? 'default' : 'pointer',
          border: '1px solid var(--accent)', background: 'transparent',
          color: 'var(--accent)', fontWeight: 600,
        }}>
        {loading ? '⏳…' : '💡 Подсказка'}
      </button>
      {open && exp && (
        <div style={{
          marginTop: 8, padding: '10px 14px', borderRadius: 10,
          background: 'var(--accent-soft)', fontSize: 13, lineHeight: 1.65,
          borderLeft: '3px solid var(--accent)', color: 'var(--ink)',
        }}>
          {exp}
        </div>
      )}
    </div>
  )
}
