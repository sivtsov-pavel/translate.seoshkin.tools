import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

const PRESET_AVATARS = ['🦈','👽','🤠','👧','👦','🐼','🦊','🐸','🦁','🤖','🧙','🚀']

export default function Students() {
  const [students, setStudents] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(null) // { id, ... }
  const { t } = useI18nStore()
  const s = t.students

  const reload = () => api.get('/students').then(setStudents).finally(() => setLoading(false))
  useEffect(() => { reload() }, [])

  if (loading) return <p>{s.loading}</p>

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>{s.title}</h1>
      {students.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
          {s.empty}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {students.map(st => (
            <StudentCard key={st.id} student={st} s={s} onEdit={() => setEditing(st)} />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}
    </div>
  )
}

function StudentCard({ student: st, s, onEdit }) {
  const reg = new Date(st.created_at).toLocaleDateString()
  const hasActivity = st.attempts_total > 0
  const av = st.avatar || ''
  const isEmoji = /\p{Emoji}/u.test(av)

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: av ? 'var(--surface-2)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isEmoji ? 20 : 15, fontWeight: 700,
            color: av ? 'inherit' : 'var(--accent-ink)',
            border: '1px solid var(--line)',
          }}>
            {av || st.email[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{st.full_name || st.email}</div>
            {st.full_name && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{st.email}</div>}
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{s.registered}: {reg}</div>
            {st.profession && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>💼 {st.profession}</div>}
            {st.telegram && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>✈️ {st.telegram}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {st.attempts_today > 0 && (
            <span style={{ background: 'rgba(78,154,110,0.15)', color: 'var(--good)', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
              {s.attemptsToday}: {st.attempts_today}
            </span>
          )}
          <button onClick={onEdit}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ✏️ Редактировать
          </button>
        </div>
      </div>

      {hasActivity ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          <Stat label={s.wordsTotal}    value={st.words_total}    color="var(--accent)" />
          <Stat label={s.wordsKnown}    value={st.words_known}    color="var(--good)" />
          <Stat label={s.wordsLearning} value={st.words_learning} color="#f59e0b" />
          <Stat label={s.attemptsTotal} value={st.attempts_total} color="var(--ink-soft)" />
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{s.noActivity}</p>
      )}

      {st.words_total > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'var(--good)', width: `${Math.round(st.words_known / st.words_total * 100)}%`, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, textAlign: 'right' }}>
            {Math.round(st.words_known / st.words_total * 100)}% {s.wordsKnown.toLowerCase()}
          </div>
        </div>
      )}
    </div>
  )
}

function EditModal({ student, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name:  student.full_name  || '',
    avatar:     student.avatar     || '',
    phone:      student.phone      || '',
    telegram:   student.telegram   || '',
    whatsapp:   student.whatsapp   || '',
    profession: student.profession || '',
  })
  const [newPwd, setNewPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState(null)

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const body = { ...form }
      if (newPwd.length >= 6) body.password = newPwd
      await api.patch(`/students/${student.id}`, body)
      onSaved()
    } catch {
      setMsg('Ошибка при сохранении')
      setSaving(false)
    }
  }

  const av = form.avatar
  const isEmoji = /\p{Emoji}/u.test(av)
  const displayName = form.full_name || student.email.split('@')[0]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Редактировать студента</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
        </div>

        {/* Аватар */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: av ? 'var(--surface-2)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isEmoji ? 30 : 22, fontWeight: 700,
            color: av ? 'inherit' : 'var(--accent-ink)',
            border: '2px solid var(--line)',
          }}>
            {av || displayName[0]?.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => setForm(f => ({ ...f, avatar: '' }))}
              style={{ width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                background: !av ? 'var(--accent)' : 'var(--surface-2)',
                color: !av ? 'var(--accent-ink)' : 'var(--ink)',
                border: `2px solid ${!av ? 'var(--accent)' : 'var(--line)'}` }}>
              {displayName[0]?.toUpperCase()}
            </button>
            {PRESET_AVATARS.map(e => (
              <button key={e} onClick={() => setForm(f => ({ ...f, avatar: e }))}
                style={{ width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: 18,
                  background: av === e ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: `2px solid ${av === e ? 'var(--accent)' : 'var(--line)'}` }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Поля */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <MField label="Имя"       value={form.full_name}  onChange={v => setForm(f => ({ ...f, full_name: v }))}  placeholder="Полное имя" />
          <MField label="Профессия" value={form.profession} onChange={v => setForm(f => ({ ...f, profession: v }))} placeholder="Профессия" />
          <MField label="Телефон"   value={form.phone}      onChange={v => setForm(f => ({ ...f, phone: v }))}      placeholder="+49 151 ..." />
          <MField label="Telegram"  value={form.telegram}   onChange={v => setForm(f => ({ ...f, telegram: v }))}   placeholder="@username" />
          <MField label="WhatsApp"  value={form.whatsapp}   onChange={v => setForm(f => ({ ...f, whatsapp: v }))}   placeholder="+49 151 ..." />
        </div>

        {/* Новый пароль */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 8 }}>СМЕНИТЬ ПАРОЛЬ (оставь пустым чтобы не менять)</div>
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)}
              placeholder="Новый пароль (мин. 6 символов)" style={{ width: '100%', boxSizing: 'border-box', paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPwd(v => !v)} title={showPwd ? 'Скрыть' : 'Показать'}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)', padding: 4 }}>
              <i className={`bi ${showPwd ? 'bi-eye-slash' : 'bi-eye'}`} />
            </button>
          </div>
        </div>

        {msg && <div style={{ color: 'var(--red)', fontSize: 14, marginBottom: 10 }}>{msg}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, padding: '12px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose}
            style={{ padding: '12px 20px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 15 }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

function MField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--ink-soft)', display: 'block', marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%' }} />
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
