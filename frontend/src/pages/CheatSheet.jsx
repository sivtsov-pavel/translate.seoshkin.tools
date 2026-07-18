import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import data from '../data/cheatsheetDe.json'
import { SpeakButton } from '../hooks/useSpeech.jsx'

// 🔖 Шпаргалки: интерактивные таблицы (неправильные глаголы 3 формы + личные местоимения).
// Данные — языковые факты (JSON), офлайн, с поиском, озвучкой и тренажёром.
const GENDER_COLOR = { der: '#3b7ac0', die: '#c0453b', das: '#3b9e57' }

const cell = { padding: '8px 10px', fontSize: 14, borderTop: '1px solid var(--line)', verticalAlign: 'top' }
const th = { padding: '8px 10px', textAlign: 'left', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }
const thSub = { fontSize: 10.5, fontWeight: 500, color: 'var(--ink-soft)', textTransform: 'none', letterSpacing: 0, display: 'block', marginTop: 1 }

// Заголовок колонки с переводом-подписью снизу
function ColHead({ title, sub }) {
  return <th style={th}>{title}<span style={thSub}>{sub}</span></th>
}

export default function CheatSheet() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('verbs')
  const [q, setQ] = useState('')
  const [learn, setLearn] = useState(false) // режим «учить формы» — прячем 2/3 форму

  const verbs = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? data.verbs.filter(v => v.inf.toLowerCase().includes(s) || (v.ru || '').toLowerCase().includes(s)) : data.verbs
    // группируем по категории
    const groups = {}
    for (const v of list) (groups[v.group] ||= []).push(v)
    return groups
  }, [q])

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 12px 60px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 6 }}>← Назад</button>
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>🔖 Шпаргалки</h1>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 14 }}>Самое нужное под рукой: неправильные глаголы и местоимения. Тапни 🔊 — послушать.</div>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 14, width: 'fit-content' }}>
        {[['verbs', '⚡ Глаголы'], ['pronouns', '👤 Местоимения']].map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: tab === id ? 700 : 500, cursor: 'pointer', border: 'none',
              background: tab === id ? 'var(--accent)' : 'var(--surface-2)', color: tab === id ? 'var(--accent-ink)' : 'var(--ink)' }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'verbs' && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск глагола…"
              style={{ flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }} />
            <button onClick={() => setLearn(v => !v)}
              title="Спрятать 2-ю и 3-ю форму — вспоминай сам"
              style={{ padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                border: `1px solid ${learn ? 'var(--accent)' : 'var(--line)'}`, background: learn ? 'var(--accent-soft)' : 'var(--surface-2)', color: learn ? 'var(--accent)' : 'var(--ink-soft)' }}>
              🎯 {learn ? 'Учу формы' : 'Учить формы'}
            </button>
          </div>

          {Object.entries(verbs).map(([group, list]) => (
            <div key={group} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{group}</div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '28%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '24%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <ColHead title="Перевод" sub="что значит" />
                      <ColHead title="Infinitiv" sub="начальная" />
                      <ColHead title="Präteritum" sub="прошедшее" />
                      <ColHead title="Partizip II" sub="причастие" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((v, i) => (
                      <tr key={i}>
                        <td style={{ ...cell, color: 'var(--ink-soft)' }}>{v.ru}</td>
                        <td style={{ ...cell, fontWeight: 700 }}>
                          {v.inf} <SpeakButton text={v.inf} size={13} />
                        </td>
                        <td style={{ ...cell, color: '#B07D1B' }}>
                          {learn ? <span style={{ opacity: 0.35 }}>•••</span> : <>{v.prat} <SpeakButton text={v.prat} size={13} /></>}
                        </td>
                        <td style={{ ...cell, color: 'var(--good)' }}>
                          {learn ? <span style={{ opacity: 0.35 }}>•••</span> : <>{v.part} <SpeakButton text={v.part} size={13} /></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {Object.keys(verbs).length === 0 && <div style={{ color: 'var(--ink-soft)', padding: 20, textAlign: 'center' }}>Ничего не найдено</div>}
        </>
      )}

      {tab === 'pronouns' && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <ColHead title="Перевод" sub="кто" />
                <ColHead title="Nominativ" sub="кто? (я)" />
                <ColHead title="Akkusativ" sub="кого? (меня)" />
                <ColHead title="Dativ" sub="кому? (мне)" />
              </tr>
            </thead>
            <tbody>
              {data.pronouns.rows.map((r, i) => {
                const col = r.gender ? GENDER_COLOR[r.gender] : 'var(--ink)'
                return (
                  <tr key={i}>
                    <td style={{ ...cell, color: 'var(--ink-soft)', fontSize: 13 }}>{r.ru}</td>
                    {['nom', 'akk', 'dat'].map(k => (
                      <td key={k} style={{ ...cell, fontWeight: 700, color: col }}>
                        {r[k]} <SpeakButton text={r[k]} size={13} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
