import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

// Фоновый индикатор обработки (правый верхний угол): видно, что уроки/файлы обрабатываются,
// даже если уйти на другую страницу. Опрашивает статус, сам появляется/исчезает.
// Только для учителя. При ошибках подсказывает повторить.
export default function ProcessingBadge() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [st, setSt] = useState(null)
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (user?.role !== 'owner') return
    let alive = true
    const poll = async () => {
      try {
        const r = await api.get('/lessons/processing-status')
        if (!alive) return
        setSt(r)
        // Пока есть активные — опрашиваем чаще; если тихо — реже
        const next = (r.active > 0) ? 6000 : 20000
        timerRef.current = setTimeout(poll, next)
      } catch {
        timerRef.current = setTimeout(poll, 20000)
      }
    }
    poll()
    return () => { alive = false; clearTimeout(timerRef.current) }
  }, [user?.role])

  if (user?.role !== 'owner' || !st) return null
  const { active = 0, processing = 0, pending = 0, error = 0, current } = st
  if (active === 0 && error === 0) return null // всё спокойно — бейдж скрыт

  return (
    <div style={{ position: 'fixed', top: 'calc(10px + env(safe-area-inset-top))', right: 12, zIndex: 500 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
          border: `1px solid ${active > 0 ? 'var(--accent)' : 'var(--red, #d64545)'}`,
          background: active > 0 ? 'var(--accent-soft)' : 'rgba(214,69,69,.12)',
          color: active > 0 ? 'var(--accent)' : 'var(--red, #d64545)',
          cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
        }}>
        {active > 0
          ? <><span style={{ display: 'inline-block', animation: 'pbspin 1s linear infinite' }}>⏳</span> Обрабатывается {active}</>
          : <>⚠️ Ошибок: {error}</>}
        <style>{`@keyframes pbspin { to { transform: rotate(360deg) } }`}</style>
      </button>

      {open && (
        <div style={{
          marginTop: 8, width: 260, padding: 14, borderRadius: 14,
          background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 8px 30px rgba(0,0,0,.18)',
          fontSize: 13, color: 'var(--ink)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📚 Обработка уроков</div>
          {processing > 0 && <div>⏳ Сейчас: {processing}</div>}
          {pending > 0 && <div style={{ color: 'var(--ink-soft)' }}>⌛ В очереди: {pending}</div>}
          {current && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
              «{current.title}»{current.progress ? ` — ${current.progress}` : ''}
            </div>
          )}
          {error > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', color: 'var(--red, #d64545)' }}>
              ⚠️ С ошибкой: {error}. Открой урок и нажми «✨ Обработать всё» или «🎨», чтобы повторить.
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-soft)' }}>
            Можно спокойно уйти на другую страницу — обработка идёт в фоне.
          </div>
          {current?.course_id && (
            <button onClick={() => { setOpen(false); navigate(`/courses/${current.course_id}`) }}
              style={{ marginTop: 10, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
              Открыть курс
            </button>
          )}
        </div>
      )}
    </div>
  )
}
