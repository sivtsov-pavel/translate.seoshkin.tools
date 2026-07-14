import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { speak, SpeakButton } from '../hooks/useSpeech.jsx'

const ROLE = { question: '❓ Вопрос', answer: '💬 Ответ', statement: '📗 Фраза' }

export default function ClassGame() {
  const { id } = useParams()
  const { lang } = useI18nStore()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')
  const [savedIds, setSavedIds] = useState(() => new Set())
  const pollRef = useRef(null)

  // Добавить одну фразу в разговорник (крестик у фразы)
  const addOne = async (l, title) => {
    try {
      await api.post('/phrasebook', { de: l.de, ru: l.tr || '', category: `🎮 ${title}`, source: 'game' })
      setSavedIds(prev => new Set(prev).add(l.id))
    } catch (e) { alert('Ошибка: ' + e.message) }
  }

  const load = async () => {
    try {
      const st = await api.get(`/class-games/${id}/status`)
      if (st.status === 'generating') { setErr(''); setData({ generating: true, progress: st.progress }); return }
      if (st.status === 'error') { setErr(st.progress || 'Ошибка сборки игры'); setData(null); return }
      const d = await api.get(`/class-games/${id}?lang=${lang}`)
      setData(d)
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { load(); pollRef.current = setInterval(load, 3000); return () => clearInterval(pollRef.current) }, [id, lang]) // eslint-disable-line

  const markRead = async (lid) => {
    try { await api.post(`/class-games/${id}/lines/${lid}/read`, {}); load() } catch {}
  }
  const toPhrasebook = async () => {
    try { const r = await api.post(`/class-games/${id}/to-phrasebook`, { lang }); setSaved(`✓ Сохранено в разговорник: ${r.saved}`) }
    catch (e) { setSaved('Ошибка: ' + e.message) }
  }

  if (err) return <Wrap><div style={{ color: 'var(--red)' }}>{err}</div></Wrap>
  if (!data) return <Wrap><div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div></Wrap>
  if (data.generating) return <Wrap><div style={{ textAlign: 'center', padding: 40 }}><div style={{ fontSize: 40 }}>🎮</div><p style={{ color: 'var(--ink-soft)' }}>{data.progress || 'Собираю игру…'}</p></div></Wrap>

  const lines = data.lines || []

  // ── Экран ученика: свои фразы ──
  if (!isOwner) {
    return (
      <Wrap>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>🎮 {data.game.title || 'Игра класса'}</h1>
        <p style={{ color: 'var(--ink-soft)', margin: '0 0 16px', fontSize: 14 }}>Твои {lines.length} фраз. Читай вслух, когда скажет учитель.</p>
        {lines.map(l => (
          <div key={l.id} style={{ background: 'var(--surface)', border: `1px solid ${l.read ? 'var(--good, #16a34a)' : 'var(--line)'}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{ROLE[l.role] || ROLE.statement}</span>
              {/* Крестик «+ в разговорник» */}
              <button onClick={() => addOne(l, data.game.title || 'Игра класса')} disabled={savedIds.has(l.id)}
                title="Добавить в разговорник" style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: savedIds.has(l.id) ? 'default' : 'pointer',
                  border: `1px solid ${savedIds.has(l.id) ? 'var(--good, #16a34a)' : 'var(--accent)'}`,
                  background: savedIds.has(l.id) ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--accent-soft)',
                  color: savedIds.has(l.id) ? 'var(--good, #16a34a)' : 'var(--accent)', fontSize: 16, fontWeight: 700,
                }}>{savedIds.has(l.id) ? '✓' : '+'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 700, flex: 1 }} dir="ltr">{l.de}</span>
              <SpeakButton text={l.de} size={22} />
            </div>
            {l.tr && <div style={{ fontSize: 15, color: 'var(--ink-soft)', marginTop: 6, fontStyle: 'italic' }}>{l.tr}</div>}
            <button onClick={() => markRead(l.id)} disabled={l.read} style={{
              marginTop: 10, padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 600,
              background: l.read ? 'var(--surface-2)' : 'var(--accent)', color: l.read ? 'var(--ink-soft)' : 'var(--accent-ink)',
              cursor: l.read ? 'default' : 'pointer',
            }}>{l.read ? '✓ Прочитал' : 'Прочитал'}</button>
          </div>
        ))}
        <button onClick={toPhrasebook} style={{ marginTop: 8, padding: '11px 20px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
          📖 Сохранить всё в разговорник
        </button>
        {saved && <div style={{ marginTop: 8, color: 'var(--good, #16a34a)' }}>{saved}</div>}
      </Wrap>
    )
  }

  // ── Экран учителя: все фразы по ученикам ──
  const byStudent = {}
  for (const l of lines) { (byStudent[l.student || '—'] ||= []).push(l) }
  return (
    <Wrap>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>🎮 {data.game.title || 'Игра класса'}</h1>
      <p style={{ color: 'var(--ink-soft)', margin: '0 0 16px', fontSize: 14 }}>
        {lines.length} фраз · {Object.keys(byStudent).length} учеников. Ведущий — ты: даёшь читать по очереди.
      </p>
      {Object.entries(byStudent).map(([student, sl]) => (
        <div key={student} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--accent)' }}>👤 {student} · {sl.length}</div>
          {sl.map(l => (
            <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', flexShrink: 0, width: 64 }}>{ROLE[l.role] || ''}</span>
              <span style={{ flex: 1, fontWeight: 600 }} dir="ltr">{l.de}</span>
              <SpeakButton text={l.de} size={18} />
              {l.read && <span style={{ color: 'var(--good, #16a34a)', flexShrink: 0 }}>✓</span>}
            </div>
          ))}
        </div>
      ))}
    </Wrap>
  )
}

function Wrap({ children }) {
  return <div style={{ maxWidth: 720, margin: '0 auto', padding: '18px 16px 60px' }}>{children}</div>
}
