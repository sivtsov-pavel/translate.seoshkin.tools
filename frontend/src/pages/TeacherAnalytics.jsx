import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'

// Учебная аналитика для учителя: прогресс класса, трудные слова, где застревают.
// Подписи типов — из локали (+ склонение)
const typeLabelsFor = (t) => ({
  flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice,
  sentence_write: t.exercise.sentenceWrite, letter_fill: t.exercise.letterFill,
  dictation: t.exercise.dictation, speech: t.exercise.speech, conjugation: t.exercise.conjugation,
})
const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }
const th = { padding: '8px 10px', textAlign: 'left', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12 }
const td = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' }

// Цвет точности: <60 красный, <80 жёлтый, иначе зелёный
const accColor = (p) => p < 60 ? 'var(--red, #d64545)' : p < 80 ? '#B07D1B' : 'var(--good, #16a34a)'

export default function TeacherAnalytics() {
  const tt = useI18nStore(s => s.t)
  const TYPE_LABELS = typeLabelsFor(tt)
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api.get('/analytics/overview').then(setData).catch(e => setErr(e.message)) }, [])

  const [lessons, setLessons] = useState([])
  useEffect(() => {
    api.get('/lessons')
      .then(d => setLessons(Array.isArray(d) ? d : (d.lessons || [])))
      .catch(() => {})
  }, [])

  if (user?.role !== 'owner') return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔒</div><h2>Только для учителя</h2>
    </div>
  )
  if (err) return <div style={{ color: 'var(--red)', textAlign: 'center', marginTop: 40 }}>{err}</div>
  if (!data) return <div style={{ color: 'var(--ink-soft)', textAlign: 'center', marginTop: 40 }}>{tt.common.loading}</div>

  const { totals, students, hardestWords, byType } = data
  const fmtDate = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'
  const empty = totals.attempts === 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 60px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>📊 Аналитика класса</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Прогресс учеников по твоим урокам: активность, точность, трудные слова.
      </p>

      {lessons.length > 0 && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{tt.reports.reportForLesson}</span>
          <select defaultValue="" onChange={(e) => e.target.value && navigate(`/lesson-report/${e.target.value}`)}
            style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13, maxWidth: '100%' }}>
            <option value="" disabled>{tt.reports.pickLesson}</option>
            {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
      )}

      {empty && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--ink-soft)' }}>
          Пока нет данных — как только ученики начнут проходить упражнения, здесь появится статистика.
        </div>
      )}

      {!empty && <>
        {/* Итоги */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat big={totals.students} label={tt.reports.statStudents} />
          <Stat big={totals.active_7d} label={tt.reports.statActive} sub={tt.reports.statActiveSub} />
          <Stat big={totals.attempts} label={tt.reports.statAnswers} />
          <Stat big={`${totals.accuracy}%`} label={tt.reports.statAccuracy} color={accColor(totals.accuracy)} />
        </div>

        {/* Ученики */}
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Ученики</h3>
        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 22 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr>
              <th style={th}>Ученик</th><th style={th}>Ответов</th><th style={th}>Точность</th>
              <th style={th}>Знает</th><th style={th}>Учит</th><th style={th}>Был(а)</th>
            </tr></thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td style={td}>
                    {s.name}
                    {/* Заходит, но не решает — учителю это важнее любой точности:
                        такой ученик не «слабый», он ещё не начал. */}
                    {s.never_started && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--gold-dark)', background: 'var(--yellow-soft)', border: '1px solid var(--gold)', borderRadius: 999, padding: '2px 8px' }}>
                        не приступал
                      </span>
                    )}
                  </td>
                  <td style={td}>{s.attempts} <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{tt.reports.perWeek(s.attempts_7d)}</span></td>
                  <td style={{ ...td, fontWeight: 700, color: s.never_started ? 'var(--ink-soft)' : accColor(s.accuracy) }}>
                    {s.never_started ? '—' : `${s.accuracy}%`}
                  </td>
                  <td style={td}>{s.known}</td>
                  <td style={td}>{s.learning}</td>
                  <td style={{ ...td, color: 'var(--ink-soft)' }}>{fmtDate(s.last_active || s.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {/* Трудные слова */}
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>🔥 Трудные слова</h3>
            <div style={card}>
              {hardestWords.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{tt.reports.fewData}</div>}
              {hardestWords.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <span style={{ fontWeight: 700, flex: 1 }}>{w.word_de}</span>
                  <span style={{ color: 'var(--ink-soft)', fontSize: 12, flex: 1 }}>{w.translation_ru}</span>
                  <span style={{ fontWeight: 700, color: accColor(100 - w.wrong_pct) }}>{w.wrong_pct}% ошибок</span>
                  <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{w.attempts}</span>
                </div>
              ))}
            </div>
          </div>

          {/* По типам упражнений */}
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Где застревают (по типу)</h3>
            <div style={card}>
              {byType.map((x, i) => (
                <div key={x.type} style={{ padding: '7px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{TYPE_LABELS[x.type] || x.type}</span>
                    <span style={{ fontWeight: 700, color: accColor(x.accuracy) }}>{x.accuracy}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ width: `${x.accuracy}%`, height: '100%', background: accColor(x.accuracy) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>}

      <div style={{ marginTop: 20 }}>
        <button onClick={() => navigate('/students')} style={{
          padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line)',
          background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontSize: 14,
        }}>← К ученикам</button>
      </div>
    </div>
  )
}

function Stat({ big, label, sub, color }) {
  return (
    <div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--accent)', lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
