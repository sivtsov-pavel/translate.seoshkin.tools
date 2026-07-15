import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

// Экран ученика: войти в класс по коду или по ссылке-приглашению /join/:code.
export default function JoinClass() {
  const { code: urlCode } = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState(urlCode || '')
  const [status, setStatus] = useState('idle') // idle | joining | done | error
  const [joined, setJoined] = useState(null)
  const [err, setErr] = useState('')

  const join = async (c) => {
    const clean = (c || '').trim().toUpperCase()
    if (!clean) return
    setStatus('joining'); setErr('')
    try {
      const res = await api.post('/classes/join', { code: clean })
      setJoined(res.class); setStatus('done')
    } catch (e) { setErr(e.message); setStatus('error') }
  }
  useEffect(() => { if (urlCode) join(urlCode) }, [urlCode]) // авто-вход по ссылке

  return (
    <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ padding: '26px 24px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(59,122,87,0.14))' }}>
          <div style={{ fontSize: 44 }}>🏫</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>Войти в класс</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>Введи код от учителя или открой ссылку-приглашение</div>
        </div>

        <div style={{ padding: '22px 24px' }}>
          {status === 'done' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px' }}>Ты в классе «{joined?.name}»!</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 18 }}>Теперь тебе доступны уроки этого класса.</div>
              <button onClick={() => navigate('/')} style={{
                padding: '12px 26px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 15,
              }}>▶ К занятиям</button>
            </div>
          ) : (
            <>
              <input autoFocus value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && join(code)}
                placeholder="КОД КЛАССА"
                style={{
                  width: '100%', boxSizing: 'border-box', textAlign: 'center', fontFamily: 'monospace',
                  fontSize: 24, fontWeight: 800, letterSpacing: '4px', padding: '14px', borderRadius: 12,
                  border: '2px dashed var(--accent)', background: 'var(--surface-2)', color: 'var(--accent)',
                }} />
              {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{err}</div>}
              <button onClick={() => join(code)} disabled={status === 'joining' || !code.trim()} style={{
                width: '100%', marginTop: 14, padding: '13px', borderRadius: 12, border: 'none',
                cursor: status === 'joining' ? 'default' : 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 15,
                opacity: (status === 'joining' || !code.trim()) ? 0.6 : 1,
              }}>{status === 'joining' ? 'Вхожу…' : 'Войти в класс'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
