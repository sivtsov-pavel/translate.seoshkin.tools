import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

export default function CourseList() {
  const [courses, setCourses]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm]         = useState({ title: '', description: '' })
  const [formOpen, setFormOpen] = useState(false)
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const c = t.courses

  const load = () => api.get('/courses').then(setCourses).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setCreating(true)
    try {
      const course = await api.post('/courses', form)
      setCourses(prev => [...prev, { ...course, lessons_total: 0, lessons_done: 0 }])
      setForm({ title: '', description: '' })
      setFormOpen(false)
      navigate(`/courses/${course.id}`)
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <p>{c.loading}</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>{c.title}</h1>
        {user?.role === 'owner' && (
          <button onClick={() => setFormOpen(v => !v)} style={btnPrimary}>
            {formOpen ? t.common.cancel : c.newCourse}
          </button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={handleCreate} style={{ marginBottom: 24, padding: '20px 24px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--line)' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{c.createTitle}</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={c.createPlaceholder} autoFocus style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{c.createDesc}</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={c.descPlaceholder} style={inputStyle} />
          </div>
          <button type="submit" disabled={!form.title.trim() || creating} style={btnPrimary}>
            {creating ? '...' : c.create}
          </button>
        </form>
      )}

      {courses.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
          {c.empty}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {courses.map(course => (
            <Link key={course.id} to={`/courses/${course.id}`} style={{ textDecoration: 'none' }}>
              <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '20px 22px', background: 'var(--surface)', transition: 'box-shadow .15s', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.2)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{course.title}</div>
                {course.description && (
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>{course.description}</div>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 'auto' }}>
                  <Chip label={c.lessons(course.lessons_total)} color="var(--accent)" />
                  {course.lessons_done > 0 && (
                    <Chip label={c.lessonsDone(course.lessons_done)} color="var(--good)" />
                  )}
                </div>
                {course.lessons_total > 0 && (
                  <div style={{ marginTop: 12, height: 4, background: 'var(--surface-2)', borderRadius: 2 }}>
                    <div style={{ height: '100%', background: 'var(--good)', borderRadius: 2, width: `${Math.round(course.lessons_done / course.lessons_total * 100)}%` }} />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ label, color }) {
  return <span style={{ fontSize: 13, color, fontWeight: 600 }}>{label}</span>
}

const btnPrimary = { padding: '8px 18px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }
const inputStyle = { width: '100%', boxSizing: 'border-box' }
