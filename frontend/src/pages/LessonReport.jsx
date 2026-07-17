import { useEffect, useState, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

// Отчёт по одному уроку: где буксует группа + как идёт каждый ученик.
const TYPE_LABELS = {
  flashcard: 'Флеш-карта', fill_blank: 'Пропуск', multiple_choice: 'Выбор ответа',
  sentence_write: 'Напиши предложение', letter_fill: 'Добавь букву',
  dictation: 'Диктант', speech: 'Произношение',
}
const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 16 }
const th = { padding: '8px 10px', textAlign: 'left', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12 }
const td = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' }
const accColor = (p) => p < 60 ? 'var(--red, #d64545)' : p < 80 ? '#B07D1B' : 'var(--good, #16a34a)'

export default function LessonReport() {
  const { id } = useParams()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [openStudent, setOpenStudent] = useState(null)

  useEffect(() => { api.get(`/analytics/lesson/${id}`).then(setData).catch(e => setErr(e.message)) }, [id])

  if (user?.role !== 'owner') return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔒</div><h2>Только для учителя</h2>
    </div>
  )
  if (err) return <div style={{ maxWidth: 720, margin: '40px auto', color: 'var(--red, #d64545)' }}>Ошибка: {err}</div>
  if (!data) return <div style={{ maxWidth: 720, margin: '40px auto', color: 'var(--ink-soft)' }}>Загрузка…</div>

  const { lesson, totals, group, students, notStarted } = data

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 12px 60px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>← Назад</button>
      <h2 style={{ margin: '0 0 4px' }}>📊 Отчёт: {lesson.title}</h2>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 16 }}>
        Учеников работало: {totals.students_touched} из {totals.students_total} · попыток: {totals.attempts} · средняя точность:{' '}
        <b style={{ color: accColor(totals.accuracy) }}>{totals.accuracy}%</b>
      </div>

      {/* Блок А — группа буксует здесь */}
      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>🔥 Группа буксует здесь</h3>
        {group.hardWords.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Пока нет слов с массовыми ошибками — класс справляется 👍</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Слово</th><th style={th}>Ошибок</th><th style={th}>Завязло учеников</th></tr></thead>
            <tbody>
              {group.hardWords.map((w, i) => (
                <tr key={i}>
                  <td style={td}><b>{w.word_de}</b> <span style={{ color: 'var(--ink-soft)' }}>— {w.translation}</span></td>
                  <td style={{ ...td, color: accColor(100 - w.wrong_pct) }}>{w.wrong_pct}%</td>
                  <td style={td}>{w.students_stuck}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {group.byType.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {group.byType.map((t, i) => (
              <span key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                {TYPE_LABELS[t.type] || t.type}: <b style={{ color: accColor(t.accuracy) }}>{t.accuracy}%</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Блок Б — по ученикам */}
      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>👤 По ученикам</h3>
        {students.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Урок ещё никто не проходил.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Ученик</th><th style={th}>Точность</th><th style={th}>Знаю/Учу</th><th style={th}>Завис</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <Fragment key={s.id}>
                  <tr onClick={() => setOpenStudent(openStudent === s.id ? null : s.id)} style={{ cursor: s.stuck_list.length ? 'pointer' : 'default' }}>
                    <td style={td}>{s.stuck_list.length ? (openStudent === s.id ? '▾ ' : '▸ ') : ''}{s.name}</td>
                    <td style={{ ...td, color: accColor(s.accuracy) }}>{s.accuracy}%</td>
                    <td style={td}>{s.known}/{s.learning}</td>
                    <td style={td}>{s.stuck_words > 0 ? <b style={{ color: 'var(--red, #d64545)' }}>{s.stuck_words}</b> : '—'}</td>
                  </tr>
                  {openStudent === s.id && s.stuck_list.map((w, j) => (
                    <tr key={`${s.id}-${j}`}>
                      <td style={{ ...td, paddingLeft: 24, color: 'var(--ink-soft)', fontSize: 12 }} colSpan={4}>
                        {w.word_de} — {w.translation} · ошибок {w.wrong_pct}%
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Не приступили */}
      {notStarted.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>⏳ Не приступили ({notStarted.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {notStarted.map((s) => (
              <span key={s.id} style={{ fontSize: 12.5, padding: '4px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>{s.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
