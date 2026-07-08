import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

const TYPE_ICON  = { flashcard: '🃏', fill_blank: '✏️', multiple_choice: '☑️', sentence_write: '✍️' }

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useI18nStore()

  useEffect(() => {
    api.get('/exercises/stats')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>{t.dashboard.loading}</p>

  const total = stats?.total ?? 0
  const byType = stats?.byType ?? {}

  const typeLabels = {
    flashcard:      t.exercise.flashcard,
    fill_blank:     t.exercise.fillBlank,
    multiple_choice: t.exercise.multipleChoice,
    sentence_write: t.exercise.sentenceWrite,
  }

  return (
    <div>
      <h1>{t.dashboard.title}</h1>
      {total === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <p style={{ fontSize: 40 }}>🎉</p>
          <p style={{ fontSize: 20, fontWeight: 600 }}>{t.dashboard.allDone}</p>
          <p style={{ color: '#6b7280' }}>{t.dashboard.comeBack}</p>
        </div>
      ) : (
        <div>
          <p style={{ color: '#6b7280', marginBottom: 20, fontSize: 16 }}>
            {t.dashboard.exercisesWaiting(total)}
          </p>

          {/* Плитки по типам — кликабельны */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 28 }}>
            {Object.entries(byType).map(([type, count]) => (
              <button
                key={type}
                onClick={() => navigate(`/exercise-session?type=${type}`)}
                style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.backgroundColor = '#eef2ff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.backgroundColor = '#f9fafb' }}
              >
                <div style={{ fontSize: 28, marginBottom: 4 }}>{TYPE_ICON[type] ?? '📝'}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#4f46e5' }}>{count}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{typeLabels[type] ?? type}</div>
                <div style={{ fontSize: 11, color: '#a5b4fc', marginTop: 4 }}>→ начать</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => navigate('/exercise-session')}
            style={{ width: '100%', maxWidth: 360, padding: '16px 32px', fontSize: 18, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
            {t.dashboard.startSession}
          </button>
        </div>
      )}
    </div>
  )
}
