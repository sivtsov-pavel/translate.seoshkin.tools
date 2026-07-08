import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

const STATUS_COLORS = { pending: '#9ca3af', processing: '#f59e0b', done: '#10b981', error: '#ef4444' }
const STATUS_ICONS  = { pending: '○', processing: '⏳', done: '✓', error: '✗' }

export default function LessonList() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting]         = useState(null)
  const [fetchingImages, setFetchingImages] = useState(false)
  const [addingLetters, setAddingLetters]   = useState(null)
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleFetchImages = async () => {
    setFetchingImages(true)
    try {
      const res = await api.post('/admin/fetch-images', {})
      alert(`Готово! Загружено: ${res.updated} картинок, не найдено: ${res.failed}`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setFetchingImages(false)
    }
  }

  const handleAddLetterFill = async (id) => {
    setAddingLetters(id)
    try {
      const res = await api.post(`/lessons/${id}/add-letter-fill`, {})
      alert(`Добавлено ${res.added} упражнений "Добавь букву"!`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setAddingLetters(null)
    }
  }

  useEffect(() => {
    api.get('/lessons').then(setLessons).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить урок? Все слова и упражнения этого урока будут удалены.')) return
    setDeleting(id)
    try {
      await api.delete(`/lessons/${id}`)
      setLessons(prev => prev.filter(l => l.id !== id))
    } catch (e) {
      alert(e.message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <p>{t.common.loading}</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>{t.lessons.title}</h1>
        {user?.role === 'owner' && (
          <button
            onClick={handleFetchImages}
            disabled={fetchingImages}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              backgroundColor: fetchingImages ? '#f3f4f6' : '#fff',
              color: '#4f46e5', fontWeight: 600, fontSize: 13, cursor: fetchingImages ? 'not-allowed' : 'pointer',
            }}>
            {fetchingImages ? '⏳ Загружаю картинки...' : '🖼️ Загрузить картинки'}
          </button>
        )}
      </div>
      {lessons.length === 0 ? (
        <p style={{ color: '#6b7280' }}>{t.lessons.empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lessons.map(lesson => {
            const status = lesson.status || 'pending'
            return (
              <div key={lesson.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lesson.title || `${t.lessons.newLesson} ${new Date(lesson.date).toLocaleDateString()}`}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>
                      {new Date(lesson.date).toLocaleDateString()} · {t.lessons.mediaCount(lesson.media_count)}
                      {lesson.progress && status !== 'done' && (
                        <span style={{ marginLeft: 8, color: STATUS_COLORS[status] }}>{lesson.progress}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Статус */}
                    <span style={{ color: STATUS_COLORS[status], fontWeight: 600, fontSize: 13 }}>
                      {STATUS_ICONS[status]} {t.lessons.status[status]}
                    </span>

                    {/* Кнопка старта для студентов */}
                    {user?.role !== 'owner' && status === 'done' && (
                      <button
                        onClick={() => navigate(`/exercise-session?lesson_id=${lesson.id}`)}
                        style={{ padding: '5px 14px', borderRadius: 6, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        ▶ Начать
                      </button>
                    )}

                    {/* Кнопка добавить letter_fill — только для done уроков */}
                    {user?.role === 'owner' && status === 'done' && (
                      <button
                        onClick={() => handleAddLetterFill(lesson.id)}
                        disabled={addingLetters === lesson.id}
                        title="Добавить упражнения «Добавь букву»"
                        style={{
                          padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
                          backgroundColor: '#fff', color: '#6b7280', fontSize: 13,
                          cursor: 'pointer',
                        }}>
                        {addingLetters === lesson.id ? '⏳' : '🔤'}
                      </button>
                    )}

                    {/* Кнопка удаления — только для owner */}
                    {user?.role === 'owner' && (
                      <button
                        onClick={() => handleDelete(lesson.id)}
                        disabled={deleting === lesson.id}
                        style={{ padding: '4px 10px', fontSize: 13, color: '#dc2626', backgroundColor: '#fff', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>
                        {deleting === lesson.id ? '...' : '✕'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
