import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import PublicHeader from '../components/PublicHeader.jsx'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [role, setRole] = useState('student')

  // Генератор надёжного пароля (без похожих символов) + показать его
  const genPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%'
    let p = ''
    const arr = new Uint32Array(14)
    ;(window.crypto || window.msCrypto).getRandomValues(arr)
    for (let i = 0; i < 14; i++) p += chars[arr[i] % chars.length]
    setPassword(p)
    setShowPass(true)
  }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const { t } = useI18nStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await api.post('/auth/register', { email, password, role })
      login(token, user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg|OPR|YaBrowser/.test(navigator.userAgent)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <PublicHeader />
      <div style={{ maxWidth: 400, margin: '60px auto', padding: '0 16px' }}>

      {/* Рекомендация Chrome — только если не Chrome */}
      {!isChrome && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 10,
          padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>🌐</span>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong>Рекомендуем Google Chrome</strong> — лучший опыт работы с приложением.{' '}
            <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer"
              style={{ color: '#B45309', fontWeight: 600 }}>
              Скачать Chrome →
            </a>
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: 20 }}>{t.auth.register}</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.email}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </label>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.passwordHint}
            <div style={{ position: 'relative', marginTop: 4 }}>
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                style={{ ...inputStyle, marginTop: 0, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPass(v => !v)} title={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, padding: 4, lineHeight: 1 }}>
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
            <button type="button" onClick={genPassword}
              style={{ marginTop: 6, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--accent)', fontWeight: 600 }}>
              🎲 Сгенерировать пароль
            </button>
          </label>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.role}
            <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
              <option value="student">{t.auth.roleStudent}</option>
              <option value="owner">{t.auth.roleOwner}</option>
            </select>
          </label>
        </div>
        {error && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? t.auth.registering : t.auth.register}
        </button>
      </form>
      <p style={{ marginTop: 16, color: 'var(--ink-soft)' }}>
        {t.auth.hasAccount} <Link to="/login">{t.auth.login}</Link>
      </p>
      </div>
    </div>
  )
}

const inputStyle = { display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }
const btnStyle = { width: '100%', padding: 12, fontSize: 16, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }
