import { useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

export default function SentenceWrite({ exercise, onAnswer }) {
  const [sentence, setSentence] = useState('')
  const [result, setResult] = useState(null)  // { correct, quality, feedback_ru, corrected }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18nStore()
  const { word_de, translation_ru, hint_ru, example } = exercise.payload

  const handleCheck = async (e) => {
    e.preventDefault()
    if (!sentence.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post(`/exercises/${exercise.id}/check-sentence`, { sentence })
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const qualityColor = (q) => {
    if (q >= 4) return '#10b981'
    if (q >= 3) return '#f59e0b'
    return '#ef4444'
  }

  const qualityStars = (q) => '★'.repeat(q) + '☆'.repeat(5 - q)

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      {/* Задание */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          {t.exercise.sentenceWrite}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700 }}>{word_de}</span>
          <span style={{ fontSize: 18, color: '#6b7280' }}>— {translation_ru}</span>
        </div>
        <p style={{ color: '#4f46e5', fontSize: 15, margin: 0 }}>{hint_ru}</p>
        {example && (
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6, fontStyle: 'italic' }}>
            {t.exercise.sentenceExample}: {example}
          </p>
        )}
      </div>

      {/* Поле ввода */}
      {!result ? (
        <form onSubmit={handleCheck}>
          <textarea
            value={sentence}
            onChange={e => setSentence(e.target.value)}
            placeholder={t.exercise.sentencePlaceholder}
            rows={3}
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', fontSize: 16,
              border: '1px solid #d1d5db', borderRadius: 8, resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12,
            }}
          />
          {error && <p style={{ color: '#ef4444', marginBottom: 8 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !sentence.trim()}
            style={{
              padding: '10px 24px', fontSize: 16, fontWeight: 600,
              backgroundColor: !sentence.trim() || loading ? '#d1d5db' : '#4f46e5',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: !sentence.trim() || loading ? 'not-allowed' : 'pointer',
            }}>
            {loading ? t.exercise.sentenceChecking : t.exercise.checkAnswer}
          </button>
        </form>
      ) : (
        /* Результат проверки */
        <div>
          {/* Написанное предложение */}
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: '12px 16px', marginBottom: 16, borderLeft: `4px solid ${qualityColor(result.quality)}` }}>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>{t.exercise.yourSentence}:</div>
            <div style={{ fontSize: 17 }}>{sentence}</div>
          </div>

          {/* Оценка */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 22, color: qualityColor(result.quality) }}>
              {qualityStars(result.quality)}
            </span>
            <span style={{ fontWeight: 700, color: qualityColor(result.quality), fontSize: 16 }}>
              {result.quality}/5
            </span>
          </div>

          {/* Комментарий от Claude */}
          <p style={{ fontSize: 15, color: '#374151', marginBottom: result.corrected ? 12 : 20 }}>
            {result.feedback_ru}
          </p>

          {/* Исправленный вариант если есть ошибки */}
          {result.corrected && (
            <div style={{ backgroundColor: '#d1fae5', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#065f46', marginBottom: 4 }}>{t.exercise.correctedVersion}:</div>
              <div style={{ fontSize: 16, color: '#065f46', fontWeight: 500 }}>{result.corrected}</div>
            </div>
          )}

          <button
            onClick={() => onAnswer(result.quality, sentence)}
            style={{ padding: '10px 24px', fontSize: 16, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            {t.exercise.next}
          </button>
        </div>
      )}
    </div>
  )
}
