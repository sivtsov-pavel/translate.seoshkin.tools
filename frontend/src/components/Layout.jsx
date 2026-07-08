import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import { useThemeStore } from '../store/theme.js'
import LangSwitcher from './LangSwitcher.jsx'
import { AutoSpeakToggle, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const { t } = useI18nStore()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const drawerRef = useRef()
  const isRtl = t.dir === 'rtl'

  // Закрываем drawer при смене роута
  useEffect(() => { setOpen(false) }, [location.pathname])

  // Закрываем по свайпу влево
  useEffect(() => {
    const el = drawerRef.current
    if (!el) return
    let startX = 0
    const onTouchStart = e => { startX = e.touches[0].clientX }
    const onTouchEnd = e => { if (startX - e.changedTouches[0].clientX > 60) setOpen(false) }
    el.addEventListener('touchstart', onTouchStart)
    el.addEventListener('touchend', onTouchEnd)
    return () => { el.removeEventListener('touchstart', onTouchStart); el.removeEventListener('touchend', onTouchEnd) }
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  const navItems = [
    { to: '/',          icon: 'bi-house-door-fill',    label: t.nav.today },
    { to: '/courses',   icon: 'bi-mortarboard-fill',   label: t.nav.courses },
    { to: '/lessons',   icon: 'bi-book-fill',          label: t.nav.lessons },
    { to: '/vocabulary',icon: 'bi-card-list',          label: t.nav.vocabulary },
    ...(user?.role === 'owner' ? [{ to: '/students', icon: 'bi-people-fill', label: t.nav.students }] : []),
    { to: '/reader',    icon: 'bi-eyeglasses',         label: 'Читалка' },
    { to: '/wiki',      icon: 'bi-question-circle-fill', label: t.nav.wiki },
    ...(user?.role === 'owner' ? [{ to: '/lessons/new', icon: 'bi-plus-circle-fill', label: t.nav.newLesson, divider: true }] : []),
  ]

  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', position: 'relative' }}
         dir={isRtl ? 'rtl' : undefined}>

      {/* Полоска флага */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 200,
        background: 'linear-gradient(90deg, #111 0 33%, #B3382C 33% 66%, #C9A54A 66% 100%)' }} />

      {/* Топбар */}
      <header style={{
        position: 'fixed', top: 3, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', background: 'var(--bg)',
        borderBottom: '1px solid var(--line)',
      }}>
        <button onClick={() => setOpen(true)} style={iconBtn} aria-label="Меню">
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <rect width="18" height="2" rx="1" fill="currentColor"/>
            <rect y="6" width="12" height="2" rx="1" fill="currentColor"/>
            <rect y="12" width="18" height="2" rx="1" fill="currentColor"/>
          </svg>
        </button>

        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)', fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 18 }}>
          🇩🇪 {t.nav.appName}
        </Link>

        <div style={{ width: 40 }} />
      </header>

      {/* Overlay */}
      <div onClick={() => setOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(0,0,0,0.55)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity .25s ease',
      }} />

      {/* Drawer */}
      <nav ref={drawerRef} style={{
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 160,
        width: 280, background: 'var(--surface)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
        display: 'flex', flexDirection: 'column',
        borderRadius: '0 22px 22px 0', overflow: 'hidden',
      }}>
        {/* Шапка drawer */}
        <div style={{ padding: '22px 20px 18px', background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          <div style={{ fontFamily: 'Georgia,serif', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            🇩🇪 {t.nav.appName}
          </div>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                {user.email[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{user.email.split('@')[0]}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{user.role === 'owner' ? '👨‍🏫 Учитель' : '👨‍🎓 Ученик'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Пункты меню */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {navItems.map((item, i) => (
            <div key={item.to}>
              {item.divider && <div style={{ height: 1, background: 'var(--line)', margin: '8px 12px' }} />}
              <Link to={item.to} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 12px', borderRadius: 12, fontSize: 15,
                textDecoration: 'none',
                color: isActive(item.to) ? 'var(--accent)' : 'var(--ink)',
                background: isActive(item.to) ? 'var(--accent-soft)' : 'transparent',
                fontWeight: isActive(item.to) ? 700 : 400,
                transition: 'background .15s',
              }}>
                <i className={`bi ${item.icon}`} style={{ width: 20, textAlign: 'center', fontSize: 17, flexShrink: 0 }} />
                {item.label}
              </Link>
            </div>
          ))}
        </div>

        {/* Подвал drawer */}
        <div style={{ padding: '14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={toggleTheme} style={pill} title="Переключить тему">
            <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill'}`} />
            {theme === 'dark' ? ' Светлая' : ' Тёмная'}
          </button>
          <AutoSpeakToggle pill />
          <SpeakTranslationToggle />
          <LangSwitcher pill />
          <button onClick={handleLogout} style={{ ...pill, color: '#C0392B', borderColor: '#C0392B22' }}>
            <i className="bi bi-box-arrow-right" /> {t.nav.logout}
          </button>
        </div>
      </nav>

      {/* Контент */}
      <main style={{ paddingTop: 56 + 3, paddingLeft: 30, paddingRight: 30, minHeight: '100vh', maxWidth: 640, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}

const iconBtn = {
  width: 40, height: 40, borderRadius: 12,
  border: '1px solid var(--line)', background: 'var(--surface)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--ink)',
}
const pill = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'var(--surface-2)', border: '1px solid var(--line)',
  borderRadius: 999, padding: '8px 12px', fontSize: 13,
  color: 'var(--ink)', cursor: 'pointer',
}
