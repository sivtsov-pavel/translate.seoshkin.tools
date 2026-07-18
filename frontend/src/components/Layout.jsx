import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import { ex } from '../utils/extraI18n.js'
import { useThemeStore } from '../store/theme.js'
import { useAdminOpStore } from '../store/adminOp.js'
import { useSettingsStore } from '../store/settings.js'
import { api } from '../api/client.js'
import LangSwitcher from './LangSwitcher.jsx'
import TargetSwitcher from './TargetSwitcher.jsx'
import { AutoSpeakToggle, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'
import { initOffline, isOnline } from '../offline/store.js'

const SIDEBAR_W = 220

export default function Layout({ children }) {
  const { user, logout, refreshUser } = useAuthStore()
  const { t, lang } = useI18nStore()
  const E = ex(lang)
  const { theme, toggle: toggleTheme } = useThemeStore()
  const adminOp = useAdminOpStore()
  const { fetchSettings } = useSettingsStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)
  const [pushMsg, setPushMsg] = useState('')
  const [pushSending, setPushSending] = useState(false)
  const [pushResult, setPushResult] = useState(null)
  const drawerRef = useRef()
  const isRtl = t.dir === 'rtl'

  // Загружаем серверные настройки и обновляем профиль один раз при старте
  useEffect(() => { fetchSettings(); refreshUser() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Офлайн-ядро: предзагрузка словаря/упражнений в IndexedDB + синк очереди ответов
  const [online, setOnline] = useState(isOnline())
  useEffect(() => {
    initOffline()
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  // Класс на <html>: в офлайне контент сдвигается вниз (CSS), чтобы плашка
  // не перекрывала заголовок страницы
  useEffect(() => { document.documentElement.classList.toggle('offline-mode', !online) }, [online])

  // Бейдж непрочитанных сообщений — опрос каждые 30 сек
  useEffect(() => {
    if (!user) return
    const poll = async () => {
      try {
        const data = await api.get('/chat/unread')
        setUnreadChat(data.count || 0)
      } catch {}
    }
    poll()
    const tid = setInterval(poll, 30_000)
    return () => clearInterval(tid)
  }, [user])

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
    { name: 'fetch-images',              icon: 'bi-image-fill',              label: 'Картинки',           hint: 'Скачивает картинки Unsplash для слов без фото',                endpoint: '/admin/fetch-images' },
    { name: 'enrich-words',              icon: 'bi-stars',                   label: 'Словарь++',          hint: 'Добавляет примеры предложений через GPT',                      endpoint: '/admin/enrich-words' },
    { name: 'translate-sentences',       icon: 'bi-translate',               label: 'Фразы → RU',         hint: 'Переводит немецкие предложения на русский язык',               endpoint: '/admin/translate-sentences' },
    { name: 'translate-words-all-langs', icon: 'bi-globe2',                  label: 'Слова → 10 языков',  hint: 'Переводит слова словаря на все 10 языков интерфейса',           endpoint: '/admin/translate-words-all-langs' },
    { name: 'translate-exercises',       icon: 'bi-journal-richtext',        label: 'Упражнения → языки', hint: 'Переводит варианты и подсказки в упражнениях',                 endpoint: '/admin/translate-exercises' },
    { name: 'add-speech-all',            icon: 'bi-soundwave',               label: 'Произношение',       hint: 'Добавляет упражнения на произношение ко всем урокам',          endpoint: '/admin/add-speech-all' },
    { name: 'translate-lesson-titles',   icon: 'bi-card-heading',            label: 'Названия → языки',   hint: 'Переводит названия уроков на все 10 языков',                   endpoint: '/admin/translate-lesson-titles' },
    { name: 'regenerate-all',            icon: 'bi-arrow-counterclockwise',  label: 'Пересоздать всё',    hint: '⚠️ Удаляет прогресс и пересоздаёт упражнения для ВСЕХ уроков', endpoint: '/admin/regenerate-all' },
  ] : []

  // Смена страницы: закрыть шторку И проскроллить вверх — иначе новая страница
  // открывается с прежним скроллом и её шапка (например табы Читалки) «срезана»
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [location.pathname])

  // Измеряем высоту топбара и нижней панели — выставляем CSS-переменные для full-page-layout
  useEffect(() => {
    const measure = () => {
      const topbar = document.querySelector('.layout-topbar')
      const bottomNav = document.querySelector('.bottom-nav')
      const root = document.documentElement
      if (topbar) {
        const b = topbar.getBoundingClientRect().bottom
        if (b > 0) root.style.setProperty('--topbar-h', Math.ceil(b) + 'px')
      }
      if (bottomNav) {
        const h = bottomNav.getBoundingClientRect().height
        if (h > 0) root.style.setProperty('--bottom-nav-h', Math.ceil(h) + 'px')
      }
    }
    // Safari завершает layout позже — измеряем через rAF и повторно через 200ms
    const scheduleMeasure = () => requestAnimationFrame(() => { measure(); setTimeout(measure, 200) })
    scheduleMeasure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', scheduleMeasure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', scheduleMeasure)
    }
  }, [])

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

  // Поделиться приложением (в PWA нет адресной строки). Web Share API → фолбэк на копирование.
  const [shared, setShared] = useState(false)
  const shareApp = async () => {
    const url = window.location.origin
    const data = { title: 'Deutsch Lernen', text: 'Учи немецкий — Deutsch Lernen 🇩🇪', url }
    try {
      if (navigator.share) { await navigator.share(data); return }
    } catch { return } // пользователь отменил шеринг
    try {
      await navigator.clipboard.writeText(url)
      setShared(true); setTimeout(() => setShared(false), 2000)
    } catch {}
  }

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
    { to: '/sets',                        icon: 'bi-collection-fill',           label: t.nav.sets },
    { to: '/vocabulary',                  icon: 'bi-card-list',                 label: t.nav.vocabulary },
    { to: '/ai-trainer',                  icon: 'bi-person-video3',             label: 'AI тренер' },
    { to: '/vocabulary?status=learning',  icon: 'bi-journal-bookmark-fill',     label: t.nav.learningWords },
    { to: '/reader',                      icon: 'bi-eyeglasses',                label: t.nav.reader },
    { to: '/phrasebook',                  icon: 'bi-chat-quote-fill',           label: E.navPhrasebook },
    { to: '/grammar',                     icon: 'bi-mortarboard-fill',          label: E.navGrammar },
    { to: '/love',                        icon: 'bi-heart-fill',                label: E.navLove },
    { to: '/tutors',                      icon: 'bi-geo-alt-fill',              label: E.navTutors },
  ]

  const classItems = user?.role === 'owner' ? [
    { to: '/school',       icon: 'bi-building-fill',    label: t.nav.school },
    { to: '/catalog',      icon: 'bi-book-fill',        label: t.nav.catalog },
    { to: '/courses',      icon: 'bi-mortarboard-fill', label: t.nav.courses },
    { to: '/students',     icon: 'bi-people-fill',      label: t.nav.students },
    { to: '/translations', icon: 'bi-globe2',           label: t.nav.translations },
    { to: '/report',       icon: 'bi-bar-chart-fill',   label: t.nav.report },
  ] : [
    { to: '/join',         icon: 'bi-building-fill',         label: t.nav.myClass },
    { to: '/courses',      icon: 'bi-mortarboard-fill',      label: t.nav.courses },
    { to: '/my-words',     icon: 'bi-journal-bookmark-fill', label: t.nav.myWords },
  ]

  const adminLinks = user?.role === 'owner' ? [
    { to: '/lessons/new', icon: 'bi-plus-circle-fill', label: t.nav.newLesson  || 'Новый урок' },
    { to: '/register',    icon: 'bi-person-plus-fill', label: t.nav.addStudent || 'Новый ученик' },
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
          <div style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>
              🇩🇪 {t.nav.appName}
              {/* Метка сборки: видно, обновилось ли приложение (кэш SW липкий) */}
              <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>{typeof __BUILD_TS__ !== 'undefined' ? __BUILD_TS__ : ''}</span>
            </span>
            {inDrawer && (
              <button onClick={() => setOpen(false)} style={{
                background: 'rgba(0,0,0,0.18)', border: 'none', borderRadius: 10, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--accent-ink)', fontSize: 18, flexShrink: 0,
              }}>✕</button>
            )}
          </div>
          {user && (
            <Link to="/profile" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              {/* Аватар — эмодзи или первая буква */}
              {(() => {
                const av = user.avatar || ''
                const isEmoji = /\p{Emoji}/u.test(av)
                const displayName = user.full_name || user.email.split('@')[0]
                return (
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: av ? 'var(--surface-2)' : 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isEmoji ? 20 : 14, fontWeight: 700,
                    color: av ? 'inherit' : 'var(--accent-ink)',
                    border: '1px solid var(--line)',
                  }}>
                    {av || displayName[0]?.toUpperCase()}
                  </div>
                )
              })()}
              <div>
                <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {user.role === 'owner' ? t.nav.teacher : t.nav.student}
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 1 }}>
                  {user.full_name || user.email.split('@')[0]}
                </div>
              </div>
            </Link>
          )}
          {/* Переключатель изучаемого языка (мульти-таргет) */}
          <div style={{ marginTop: 10 }}><TargetSwitcher /></div>
        </div>

        {/* Прокручиваемая область: навигация + admin + подвал. Шапка зафиксирована,
            всё остальное скроллится одним блоком — футер с языками всегда достаётся */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Навигация */}
        <div style={{ flexShrink: 0, padding: '8px' }}>
          {/* Сегодня — отдельно сверху */}
          <NavItem item={{ to: '/', icon: 'bi-house-door-fill', label: t.nav.today }} onClick={close} />

          {/* Обучение */}
          <SectionLabel label="Обучение" />
          {learningItems.map(item => <NavItem key={item.to} item={item} onClick={close} />)}

          {/* Класс: учителю — школа/курсы/ученики; ученику — вход в класс по коду */}
          {classItems.length > 0 && (
            <>
              <SectionLabel label="Класс" />
              {classItems.map(item => <NavItem key={item.to} item={item} onClick={close} />)}
            </>
          )}

          {/* Платформа — только супер-админ (id=1) */}
          {user?.id === 1 && (
            <>
              <SectionLabel label="Платформа" />
              <NavItem item={{ to: '/admin', icon: 'bi-shield-lock-fill', label: 'Супер-админ' }} onClick={close} />
            </>
          )}

          {/* Настройки, чат и справка */}
          <div style={{ height: 1, background: 'var(--line)', margin: '8px 12px' }} />
          {/* Чат с бейджем */}
          <Link to="/chat" onClick={close} style={{
            display: 'flex', alignItems: 'center', gap: 11,
            padding: '9px 12px', borderRadius: 10, fontSize: 14,
            textDecoration: 'none',
            color: isActive('/chat') ? 'var(--accent)' : 'var(--ink)',
            background: isActive('/chat') ? 'var(--accent-soft)' : 'transparent',
            fontWeight: isActive('/chat') ? 700 : 400,
            transition: 'background .15s',
            justifyContent: 'space-between',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'inherit' }}>
              <i className="bi bi-chat-dots-fill" style={{ width: 17, textAlign: 'center', fontSize: 15, flexShrink: 0 }} />
              {E.navChat}
            </span>
            {unreadChat > 0 && (
              <span style={{
                background: 'var(--red)', color: '#fff', borderRadius: '50%',
                width: 20, height: 20, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{unreadChat > 9 ? '9+' : unreadChat}</span>
            )}
          </Link>
          <NavItem item={{ to: '/settings', icon: 'bi-gear-fill', label: E.navSettings }} onClick={close} />
          {user && user.plan !== 'premium' && (
            <NavItem item={{ to: '/upgrade', icon: 'bi-star-fill', label: '⭐ Premium' }} onClick={close} />
          )}
          <NavItem item={{ to: '/wiki', icon: 'bi-question-circle-fill', label: t.nav.wiki }} onClick={close} />
        </div>

        {/* Admin-операции — сворачиваемый блок */}
        {(adminOps.length > 0 || adminLinks.length > 0) && (
          <div style={{ borderTop: '1px solid var(--line)', flexShrink: 0 }}>
            <button
              onClick={() => setAdminExpanded(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '7px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
              }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Admin{adminOp.status === 'running' ? ' ⏳' : adminOp.status === 'done' ? ' ✓' : ''}
              </span>
              <i className={`bi ${adminExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: 11, color: 'var(--ink-soft)' }} />
            </button>
            {adminExpanded && (
              <div style={{ padding: '2px 8px 8px' }}>
                {/* Ссылки — Новый урок / Новый ученик */}
                {adminLinks.length > 0 && (
                  <div style={{ marginBottom: 2, paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
                    {adminLinks.map(link => (
                      <Link key={link.to} to={link.to} onClick={close}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 10px', borderRadius: 9,
                          textDecoration: 'none', color: 'var(--accent)',
                          fontWeight: 600, fontSize: 13, marginBottom: 1,
                          transition: 'background .15s',
                        }}>
                        <i className={`bi ${link.icon}`} style={{ width: 17, textAlign: 'center', fontSize: 14, flexShrink: 0 }} />
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
                {/* Операции */}
                {adminOps.map(op => {
                  const running = adminOp.status === 'running' && adminOp.name === op.name
                  const done    = adminOp.status === 'done'    && adminOp.name === op.name
                  return (
                    <button key={op.name}
                      onClick={() => runOp(op.name, op.endpoint)}
                      disabled={adminOp.status === 'running'}
                      title={op.hint}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', textAlign: 'left',
                        padding: '7px 10px', borderRadius: 9,
                        border: 'none',
                        background: running ? 'var(--accent-soft)' : done ? 'var(--good-soft, rgba(34,197,94,.12))' : 'transparent',
                        color: running ? 'var(--accent)' : done ? 'var(--good)' : 'var(--ink-soft)',
                        cursor: adminOp.status === 'running' && !running ? 'default' : 'pointer',
                        fontSize: 13, fontWeight: running ? 700 : 400,
                        opacity: adminOp.status === 'running' && !running ? 0.35 : 1,
                        marginBottom: 1, transition: 'background .15s',
                      }}>
                      <i className={`bi ${running ? 'bi-hourglass-split' : done ? 'bi-check2-circle' : op.icon}`}
                         style={{ width: 17, textAlign: 'center', fontSize: 14, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, lineHeight: 1.2 }}>
                        {running && adminOp.total > 0 ? `${op.label} ${adminOp.done}/${adminOp.total}` : op.label}
                      </span>
                    </button>
                  )
                })}
                {adminOp.status === 'error' && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
                    {adminOp.error}
                  </div>
                )}
                {/* Отправить push всем ученикам */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, padding: '0 2px' }}>
                    Push ученикам
                  </div>
                  <textarea
                    value={pushMsg}
                    onChange={e => { setPushMsg(e.target.value); setPushResult(null) }}
                    placeholder="Сообщение..."
                    rows={2}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '6px 8px', borderRadius: 8, fontSize: 12,
                      border: '1px solid var(--line)', background: 'var(--surface)',
                      color: 'var(--ink)', resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={async () => {
                      if (!pushMsg.trim()) return
                      setPushSending(true)
                      setPushResult(null)
                      try {
                        const res = await api.post('/push/send', { body: pushMsg.trim() })
                        setPushResult(`✓ Отправлено ${res.sent ?? 1} уч.`)
                        setPushMsg('')
                      } catch (e) {
                        setPushResult('Ошибка: ' + e.message)
                      } finally {
                        setPushSending(false)
                      }
                    }}
                    disabled={pushSending || !pushMsg.trim()}
                    style={{
                      marginTop: 4, width: '100%',
                      padding: '6px', borderRadius: 8,
                      border: 'none', fontSize: 12, fontWeight: 600,
                      background: 'var(--accent)', color: 'var(--accent-ink)',
                      cursor: pushSending || !pushMsg.trim() ? 'default' : 'pointer',
                      opacity: pushSending || !pushMsg.trim() ? 0.5 : 1,
                    }}
                  >
                    <i className="bi bi-bell-fill" /> {pushSending ? 'Отправка…' : 'Отправить всем'}
                  </button>
                  {pushResult && (
                    <div style={{ fontSize: 11, color: pushResult.startsWith('✓') ? 'var(--good)' : 'var(--red)', marginTop: 4, textAlign: 'center' }}>
                      {pushResult}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        </div>{/* конец прокручиваемой области */}

        {/* Подвал: тема, язык, выход — зафиксирован снизу, всегда виден (языки под рукой) */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          <button onClick={toggleTheme} style={pill}>
            <i className={`bi ${theme === 'dark' ? 'bi-sun-fill' : 'bi-moon-fill'}`} />
            {' '}{theme === 'dark' ? t.nav.themeLight : t.nav.themeDark}
          </button>
          <button onClick={shareApp} style={pill} title="Поделиться приложением">
            <i className="bi bi-share-fill" /> {shared ? 'Ссылка скопирована' : 'Поделиться'}
          </button>
          <AutoSpeakToggle pill />
          <SpeakTranslationToggle />
          <LangSwitcher pill dropUp />
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
        {SidebarContent({})}
      </nav>

      {/* Топбар (только мобиль/планшет, скрыт на ≥1024px через CSS) */}
      <header className="layout-topbar" style={{
        position: 'fixed', top: 3, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', background: 'var(--bg)',
        borderBottom: '1px solid var(--line)',
        minHeight: 50,
      }}>
        <button onClick={() => setOpen(v => !v)} className="layout-hamburger" style={iconBtn} aria-label="Меню">
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <rect width="18" height="2" rx="1" fill="currentColor"/>
            <rect y="6" width="12" height="2" rx="1" fill="currentColor"/>
            <rect y="12" width="18" height="2" rx="1" fill="currentColor"/>
          </svg>
        </button>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--ink)', fontFamily: 'var(--heading-font, Georgia, serif)', fontWeight: 700, fontSize: 18 }}>
          🇩🇪 {t.nav.appName}
        </Link>
        {location.pathname !== '/' ? (
          <button onClick={() => navigate(-1)} style={{
            ...iconBtn, fontSize: 13, fontWeight: 700, color: 'var(--accent)',
            padding: '0 10px', width: 'auto', gap: 4,
          }}>
            ← Назад
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
      </header>

      {/* Офлайн-плашка: аккуратно ВВЕРХУ, сразу под топбаром-хедером */}
      {!online && (
        <div style={{
          position: 'fixed', top: 'calc(var(--topbar-h, 56px) - 10px)', left: 0, right: 0, zIndex: 90,
          background: '#8a6d1a', color: '#fff', textAlign: 'center',
          padding: '5px 12px', fontSize: 12, fontWeight: 600,
        }}>
          📴 {t.offlineMode?.badge || 'Офлайн — словарь и упражнения работают, прогресс отправится при появлении сети'}
        </div>
      )}

      {/* Затемнение-фон под шторкой — тап закрывает меню (скрыт на ≥1024px через CSS) */}
      {open && (
        <div className="layout-overlay" onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 215, background: 'rgba(0,0,0,0.45)',
        }} />
      )}

      {/* Боковая шторка-меню (мобиль/планшет) — скрыта на ≥1024px через CSS.
          z-index выше нижней панели (200), иначе футер с «Выход» перекрыт ею */}
      <nav ref={drawerRef} className="layout-drawer" style={{
        position: 'fixed', top: 3, left: 0, bottom: 0, zIndex: 220,
        width: 'min(320px, 86vw)',
        background: 'var(--surface)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: open ? '2px 0 24px rgba(0,0,0,0.28)' : 'none',
      }}>
        {SidebarContent({ inDrawer: true })}
      </nav>

      {/* Узкая иконочная полоса — только планшет 641-1023px (CSS управляет видимостью) */}
      <nav className="layout-narrow-strip" style={{
        display: 'none',
        flexDirection: 'column', alignItems: 'center',
        position: 'fixed', top: 3, left: 0, bottom: 0, zIndex: 100,
        width: 60, background: 'var(--surface)', borderRight: '1px solid var(--line)',
        paddingTop: 10, gap: 4, overflowY: 'auto',
      }}>
        {/* Логотип */}
        <Link to="/" title={t.nav.today} style={{ fontSize: 22, textDecoration: 'none', marginBottom: 4, lineHeight: 1 }}>🇩🇪</Link>
        <div style={{ width: 32, height: 1, background: 'var(--line)', marginBottom: 2 }} />

        {/* Основные пункты */}
        {[
          { to: '/',           icon: 'bi-house-door-fill',      label: t.nav.today },
          { to: '/lessons',    icon: 'bi-book-fill',            label: t.nav.lessons },
          { to: '/vocabulary', icon: 'bi-card-list',            label: t.nav.vocabulary },
          { to: '/reader',     icon: 'bi-eyeglasses',           label: t.nav.reader },
          { to: '/phrasebook', icon: 'bi-chat-quote-fill',      label: E.navPhrasebook },
          { to: '/grammar',    icon: 'bi-mortarboard-fill',     label: E.navGrammar },
          { to: '/wiki',       icon: 'bi-question-circle-fill', label: t.nav.wiki },
        ].map(item => {
          const active = isActive(item.to)
          return (
            <Link key={item.to} to={item.to} title={item.label} style={{
              width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, textDecoration: 'none',
              color: active ? 'var(--accent)' : 'var(--ink-soft)',
              background: active ? 'var(--accent-soft)' : 'transparent',
              transition: 'all .15s',
            }}>
              <i className={`bi ${item.icon}`} />
            </Link>
          )
        })}

        {/* Чат с бейджем */}
        <Link to="/chat" title={E.navChat} style={{
          width: 44, height: 44, borderRadius: 12, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, textDecoration: 'none',
          color: isActive('/chat') ? 'var(--accent)' : 'var(--ink-soft)',
          background: isActive('/chat') ? 'var(--accent-soft)' : 'transparent',
          transition: 'all .15s',
        }}>
          <i className="bi bi-chat-dots-fill" />
          {unreadChat > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              background: 'var(--red)', color: '#fff', borderRadius: 10,
              padding: '0 4px', fontSize: 9, fontWeight: 700, minWidth: 14, textAlign: 'center',
            }}>{unreadChat > 9 ? '9+' : unreadChat}</span>
          )}
        </Link>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Настройки */}
        <Link to="/settings" title="Настройки" style={{
          width: 44, height: 44, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, textDecoration: 'none',
          color: isActive('/settings') ? 'var(--accent)' : 'var(--ink-soft)',
          background: isActive('/settings') ? 'var(--accent-soft)' : 'transparent',
          transition: 'all .15s',
        }}>
          <i className="bi bi-gear-fill" />
        </Link>

        {/* Кнопка «Ещё» — открывает полное меню */}
        <button onClick={() => setOpen(v => !v)} title="Меню" style={{
          width: 44, height: 44, borderRadius: 12, marginBottom: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, border: 'none', background: 'transparent',
          cursor: 'pointer', color: 'var(--ink-soft)',
        }}>
          <i className="bi bi-three-dots-vertical" />
        </button>
      </nav>

      {/* Десктопный мини-хедер — кнопка «Назад» (только ≥1024px, CSS управляет видимостью) */}
      <header className="layout-desktop-topbar">
        {location.pathname !== '/' ? (
          <button onClick={() => navigate(-1)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent)', fontWeight: 700, fontSize: 14,
            padding: '6px 10px', borderRadius: 8,
          }}>
            ← Назад
          </button>
        ) : (
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
            🇩🇪 Deutsch lernen
          </span>
        )}
      </header>

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
          { to: '/phrasebook', icon: 'bi-chat-quote-fill',      label: E.navPhrasebook },
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
              position: 'relative',
            }}>
              <i className={`bi ${item.icon}`} style={{ fontSize: 20 }} />
              {item.badge > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: '50%', transform: 'translateX(10px)',
                  background: 'var(--red)', color: '#fff', borderRadius: 10,
                  minWidth: 16, height: 16, fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>{item.badge > 9 ? '9+' : item.badge}</span>
              )}
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setOpen(v => !v)} style={{
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
