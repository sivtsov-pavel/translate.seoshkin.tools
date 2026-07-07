import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

export default function Dashboard() {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useI18nStore()

  useEffect(() => {
    api.get('/exercises/today')
      .then(setExercises)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>{t.dashboard.loading}</p>

  return (
    <div>
      <h1>{t.dashboard.title}</h1>
      {exercises.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <p style={{ fontSize: 28 }}>🎉</p>
          <p style={{ fontSize: 20, fontWeight: 600 }}>{t.dashboard.allDone}</p>
          <p style={{ color: '#6b7280' }}>{t.dashboard.comeBack}</p>
        </div>
      ) : (
        <div>
          <p style={{ color: '#6b7280', marginBottom: 28 }}>
            {t.dashboard.exercisesWaiting(exercises.length)}
          </p>
          <button
            onClick={() => navigate('/exercise-session')}
            style={{ padding: '16px 32px', fontSize: 18, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            {t.dashboard.startSession}
          </button>
        </div>
      )}
    </div>
  )
}
