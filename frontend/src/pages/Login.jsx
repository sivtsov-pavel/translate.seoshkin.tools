import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import LangSwitcher from '../components/LangSwitcher.jsx'

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
    <div style={{ maxWidth: 400, margin: '60px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'right', marginBottom: 24 }}>
        <LangSwitcher />
      </div>

      <h1 style={{ marginBottom: 24 }}>{t.nav.appName}</h1>
      <h2 style={{ marginBottom: 20 }}>{t.auth.login}</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.email}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={inputStyle} />
          </label>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.password}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={inputStyle} />
          </label>
        </div>
        {error && <p style={{ color: '#ef4444', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? t.auth.loggingIn : t.auth.login}
        </button>
      </form>
      <p style={{ marginTop: 16, color: '#6b7280' }}>
        {t.auth.noAccount} <Link to="/register">{t.auth.register}</Link>
      </p>
    </div>
  )
}

const inputStyle = {
  display: 'block', width: '100%', padding: '10px 12px', fontSize: 16,
  border: '1px solid #d1d5db', borderRadius: 6, marginTop: 4, boxSizing: 'border-box',
}
const btnStyle = {
  width: '100%', padding: 12, fontSize: 16,
  backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
}
