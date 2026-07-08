import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

const STATUS_COLOR = { pending: 'var(--ink-soft)', processing: '#f59e0b', done: 'var(--good)', error: 'var(--red)' }
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

  const load = () => api.get(`/courses/${id}/lessons`).then(setData).finally(() => setLoading(false))
  const loadAllLessons = () => api.get('/lessons').then(ls => setAllLessons(ls.filter(l => !l.course_id || String(l.course_id) !== id)))

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
    <div style={{ paddingTop: 30 }}>
      <Link to="/courses" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }}>{c.back}</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '16px 0 24px', flexWrap: 'wrap' }}>
        {editing ? (
          <form onSubmit={handleRename} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 240 }}>
            <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ flex: 1, fontSize: 18 }} />
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
        <p style={{ color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>{course.description}</p>
      )}

      {user?.role === 'owner' && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to={`/lessons/new?course_id=${id}`} style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>
            + {c.addLesson}
          </Link>
          {allLessons.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={attachId} onChange={e => setAttachId(e.target.value)} style={{ fontSize: 14, maxWidth: 280 }}>
                <option value="">Прикрепить существующий урок...</option>
                {allLessons.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.title || `Урок от ${new Date(l.date).toLocaleDateString()}`}
                    {l.course_id ? ' (из другого курса)' : ''}
                  </option>
                ))}
              </select>
              <button disabled={!attachId}
                onClick={async () => {
                  await api.patch(`/lessons/${attachId}/course`, { course_id: parseInt(id), lesson_number: null })
                  setAttachId('')
                  await Promise.all([load(), loadAllLessons()])
                }}
                style={{ ...btnPrimary, opacity: attachId ? 1 : 0.4, cursor: attachId ? 'pointer' : 'default' }}>
                Прикрепить
              </button>
            </div>
          )}
        </div>
      )}

      {lessons.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
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
      await api.patch(`/lessons/${lesson.id}/course`, { course_id: parseInt(courseId), lesson_number: editNum ? parseInt(editNum) : null })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', flexWrap: 'wrap' }}>
      {isOwner ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{c.lessonNum}</span>
          <input type="number" value={editNum} onChange={e => setEditNum(e.target.value)} onBlur={saveNumber} min={1} style={{ width: 56, textAlign: 'center' }} />
        </div>
      ) : lesson.lesson_number ? (
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>#{lesson.lesson_number}</span>
      ) : null}

      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{lesson.title || '—'}</div>
        {lesson.date && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{new Date(lesson.date).toLocaleDateString()}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ color: STATUS_COLOR[status], fontSize: 14 }}>{STATUS_ICON[status]}</span>
        <span style={{ fontSize: 12, color: STATUS_COLOR[status], fontWeight: 600 }}>
          {lesson.status === 'processing' && lesson.progress ? lesson.progress : status}
        </span>
      </div>
    </div>
  )
}

const btnPrimary   = { padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }
const btnSecondary = { padding: '7px 14px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
const btnDanger    = { padding: '7px 14px', background: 'var(--surface)', color: 'var(--red)', border: '1px solid rgba(179,56,44,0.4)', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
