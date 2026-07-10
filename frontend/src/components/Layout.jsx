import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import { useThemeStore } from '../store/theme.js'
import { useAdminOpStore } from '../store/adminOp.js'
import { useSettingsStore } from '../store/settings.js'
import { api } from '../api/client.js'
import LangSwitcher from './LangSwitcher.jsx'
import { AutoSpeakToggle, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'

const SIDEBAR_W = 220

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const { t } = useI18nStore()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const adminOp = useAdminOpStore()
  const { fetchSettings } = useSettingsStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const drawerRef = useRef()
  const isRtl = t.dir === 'rtl'

  // Загружаем серверные настройки один раз при старте
  useEffect(() => { fetchSettings() }, [])

  // Polling статуса операций — работает на любой странице
  useEffect(() => {
    if (user?.role !== 'owner') return
    let tid
    const sync = async () => {
      try {
        const s = await api.get('/admin/operation-status')
        adminOp.sync(s)
      } catch {}
    }
    sync()
    tid = setInterval(sync, 2000)
    return () => clearInterval(tid)
  }, [user?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  const runOp = async (name, endpoint) => {
    adminOp.start(name)
    try {
      const res = await api.post(endpoint, {})
      if (!res?.started) adminOp.finish(res)
    } catch (e) {
      adminOp.fail(e.message)
    }
  }

  const adminOps = user?.role === 'owner' ? [
    { name: 'fetch-images',              label: t.courses.opFetchImages,        endpoint: '/admin/fetch-images' },
    { name: 'enrich-words',              label: t.courses.opEnrichWords,        endpoint: '/admin/enrich-words' },
    { name: 'translate-sentences',       label: t.courses.opTranslate,          endpoint: '/admin/translate-sentences' },
    { name: 'translate-words-all-langs', label: t.courses.opTranslateAllLangs,  endpoint: '/admin/translate-words-all-langs' },
    { name: 'translate-exercises',       label: t.courses.opTranslateExercises, endpoint: '/admin/translate-exercises' },
    { name: 'regenerate-all',            label: 'Пересоздать упражнения',        endpoint: '/admin/regenerate-all' },
  ] : []

  useEffect(() => { setOpen(false) }, [location.pathname])

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

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/'
    if (to.includes('?')) {
      const [path, qs] = to.split('?')
      return location.pathname.startsWith(path) && location.search.includes(qs)
    }
    return location.pathname.startsWith(to) && !location.search.includes('status=learning')
  }

  // Группы пунктов навигации
  const learningItems = [
    { to: '/lessons',                     icon: 'bi-book-fill',                 label: t.nav.lessons },
    { to: '/vocabulary',                  icon: 'bi-card-list',                 label: t.nav.vocabulary },
    { to: '/vocabulary?status=learning',  icon: 'bi-journal-bookmark-fill',     label: t.nav.learningWords },
    { to: '/reader',                      icon: 'bi-eyeglasses',                label: t.nav.reader },
    { to: '/phrasebook',                  icon: 'bi-chat-quote-fill',           label: 'Разговорник' },
    { to: '/translations',               icon: 'bi-globe2',                    label: 'Переводы' },
  ]

  const classItems = user?.role === 'owner' ? [
    { to: '/courses',      icon: 'bi-mortarboard-fill',   label: t.nav.courses },
    { to: '/students',     icon: 'bi-people-fill',        label: t.nav.students },
    { to: '/report',       icon: 'bi-bar-chart-fill',     label: 'Отчёт' },
    { to: '/lessons/new',  icon: 'bi-plus-circle-fill',   label: t.nav.newLesson },
    { to: '/register',     icon: 'bi-person-plus-fill',   label: t.nav.addStudent },
  ] : []

  const NavItem = ({ item, onClick }) => {
    const active = isActive(item.to)
    return (
      <Link to={item.to} onClick={onClick} style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '9px 12px', borderRadius: 10, fontSize: 14,
        textDecoration: 'none',
        color: active ? 'var(--accent)' : 'var(--ink)',
        background: active ? 'var(--accent-soft)' : 'transparent',
        fontWeight: active ? 700 : 400,
        transition: 'background .15s',
      }}>
        <i className={`bi ${item.icon}`} style={{ width: 17, textAlign: 'center', fontSize: 15, flexShrink: 0 }} />
        {item.label}
      </Link>
    )
  }

  const SectionLabel = ({ label }) => (
    <div style={{ padding: '10px 12px 3px', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
      {label}
    </div>
  )

  const SidebarContent = ({ inDrawer = false }) => {
    const close = inDrawer ? () => setOpen(false) : undefined
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Шапка */}
        <div style={{ padding: '16px 16px 14px', background: 'var(--accent)', color: 'var(--accent-ink)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Georgia,serif', fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
            🇩🇪 {t.nav.appName}
          </div>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>
                {user.email[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{user.email.split('@')[0]}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{user.role === 'owner' ? t.nav.teacher : t.nav.student}</div>
              </div>
            </div>
          )}
        </div>

        {/* Навигация */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {/* Сегодня — отдельно сверху */}
          <NavItem item={{ to: '/', icon: 'bi-house-door-fill', label: t.nav.today }} onClick={close} />

          {/* Обучение */}
          <SectionLabel label="Обучение" />
          {learningItems.map(item => <NavItem key={item.to} item={item} onClick={close} />)}

          {/* Класс (только для owner) */}
          {classItems.length > 0 && (
            <>
              <SectionLabel label="Класс" />
              {classItems.map(item => <NavItem key={item.to} item={item} onClick={close} />)}
            </>
          )}

          {/* Настройки и справка */}
          <div style={{ height: 1, background: 'var(--line)', margin: '8px 12px' }} />
          <NavItem item={{ to: '/settings', icon: 'bi-gear-fill', label: 'Настройки' }} onClick={close} />
          <NavItem item={{ to: '/wiki', icon: 'bi-question-circle-fill', label: t.nav.wiki }} onClick={close} />
        </div>

        {/* Admin-операции */}
        {adminOps.length > 0 && (
          <div style={{ padding: '8px 12px 6px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Admin</div>
            {adminOps.map(op => {
              const running = adminOp.status === 'running' && adminOp.name === op.name
              const done    = adminOp.status === 'done'    && adminOp.name === op.name
              return (
                <button key={op.name}
                  onClick={() => runOp(op.name, op.endpoint)}
                  disabled={adminOp.status === 'running'}
                  title={op.label}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '5px 8px', borderRadius: 7,
                    border: 'none', background: 'transparent',
                    color: running ? 'var(--accent)' : done ? 'var(--good)' : 'var(--ink-soft)',
                    cursor: adminOp.status === 'running' ? 'default' : 'pointer',
                    fontSize: 12, fontWeight: running ? 700 : 400,
                    opacity: adminOp.status === 'running' && !running ? 0.4 : 1,
                    marginBottom: 1,
                  }}>
                  {running
                    ? `⏳ ${op.label} ${adminOp.total > 0 ? `${adminOp.done}/${adminOp.total}` : '...'}`
                    : done ? `✓ ${op.label}` : op.label}
                </button>
              )
            })}
            {adminOp.status === 'error' && (
              <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>✗ {adminOp.error}</div>
            )}
          </div>
        )}

        {/* Подвал: тема, язык, выход */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          <button onClick={toggleTheme} style={pill}>
            <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill'}`} />
            {' '}{theme === 'dark' ? t.nav.themeLight : t.nav.themeDark}
          </button>
          <AutoSpeakToggle pill />
          <SpeakTranslationToggle />
          <LangSwitcher pill />
          <button onClick={handleLogout} style={{ ...pill, color: '#C0392B', borderColor: '#C0392B22' }}>
            <i className="bi bi-box-arrow-right" /> {t.nav.logout}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', position: 'relative' }}
         dir={isRtl ? 'rtl' : undefined}>

      {/* Флаговая полоска */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 210,
        background: 'linear-gradient(90deg, #111 0 33%, #B3382C 33% 66%, #C9A54A 66% 100%)' }} />

      {/* Постоянный сайдбар (только десктоп ≥1024px, управляется через CSS) */}
      <nav className="layout-sidebar" style={{
        display: 'none', // CSS переопределит на flex для ≥1024px
        position: 'fixed', top: 3, left: 0, bottom: 0, zIndex: 100,
        width: SIDEBAR_W,
        background: 'var(--surface)',
        borderRight: '1px solid var(--line)',
        flexDirection: 'column',
      }}>
        <SidebarContent />
      </nav>

      {/* Топбар (только мобиль/планшет, скрыт на ≥1024px через CSS) */}
      <header className="layout-topbar" style={{
        position: 'fixed', top: 3, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', background: 'var(--bg)',
        borderBottom: '1px solid var(--line)',
        minHeight: 50,
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

      {/* Overlay (мобильный drawer) */}
      <div className="layout-overlay" onClick={() => setOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(0,0,0,0.55)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity .25s ease',
      }} />

      {/* Drawer (мобиль/планшет) */}
      <nav ref={drawerRef} className="layout-drawer" style={{
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 160,
        width: 280, background: 'var(--surface)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
        borderRadius: '0 22px 22px 0', overflow: 'hidden',
      }}>
        <SidebarContent inDrawer />
      </nav>

      {/* Основной контент */}
      <main className="main-content">
        {children}
      </main>

      {/* Нижняя панель — только мобиль ≤640px (управляется через CSS) */}
      <nav className="bottom-nav">
        {[
          { to: '/',           icon: 'bi-house-door-fill',      label: t.nav.today },
          { to: '/vocabulary', icon: 'bi-card-list',            label: t.nav.vocabulary },
          { to: '/reader',     icon: 'bi-book-half',            label: t.nav.reader },
          { to: '/phrasebook', icon: 'bi-chat-quote-fill',      label: 'Разговорник' },
          { to: '/wiki',       icon: 'bi-question-circle-fill', label: t.nav.wiki },
        ].map(item => {
          const active = item.to.includes('?')
            ? location.pathname + location.search === item.to
            : location.pathname === item.to
          return (
            <Link key={item.to} to={item.to} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '8px 2px',
              textDecoration: 'none',
              color: active ? 'var(--accent)' : 'var(--ink-soft)',
              fontSize: 10, fontWeight: active ? 700 : 400,
            }}>
              <i className={`bi ${item.icon}`} style={{ fontSize: 20 }} />
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setOpen(true)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 3, padding: '8px 2px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--ink-soft)', fontSize: 10,
        }}>
          <i className="bi bi-three-dots" style={{ fontSize: 20 }} />
          <span>{t.nav.more}</span>
        </button>
      </nav>
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
