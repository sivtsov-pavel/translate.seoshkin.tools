import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import LangSwitcher from '../components/LangSwitcher.jsx'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
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

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'right', marginBottom: 24 }}>
        <LangSwitcher />
      </div>

      <h1 style={{ marginBottom: 24 }}>{t.nav.appName}</h1>
      <h2 style={{ marginBottom: 20 }}>{t.auth.register}</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.email}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={inputStyle} />
          </label>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t.auth.passwordHint}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} style={inputStyle} />
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
        {error && <p style={{ color: '#ef4444', marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? t.auth.registering : t.auth.register}
        </button>
      </form>
      <p style={{ marginTop: 16, color: '#6b7280' }}>
        {t.auth.hasAccount} <Link to="/login">{t.auth.login}</Link>
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
