import { Link, useLocation } from 'react-router-dom'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import LangSwitcher from './LangSwitcher.jsx'
import { useThemeStore } from '../store/theme.js'

export default function PublicHeader() {
  const { t } = useI18nStore()
  const { token } = useAuthStore()
  const { pathname } = useLocation()

  const isLogin    = pathname === '/login'
  const isRegister = pathname === '/register'

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(10,10,10,0.88)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56,
    }}>
      <Link to="/" style={{ fontWeight: 800, fontSize: 17, color: 'var(--accent)', letterSpacing: '-0.5px', textDecoration: 'none' }}>
        🇩🇪 Deutsch.lernen
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ThemeToggle />
        <LangSwitcher />

        {token ? (
          <Link to="/" style={btn('accent')}>
            {t.nav.dashboard || 'Главная'}
          </Link>
        ) : (
          <>
            {!isLogin && (
              <Link to="/login" style={btn('ghost')}>
                {t.auth.login || 'Войти'}
              </Link>
            )}
            {!isRegister && (
              <Link to="/register" style={btn('accent')}>
                {t.auth.register || 'Регистрация'}
              </Link>
            )}
          </>
        )}
      </div>
    </nav>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useThemeStore()
  return (
    <button onClick={toggle} title="Светлая / тёмная тема" style={{
      ...btn('ghost'), padding: '7px 10px', display: 'flex', alignItems: 'center',
    }}>
      <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill'}`} />
    </button>
  )
}

const btn = (variant) => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  textDecoration: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
  ...(variant === 'accent'
    ? { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }
    : { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--line)' }
  ),
})
