import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

export default function Students() {
  const [students, setStudents] = useState([])
  const [loading, setLoading]   = useState(true)
  const { t } = useI18nStore()
  const s = t.students

  useEffect(() => {
    api.get('/students').then(setStudents).finally(() => setLoading(false))
  }, [])

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
          {students.map(st => <StudentCard key={st.id} student={st} s={s} />)}
        </div>
      )}
    </div>
  )
}

function StudentCard({ student: st, s }) {
  const reg = new Date(st.created_at).toLocaleDateString()
  const hasActivity = st.attempts_total > 0

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
            {st.email[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{st.email}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{s.registered}: {reg}</div>
          </div>
        </div>
        {st.attempts_today > 0 && (
          <span style={{ background: 'rgba(78,154,110,0.15)', color: 'var(--good)', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
            {s.attemptsToday}: {st.attempts_today}
          </span>
        )}
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

function Stat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
