import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

const STATUS_COLOR = { pending: '#9ca3af', processing: '#f59e0b', done: '#10b981', error: '#ef4444' }
const STATUS_ICON  = { pending: '○', processing: '⏳', done: '✓', error: '✗' }

export default function CourseView() {
  const { id } = useParams()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [allLessons, setAllLessons] = useState([])
  const [attachId, setAttachId]   = useState('')
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const c = t.courses

  const load = () =>
    api.get(`/courses/${id}/lessons`).then(setData).finally(() => setLoading(false))

  // Загружаем все уроки чтобы найти без курса (или из другого курса)
  const loadAllLessons = () =>
    api.get('/lessons').then(ls => setAllLessons(ls.filter(l => !l.course_id || String(l.course_id) !== id)))

  useEffect(() => { load(); if (user?.role === 'owner') loadAllLessons() }, [id])

  const handleRename = async (e) => {
    e.preventDefault()
    if (!editTitle.trim()) return
    await api.patch(`/courses/${id}`, { title: editTitle })
    setData(d => ({ ...d, course: { ...d.course, title: editTitle } }))
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!window.confirm(c.deleteConfirm)) return
    await api.delete(`/courses/${id}`)
    navigate('/courses')
  }

  if (loading) return <p>{c.loading}</p>
  if (!data)   return <p>{t.common.error}</p>

  const { course, lessons } = data

  return (
    <div>
      {/* Навигация */}
      <Link to="/courses" style={{ color: '#4f46e5', textDecoration: 'none', fontSize: 14 }}>{c.back}</Link>

      {/* Заголовок курса */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '16px 0 24px', flexWrap: 'wrap' }}>
        {editing ? (
          <form onSubmit={handleRename} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 240 }}>
            <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', fontSize: 18, border: '1px solid #d1d5db', borderRadius: 8 }} />
            <button type="submit" style={btnPrimary}>{c.assign}</button>
            <button type="button" onClick={() => setEditing(false)} style={btnSecondary}>{t.common.cancel}</button>
          </form>
        ) : (
          <>
            <h1 style={{ margin: 0, flex: 1 }}>{course.title}</h1>
            {user?.role === 'owner' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setEditTitle(course.title); setEditing(true) }} style={btnSecondary}>{c.edit}</button>
                <button onClick={handleDelete} style={btnDanger}>{c.delete}</button>
              </div>
            )}
          </>
        )}
      </div>

      {course.description && (
        <p style={{ color: '#6b7280', marginTop: -16, marginBottom: 20 }}>{course.description}</p>
      )}

      {/* Кнопки: новый урок + прикрепить существующий */}
      {user?.role === 'owner' && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to={`/lessons/new?course_id=${id}`} style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>
            + {c.addLesson}
          </Link>

          {allLessons.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                value={attachId}
                onChange={e => setAttachId(e.target.value)}
                style={{ padding: '7px 10px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, maxWidth: 280 }}
              >
                <option value="">Прикрепить существующий урок...</option>
                {allLessons.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.title || `Урок от ${new Date(l.date).toLocaleDateString()}`}
                    {l.course_id ? ' (из другого курса)' : ''}
                  </option>
                ))}
              </select>
              <button
                disabled={!attachId}
                onClick={async () => {
                  await api.patch(`/lessons/${attachId}/course`, { course_id: parseInt(id), lesson_number: null })
                  setAttachId('')
                  await Promise.all([load(), loadAllLessons()])
                }}
                style={{ ...btnPrimary, opacity: attachId ? 1 : 0.4, cursor: attachId ? 'pointer' : 'default' }}
              >
                Прикрепить
              </button>
            </div>
          )}
        </div>
      )}

      {/* Список уроков */}
      {lessons.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: 10, border: '1px dashed #d1d5db' }}>
          {c.noLessons}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lessons.map(lesson => (
            <LessonRow key={lesson.id} lesson={lesson} c={c} courseId={id} isOwner={user?.role === 'owner'} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  )
}

function LessonRow({ lesson, c, courseId, isOwner, onUpdate }) {
  const [editNum, setEditNum] = useState(String(lesson.lesson_number ?? ''))
  const [saving, setSaving]   = useState(false)
  const status = lesson.status || 'pending'

  const saveNumber = async () => {
    setSaving(true)
    try {
      await api.patch(`/lessons/${lesson.id}/course`, {
        course_id: parseInt(courseId),
        lesson_number: editNum ? parseInt(editNum) : null,
      })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 10, backgroundColor: '#fff', flexWrap: 'wrap' }}>
      {/* Номер урока */}
      {isOwner ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>{c.lessonNum}</span>
          <input
            type="number"
            value={editNum}
            onChange={e => setEditNum(e.target.value)}
            onBlur={saveNumber}
            min={1}
            style={{ width: 56, padding: '4px 6px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 6, textAlign: 'center' }}
          />
        </div>
      ) : lesson.lesson_number ? (
        <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5', flexShrink: 0 }}>#{lesson.lesson_number}</span>
      ) : null}

      {/* Название */}
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{lesson.title || '—'}</div>
        {lesson.date && <div style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(lesson.date).toLocaleDateString()}</div>}
      </div>

      {/* Статус */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ color: STATUS_COLOR[status], fontSize: 14 }}>{STATUS_ICON[status]}</span>
        <span style={{ fontSize: 12, color: STATUS_COLOR[status], fontWeight: 600 }}>
          {lesson.status === 'processing' && lesson.progress ? lesson.progress : status}
        </span>
      </div>
    </div>
  )
}

const btnPrimary   = { padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }
const btnSecondary = { padding: '7px 14px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14 }
const btnDanger    = { padding: '7px 14px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 14 }
