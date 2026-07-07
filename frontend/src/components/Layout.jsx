import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import LangSwitcher from './LangSwitcher.jsx'

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const { t } = useI18nStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div>
      <nav style={{ display: 'flex', gap: 16, padding: '12px 24px', backgroundColor: '#4f46e5', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700 }}>{t.nav.appName}</Link>
        <Link to="/" style={navLink}>{t.nav.today}</Link>
        <Link to="/lessons" style={navLink}>{t.nav.lessons}</Link>
        <Link to="/vocabulary" style={navLink}>{t.nav.vocabulary}</Link>
        {user?.role === 'owner' && (
          <Link to="/lessons/new" style={{ ...navLink, backgroundColor: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: 6 }}>
            {t.nav.newLesson}
          </Link>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangSwitcher dark />
          <button
            onClick={handleLogout}
            style={{ background: 'none', border: '1px solid #a5b4fc', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
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

const navLink = { color: '#fff', textDecoration: 'none', fontSize: 15 }
