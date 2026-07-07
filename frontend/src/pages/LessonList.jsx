import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

const STATUS_COLORS = { pending: '#9ca3af', processing: '#f59e0b', done: '#10b981', error: '#ef4444' }

export default function LessonList() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const { t } = useI18nStore()

  useEffect(() => {
    api.get('/lessons').then(setLessons).finally(() => setLoading(false))
  }, [])

  if (loading) return <p>{t.common.loading}</p>

  return (
    <div>
      <h1>{t.lessons.title}</h1>
      {lessons.length === 0 ? (
        <p style={{ color: '#6b7280' }}>{t.lessons.empty}</p>
      ) : (
        <div>
          {lessons.map(lesson => (
            <div key={lesson.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>
                    {lesson.title || `${t.lessons.newLesson} ${new Date(lesson.date).toLocaleDateString()}`}
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                    {new Date(lesson.date).toLocaleDateString()} · {t.lessons.mediaCount(lesson.media_count)}
                  </p>
                </div>
                <span style={{ color: STATUS_COLORS[lesson.status], fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                  {t.lessons.status[lesson.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
