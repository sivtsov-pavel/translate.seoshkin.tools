import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import PublicHeader from '../components/PublicHeader.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      const { token, user } = await api.post('/auth/login', { email, password })
      login(token, user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <PublicHeader />
      <div style={{ maxWidth: 400, margin: '60px auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 20 }}>{t.auth.login}</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.email}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </label>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.password}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          </label>
        </div>
        {error && <p style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? t.auth.loggingIn : t.auth.login}
        </button>
      </form>
      <p style={{ marginTop: 16, color: 'var(--ink-soft)' }}>
        {t.auth.noAccount} <Link to="/register">{t.auth.register}</Link>
      </p>
      </div>
    </div>
  )
}

const inputStyle = { display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box' }
const btnStyle = { width: '100%', padding: 12, fontSize: 16, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }
