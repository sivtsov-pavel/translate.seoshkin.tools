import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import LangSwitcher from './LangSwitcher.jsx'
import { AutoSpeakToggle } from '../hooks/useSpeech.jsx'

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const { t } = useI18nStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const isRtl = t.dir === 'rtl'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div>
      <nav style={{ backgroundColor: '#4f46e5', padding: '0 16px' }}>
        {/* Верхняя строка: лого + гамбургер на мобильном */}
        <div style={{ display: 'flex', alignItems: 'center', minHeight: 52 }}>
          <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
            {t.nav.appName}
          </Link>

          {/* Десктопная навигация */}
          <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 24, flex: 1 }}>
            <Link to="/"           style={navLink}>{t.nav.today}</Link>
            <Link to="/courses"    style={navLink}>{t.nav.courses}</Link>
            <Link to="/lessons"    style={navLink}>{t.nav.lessons}</Link>
            <Link to="/vocabulary" style={navLink}>{t.nav.vocabulary}</Link>
            {user?.role === 'owner' && (
              <Link to="/students" style={navLink}>{t.nav.students}</Link>
            )}
            <Link to="/reader" style={navLink}>📖 Читалка</Link>
            <Link to="/wiki" style={navLink}>{t.nav.wiki}</Link>
            {user?.role === 'owner' && (
              <Link to="/lessons/new" style={{ ...navLink, backgroundColor: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: 6 }}>
                {t.nav.newLesson}
              </Link>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <AutoSpeakToggle />
              <LangSwitcher dark />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.role === 'owner' ? '👨‍🏫' : '👨‍🎓'} {user?.email}
              </span>
              <button onClick={handleLogout} style={logoutBtn}>{t.nav.logout}</button>
            </div>
          </div>

          {/* Гамбургер для мобильных */}
          <button
            className="nav-burger"
            onClick={() => setMenuOpen(v => !v)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'none', flexDirection: 'column', gap: 5 }}>
            <span style={{ display: 'block', width: 22, height: 2, backgroundColor: '#fff', transition: menuOpen ? 'transform .2s' : 'none', transform: menuOpen ? 'rotate(45deg) translateY(7px)' : 'none' }} />
            <span style={{ display: 'block', width: 22, height: 2, backgroundColor: '#fff', opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display: 'block', width: 22, height: 2, backgroundColor: '#fff', transform: menuOpen ? 'rotate(-45deg) translateY(-7px)' : 'none', transition: menuOpen ? 'transform .2s' : 'none' }} />
          </button>
        </div>

        {/* Мобильное меню */}
        {menuOpen && (
          <div className="nav-mobile-menu" style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.15)' }}
               onClick={() => setMenuOpen(false)}>
            <MobileLink to="/">{t.nav.today}</MobileLink>
            <MobileLink to="/courses">{t.nav.courses}</MobileLink>
            <MobileLink to="/lessons">{t.nav.lessons}</MobileLink>
            <MobileLink to="/vocabulary">{t.nav.vocabulary}</MobileLink>
            {user?.role === 'owner' && <MobileLink to="/students">{t.nav.students}</MobileLink>}
            <MobileLink to="/reader">📖 Читалка</MobileLink>
            <MobileLink to="/wiki">{t.nav.wiki}</MobileLink>
            {user?.role === 'owner' && <MobileLink to="/lessons/new">{t.nav.newLesson}</MobileLink>}
            <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <AutoSpeakToggle />
              <LangSwitcher dark />
              <button onClick={handleLogout} style={logoutBtn}>{t.nav.logout}</button>
            </div>
          </div>
        )}
      </nav>

      {/* Глобальные стили адаптива */}
      <style>{`
        @media (max-width: 600px) {
          .nav-desktop { display: none !important; }
          .nav-burger  { display: flex !important; }
        }
        @media (min-width: 601px) {
          .nav-mobile-menu { display: none !important; }
        }
      `}</style>

      <main style={{ maxWidth: 800, margin: '20px auto', padding: '0 16px' }} dir={isRtl ? 'rtl' : undefined}>
        {children}
      </main>
    </div>
  )
}

function MobileLink({ to, children }) {
  return (
    <Link to={to} style={{ display: 'block', color: '#fff', textDecoration: 'none', padding: '10px 0', fontSize: 16, fontWeight: 500 }}>
      {children}
    </Link>
  )
}

const navLink = { color: '#fff', textDecoration: 'none', fontSize: 15 }
const logoutBtn = { background: 'none', border: '1px solid #a5b4fc', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 13 }
