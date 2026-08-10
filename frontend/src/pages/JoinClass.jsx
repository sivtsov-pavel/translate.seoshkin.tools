import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import PublicHeader from '../components/PublicHeader.jsx'

// Экран входа в класс по коду или ссылке-приглашению /join/:code.
// Работает и для НОВОГО ученика без аккаунта: без токена показываем форму
// email+пароль, регистрируем (или логиним) и сразу присоединяем к классу.
export default function JoinClass() {
  const t = useI18nStore(s => s.t)
  const { code: urlCode } = useParams()
  const navigate = useNavigate()
  const { token, login } = useAuthStore()
  const [code, setCode] = useState(urlCode || '')
  const [status, setStatus] = useState('idle') // idle | joining | done | error
  const [joined, setJoined] = useState(null)
  const [err, setErr] = useState('')
  // Форма нового ученика (показывается, когда не залогинен)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('register') // register | login

  const join = async (c) => {
    const clean = (c || '').trim().toUpperCase()
    if (!clean) return
    setStatus('joining'); setErr('')
    try {
      const res = await api.post('/classes/join', { code: clean })
      sessionStorage.removeItem('pendingJoinCode')
      setJoined(res.class); setStatus('done')
    } catch (e) { setErr(e.message); setStatus('error') }
  }

  // Код из ссылки запоминаем: если ученик уйдёт на обычные /login или /register,
  // после входа его вернут сюда и класс подхватится автоматически.
  useEffect(() => {
    const clean = (urlCode || '').trim().toUpperCase()
    if (clean) sessionStorage.setItem('pendingJoinCode', clean)
    if (token && clean && status === 'idle') join(clean) // уже залогинен — входим сразу
  }, [urlCode, token])

  // Новый ученик: регистрация (или вход) + вход в класс одним действием
  const authAndJoin = async (e) => {
    e.preventDefault()
    const clean = (code || '').trim().toUpperCase()
    if (!clean) { setErr(t.school.codePlaceholder); setStatus('error'); return }
    setStatus('joining'); setErr('')
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login'
      const { token: tk, user } = await api.post(path, { email, password })
      login(tk, user)
      await join(clean)
    } catch (e) { setErr(e.message); setStatus('error') }
  }

  const card = (
    <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ padding: '26px 24px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(59,122,87,0.14))' }}>
          <div style={{ fontSize: 44 }}>🏫</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{t.school.joinBtn}</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
            {token ? t.school.joinHint : t.school.joinAuthHint}
          </div>
        </div>

        <div style={{ padding: '22px 24px' }}>
          {status === 'done' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px' }}>{t.school.joinedTitle(joined?.name)}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 18 }}>{t.school.joinedSub}</div>
              <button onClick={() => navigate('/')} style={{
                padding: '12px 26px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 15,
              }}>{t.school.goLessons}</button>
            </div>
          ) : token ? (
            <>
              <input autoFocus value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && join(code)}
                placeholder={t.school.codePlaceholder} style={codeInputStyle} />
              {err && <div style={errStyle}>{err}</div>}
              <button onClick={() => join(code)} disabled={status === 'joining' || !code.trim()} style={{
                ...btnStyle, opacity: (status === 'joining' || !code.trim()) ? 0.6 : 1,
                cursor: status === 'joining' ? 'default' : 'pointer',
              }}>{status === 'joining' ? t.school.joining : t.school.joinBtn}</button>
            </>
          ) : (
            <form onSubmit={authAndJoin}>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder={t.school.codePlaceholder} style={codeInputStyle} />
              <label style={labelStyle}>{t.auth.email}
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              </label>
              <label style={labelStyle}>{mode === 'register' ? t.auth.passwordHint : t.auth.password}
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  minLength={mode === 'register' ? 8 : undefined} style={inputStyle} />
              </label>
              {err && <div style={errStyle}>{err}</div>}
              <button type="submit" disabled={status === 'joining'} style={{
                ...btnStyle, opacity: status === 'joining' ? 0.6 : 1,
                cursor: status === 'joining' ? 'default' : 'pointer',
              }}>
                {status === 'joining' ? t.school.joining
                  : mode === 'register' ? t.school.joinRegisterBtn : t.school.joinLoginBtn}
              </button>
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--ink-soft)' }}>
                {mode === 'register'
                  ? <>{t.auth.hasAccount}{' '}
                      <a href="#" onClick={e => { e.preventDefault(); setMode('login'); setErr('') }}
                        style={{ color: 'var(--accent)', fontWeight: 600 }}>{t.auth.login}</a></>
                  : <>{t.auth.noAccount}{' '}
                      <a href="#" onClick={e => { e.preventDefault(); setMode('register'); setErr('') }}
                        style={{ color: 'var(--accent)', fontWeight: 600 }}>{t.auth.register}</a></>}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )

  // Без токена страница живёт вне Layout — рисуем публичную шапку и фон сами
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
        <PublicHeader />
        {card}
      </div>
    )
  }
  return card
}

const codeInputStyle = {
  width: '100%', boxSizing: 'border-box', textAlign: 'center', fontFamily: 'monospace',
  fontSize: 24, fontWeight: 800, letterSpacing: '4px', padding: '14px', borderRadius: 12,
  border: '2px dashed var(--accent)', background: 'var(--surface-2)', color: 'var(--accent)',
}
const labelStyle = { display: 'block', marginTop: 14, fontWeight: 500, fontSize: 14 }
const inputStyle = {
  display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '10px 12px',
  borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)',
  color: 'var(--ink)', fontSize: 15,
}
const errStyle = { color: 'var(--red)', fontSize: 13, marginTop: 10, textAlign: 'center' }
const btnStyle = {
  width: '100%', marginTop: 14, padding: '13px', borderRadius: 12, border: 'none',
  background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 15,
}
