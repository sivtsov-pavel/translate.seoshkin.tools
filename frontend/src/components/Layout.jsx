import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const { t, lang, setLang } = useI18nStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div>
      <nav style={{ display: 'flex', gap: 16, padding: '12px 24px', backgroundColor: '#4f46e5', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/" style={linkStyle('#fff', true)}>{t.nav.appName}</Link>
        <Link to="/" style={linkStyle('#fff')}>{t.nav.today}</Link>
        <Link to="/lessons" style={linkStyle('#fff')}>{t.nav.lessons}</Link>
        <Link to="/vocabulary" style={linkStyle('#fff')}>{t.nav.vocabulary}</Link>
        {user?.role === 'owner' && (
          <Link to="/lessons/new" style={linkStyle('#fff')}>{t.nav.newLesson}</Link>
        )}

        {/* Переключатель языка в навигации */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setLang('ru')}
            title="Русский"
            style={{ ...langBtnStyle, fontWeight: lang === 'ru' ? 700 : 400, opacity: lang === 'ru' ? 1 : 0.6 }}>
            RU
          </button>
          <span style={{ color: '#a5b4fc' }}>|</span>
          <button
            onClick={() => setLang('de')}
            title="Deutsch"
            style={{ ...langBtnStyle, fontWeight: lang === 'de' ? 700 : 400, opacity: lang === 'de' ? 1 : 0.6 }}>
            DE
          </button>
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: '1px solid #a5b4fc', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginLeft: 8 }}>
            {t.nav.logout}
          </button>
        </div>
      </nav>
      <main style={{ maxWidth: 800, margin: '24px auto', padding: '0 16px' }}>
        {children}
      </main>
    </div>
  )
}

const linkStyle = (color, bold = false) => ({
  color,
  textDecoration: 'none',
  fontSize: 15,
  fontWeight: bold ? 700 : 400,
})

const langBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 4px',
}
