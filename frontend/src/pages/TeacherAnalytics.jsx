import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

// Учебная аналитика для учителя: прогресс класса, трудные слова, где застревают.
const TYPE_LABELS = {
  flashcard: 'Флеш-карта', fill_blank: 'Пропуск', multiple_choice: 'Выбор ответа',
  sentence_write: 'Напиши предложение', letter_fill: 'Добавь букву',
  dictation: 'Диктант', speech: 'Произношение',
}
const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }
const th = { padding: '8px 10px', textAlign: 'left', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12 }
const td = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' }

// Цвет точности: <60 красный, <80 жёлтый, иначе зелёный
const accColor = (p) => p < 60 ? 'var(--red, #d64545)' : p < 80 ? '#B07D1B' : 'var(--good, #16a34a)'

export default function TeacherAnalytics() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api.get('/analytics/overview').then(setData).catch(e => setErr(e.message)) }, [])

  if (user?.role !== 'owner') return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔒</div><h2>Только для учителя</h2>
    </div>
  )
  if (err) return <div style={{ color: 'var(--red)', textAlign: 'center', marginTop: 40 }}>{err}</div>
  if (!data) return <div style={{ color: 'var(--ink-soft)', textAlign: 'center', marginTop: 40 }}>Загрузка…</div>

  const { totals, students, hardestWords, byType } = data
  const fmtDate = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'
  const empty = totals.attempts === 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 60px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>📊 Аналитика класса</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Прогресс учеников по твоим урокам: активность, точность, трудные слова.
      </p>

      {empty && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--ink-soft)' }}>
          Пока нет данных — как только ученики начнут проходить упражнения, здесь появится статистика.
        </div>
      )}

      {!empty && <>
        {/* Итоги */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Stat big={totals.students} label="Учеников" />
          <Stat big={totals.active_7d} label="Активны" sub="за 7 дней" />
          <Stat big={totals.attempts} label="Ответов" />
          <Stat big={`${totals.accuracy}%`} label="Точность" color={accColor(totals.accuracy)} />
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
                  <td style={td}>{s.name}</td>
                  <td style={td}>{s.attempts} <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>({s.attempts_7d} за нед.)</span></td>
                  <td style={{ ...td, fontWeight: 700, color: accColor(s.accuracy) }}>{s.accuracy}%</td>
                  <td style={td}>{s.known}</td>
                  <td style={td}>{s.learning}</td>
                  <td style={{ ...td, color: 'var(--ink-soft)' }}>{fmtDate(s.last_active)}</td>
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
              {hardestWords.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Мало данных (нужно ≥3 попыток на слово).</div>}
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
