import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, BookText, Backpack, BookOpen, Bot, Glasses, Library, MessageCircle,
  GraduationCap, Heart, MapPin, Building2, BookCopy, Users, Globe, BarChart3,
  NotebookPen, PlusCircle, UserPlus, MessagesSquare, Settings, Star, HelpCircle,
  ShieldCheck, Sun, Moon, Share2, LogOut, Link2, Image as ImageIcon, Sparkles,
  Languages, FileText, AudioLines, Heading, RotateCcw, Bell, Hourglass,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Menu, MoreVertical, X,
  ArrowLeft, Compass,
} from 'lucide-react'
import Tour from './Tour.jsx'
import CourseGate from './CourseGate.jsx'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'
import { ex } from '../utils/extraI18n.js'
import { useThemeStore } from '../store/theme.js'
import { useAdminOpStore } from '../store/adminOp.js'
import { useSettingsStore } from '../store/settings.js'
import ProcessingBadge from './ProcessingBadge.jsx'
import { api } from '../api/client.js'
import LangSwitcher from './LangSwitcher.jsx'
import TargetSwitcher from './TargetSwitcher.jsx'
import { AutoSpeakToggle, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'
import { initOffline, isOnline } from '../offline/store.js'
import { useKeyboardInset } from '../hooks/useKeyboardInset.js'

const SIDEBAR_W = 220

// Флаг + название активного изучаемого языка (для верхней панели)
const TARGET_META = {
  de: { flag: '🇩🇪', name: 'Немецкий',    stripe: ['#1a1a1a', '#dd0000', '#ffce00'] },
  es: { flag: '🇪🇸', name: 'Испанский',   stripe: ['#AA151B', '#F1BF00', '#AA151B'] },
  fr: { flag: '🇫🇷', name: 'Французский', stripe: ['#0055A4', '#ffffff', '#EF4135'] },
  it: { flag: '🇮🇹', name: 'Итальянский', stripe: ['#008C45', '#ffffff', '#CD212A'] },
  en: { flag: '🇬🇧', name: 'Английский',  stripe: ['#012169', '#ffffff', '#C8102E'] },
  pt: { flag: '🇵🇹', name: 'Португальский', stripe: ['#006600', '#ffffff', '#FF0000'] },
}
function targetMeta() { return TARGET_META[localStorage.getItem('target_lang') || 'de'] || TARGET_META.de }

// Иконка навигации (lucide) — рендерится размером 18 по умолчанию
const NIcon = ({ C, size = 18 }) => C ? <C size={size} strokeWidth={1.8} style={{ flexShrink: 0 }} /> : null

export default function Layout({ children }) {
  useKeyboardInset()
  const { user, logout, refreshUser, impersonating, stopImpersonate } = useAuthStore()
  const returnToAdmin = () => { stopImpersonate(); window.location.href = '/admin' }
  const tgt = targetMeta()
  const { t, lang } = useI18nStore()
  const E = ex(lang)
  // Название изучаемого языка НА ЯЗЫКЕ ИНТЕРФЕЙСА (Intl), а не хардкод «Немецкий»
  const tgtCode = (typeof localStorage !== 'undefined' && localStorage.getItem('target_lang')) || 'de'
  let tgtName = tgt.name
  try { const n = new Intl.DisplayNames([lang || 'ru'], { type: 'language' }).of(tgtCode); if (n) tgtName = n.charAt(0).toUpperCase() + n.slice(1) } catch { /* фолбэк */ }
  const { theme, toggle: toggleTheme } = useThemeStore()
  const adminOp = useAdminOpStore()
  const { fetchSettings } = useSettingsStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [tourRun, setTourRun] = useState(false)   // онбординг-тур (кнопка + авто при первом входе)
  const [gateLangs, setGateLangs] = useState(null) // доступные языки изучения (для гейта)
  const [gateOpen, setGateOpen] = useState(false)  // окно выбора языка (первый вход / «Сменить курс»)
  const [unreadChat, setUnreadChat] = useState(0)
  const [pushMsg, setPushMsg] = useState('')
  const [pushSending, setPushSending] = useState(false)
  const [pushResult, setPushResult] = useState(null)
  const drawerRef = useRef()
  const isRtl = t.dir === 'rtl'
  const [menuCfg, setMenuCfg] = useState({ hidden: [], custom: [] })

  useEffect(() => {
    fetchSettings(); refreshUser()
    api.get('/platform/public-config').then(c => { if (c?.menu) setMenuCfg({ hidden: c.menu.hidden || [], custom: c.menu.custom || [] }) }).catch(() => {})
    // Доступные языки изучения + окно выбора при ПЕРВОМ входе (язык не выбран осознанно)
    api.get('/courses/languages').then(langs => {
      const list = Array.isArray(langs) ? langs : []
      setGateLangs(list)
      if (!localStorage.getItem('lang_chosen')) {
        if (list.length >= 2) setGateOpen(true)
        else if (list.length === 1) { localStorage.setItem('target_lang', list[0]); localStorage.setItem('lang_chosen', '1') }
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [online, setOnline] = useState(isOnline())
  useEffect(() => {
    initOffline()
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  useEffect(() => { document.documentElement.classList.toggle('offline-mode', !online) }, [online])

  useEffect(() => {
    if (!user) return
    const poll = async () => {
      try {
        const data = await api.get('/chat/unread')
        const n = data.count || 0
        setUnreadChat(n)
        // Красный кружок с числом на иконке приложения (как у мессенджеров) — Badging API.
        // Работает в установленной PWA/TWA (Android, десктоп Chrome/Edge, iOS 16.4+).
        if ('setAppBadge' in navigator) {
          if (n > 0) navigator.setAppBadge(n).catch(() => {})
          else navigator.clearAppBadge?.().catch(() => {})
        }
      } catch {}
    }
    poll()
    const tid = setInterval(poll, 30_000)
    return () => clearInterval(tid)
  }, [user])

  useEffect(() => {
    if (user?.role !== 'owner') return
    let tid
    const sync = async () => { try { const s = await api.get('/admin/operation-status'); adminOp.sync(s) } catch {} }
    sync()
    tid = setInterval(sync, 2000)
    return () => clearInterval(tid)
  }, [user?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  const runOp = async (name, endpoint) => {
    adminOp.start(name)
    try { const res = await api.post(endpoint, {}); if (!res?.started) adminOp.finish(res) }
    catch (e) { adminOp.fail(e.message) }
  }

  const adminOps = user?.role === 'owner' ? [
    { name: 'fetch-images',              C: ImageIcon,  label: 'Картинки',           hint: 'Скачивает картинки Unsplash для слов без фото',                endpoint: '/admin/fetch-images' },
    { name: 'enrich-words',              C: Sparkles,   label: 'Словарь++',          hint: 'Добавляет примеры предложений через GPT',                      endpoint: '/admin/enrich-words' },
    { name: 'translate-sentences',       C: Languages,  label: 'Фразы → RU',         hint: 'Переводит немецкие предложения на русский язык',               endpoint: '/admin/translate-sentences' },
    { name: 'translate-words-all-langs', C: Globe,      label: 'Слова → 10 языков',  hint: 'Переводит слова словаря на все 10 языков интерфейса',           endpoint: '/admin/translate-words-all-langs' },
    { name: 'translate-exercises',       C: FileText,   label: 'Упражнения → языки', hint: 'Переводит варианты и подсказки в упражнениях',                 endpoint: '/admin/translate-exercises' },
    { name: 'add-speech-all',            C: AudioLines, label: 'Произношение',       hint: 'Добавляет упражнения на произношение ко всем урокам',          endpoint: '/admin/add-speech-all' },
    { name: 'translate-lesson-titles',   C: Heading,    label: 'Названия → языки',   hint: 'Переводит названия уроков на все 10 языков',                   endpoint: '/admin/translate-lesson-titles' },
    { name: 'regenerate-all',            C: RotateCcw,  label: 'Пересоздать всё',    hint: '⚠️ Удаляет прогресс и пересоздаёт упражнения для ВСЕХ уроков', endpoint: '/admin/regenerate-all' },
  ] : []

  useEffect(() => { setOpen(false); setProfileOpen(false); window.scrollTo(0, 0) }, [location.pathname])

  // Тур: авто-запуск ОДИН раз при первом входе (только на главной), дальше — по кнопке 🧭
  useEffect(() => {
    // Тур: первый вход (нет tour_seen_v1) ИЛИ сразу после выбора языка в гейте (run_tour_after).
    // Не запускаем, пока открыто окно выбора языка.
    if (user && location.pathname === '/' && !gateOpen && (!localStorage.getItem('tour_seen_v1') || localStorage.getItem('run_tour_after'))) {
      localStorage.removeItem('run_tour_after')
      const tid = setTimeout(() => setTourRun(true), 800)
      return () => clearTimeout(tid)
    }
  }, [user, location.pathname, gateOpen])
  const startTour = () => { if (location.pathname !== '/') navigate('/'); setTimeout(() => setTourRun(true), location.pathname !== '/' ? 400 : 0) }
  const endTour = () => { setTourRun(false); setOpen(false); localStorage.setItem('tour_seen_v1', '1') }

  useEffect(() => {
    const measure = () => {
      const topbar = document.querySelector('.layout-topbar')
      const bottomNav = document.querySelector('.bottom-nav')
      const root = document.documentElement
      if (topbar) { const b = topbar.getBoundingClientRect().bottom; if (b > 0) root.style.setProperty('--topbar-h', Math.ceil(b) + 'px') }
      if (bottomNav) { const h = bottomNav.getBoundingClientRect().height; if (h > 0) root.style.setProperty('--bottom-nav-h', Math.ceil(h) + 'px') }
    }
    const scheduleMeasure = () => requestAnimationFrame(() => { measure(); setTimeout(measure, 200) })
    scheduleMeasure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', scheduleMeasure)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', scheduleMeasure) }
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

  const [shared, setShared] = useState(false)
  const shareApp = async () => {
    const url = window.location.origin
    const data = { title: 'Deutsch Lernen', text: 'Учи немецкий — Deutsch Lernen 🇩🇪', url }
    try { if (navigator.share) { await navigator.share(data); return } } catch { return }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000) } catch {}
  }

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/'
    if (to.includes('?')) { const [path, qs] = to.split('?'); return location.pathname.startsWith(path) && location.search.includes(qs) }
    return location.pathname.startsWith(to) && !location.search.includes('status=learning')
  }

  // Пункты навигации (иконки — lucide-компоненты)
  const learningItems = [
    ...(user?.role === 'owner' ? [{ to: '/lessons', C: BookText, label: t.nav.lessons }] : []),
    { to: '/sets',       C: Backpack,       label: t.nav.sets },
    { to: '/vocabulary', C: BookOpen,       label: t.nav.vocabulary },
    { to: '/ai-trainer', C: Bot,            label: 'AI тренер' },
    { to: '/reader',     C: Glasses,        label: t.nav.reader },
    { to: '/books',      C: Library,        label: 'Книги' },
    { to: '/phrasebook', C: MessageCircle,  label: E.navPhrasebook },
    { to: '/grammar',    C: GraduationCap,  label: E.navGrammar },
    { to: '/love',       C: Heart,          label: E.navLove },
    { to: '/tutors',     C: MapPin,         label: E.navTutors },
  ]
  const classItems = user?.role === 'owner' ? [
    { to: '/school',       C: Building2,     label: t.nav.school },
    { to: '/catalog',      C: BookCopy,      label: t.nav.catalog },
    { to: '/courses',      C: GraduationCap, label: t.nav.courses },
    { to: '/students',     C: Users,         label: t.nav.students },
    { to: '/translations', C: Globe,         label: t.nav.translations },
    { to: '/report',       C: BarChart3,     label: t.nav.report },
  ] : [
    { to: '/join',     C: Building2,   label: t.nav.myClass },
    { to: '/courses',  C: GraduationCap, label: t.nav.courses },
    { to: '/my-words', C: NotebookPen, label: t.nav.myWords },
  ]
  const adminLinks = user?.role === 'owner' ? [
    { to: '/lessons/new', C: PlusCircle, label: t.nav.newLesson  || 'Новый урок' },
    { to: '/register',    C: UserPlus,   label: t.nav.addStudent || 'Новый ученик' },
  ] : []

  const hiddenSet = new Set(menuCfg.hidden || [])
  const customFor = (section) => (menuCfg.custom || [])
    .filter(c => c && c.url && c.label && (c.section || 'learning') === section && (!c.roles || c.roles === 'all' || c.roles === user?.role))
    .map(c => ({ to: c.url, C: Link2, label: c.label, external: /^https?:\/\//i.test(c.url) }))
  const withCfg = (items, section) => [...items.filter(it => !hiddenSet.has(it.to)), ...customFor(section)]
  const navLearning = withCfg(learningItems, 'learning')
  const navClass    = withCfg(classItems, 'class')

  const NavItem = ({ item, onClick }) => {
    const active = !item.external && isActive(item.to)
    const style = {
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px', borderRadius: 11, fontSize: 14, textDecoration: 'none',
      color: active ? 'var(--blue)' : 'var(--ink)',
      background: active ? 'rgba(62,127,193,0.10)' : 'transparent',
      fontWeight: active ? 700 : 500, transition: 'background .15s',
    }
    const inner = <><span style={{ color: active ? 'var(--blue)' : 'var(--ink-soft)', display: 'flex' }}><NIcon C={item.C} /></span>{item.label}</>
    return item.external
      ? <a href={item.to} target="_blank" rel="noreferrer" onClick={onClick} style={style}>{inner}</a>
      : <Link to={item.to} onClick={onClick} style={style}>{inner}</Link>
  }

  const SectionLabel = ({ label }) => (
    <div className="sidebar-section" style={{ padding: '12px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</div>
  )

  const displayName = user ? (user.full_name || user.email.split('@')[0]) : ''
  const avatarChar = user ? ((user.avatar && /\p{Emoji}/u.test(user.avatar)) ? user.avatar : (displayName[0] || 'U').toUpperCase()) : 'U'

  const SidebarContent = ({ inDrawer = false }) => {
    const close = inDrawer ? () => setOpen(false) : undefined
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--surface)' }}>
        {/* Шапка меню — чистая, как в макете */}
        <div style={{ padding: '16px 16px 14px', flexShrink: 0, borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: 'var(--heading-font)', fontWeight: 700, fontSize: 17, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>{tgt.flag}</span> {tgtName}
              <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.5, marginLeft: 2 }}>{typeof __BUILD_TS__ !== 'undefined' ? __BUILD_TS__ : ''}</span>
            </span>
            {inDrawer && (
              <button onClick={() => setOpen(false)} style={{ background: 'var(--surface-2)', border: 'none', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-soft)', flexShrink: 0 }}><X size={18} /></button>
            )}
          </div>
          {user && (
            <Link to="/settings?tab=profile" onClick={close} style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'var(--gold)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: /\p{Emoji}/u.test(avatarChar) ? 20 : 15, fontWeight: 700 }}>{avatarChar}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{displayName}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{user.role === 'owner' ? t.nav.teacher : t.nav.student}</div>
              </div>
            </Link>
          )}
          <div style={{ marginTop: 12 }}><TargetSwitcher /></div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flexShrink: 0, padding: '8px' }}>
            <NavItem item={{ to: '/', C: Home, label: t.nav.today }} onClick={close} />
            <SectionLabel label="Обучение" />
            {navLearning.map(item => <NavItem key={item.to} item={item} onClick={close} />)}
            {navClass.length > 0 && (<><SectionLabel label="Класс" />{navClass.map(item => <NavItem key={item.to} item={item} onClick={close} />)}</>)}
            {user?.id === 1 && (<><SectionLabel label="Платформа" /><NavItem item={{ to: '/admin', C: ShieldCheck, label: 'Супер-админ' }} onClick={close} /></>)}

            <div style={{ height: 1, background: 'var(--line)', margin: '8px 12px' }} />
            <Link to="/chat" onClick={close} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 11, fontSize: 14, textDecoration: 'none', color: isActive('/chat') ? 'var(--blue)' : 'var(--ink)', background: isActive('/chat') ? 'rgba(62,127,193,0.10)' : 'transparent', fontWeight: isActive('/chat') ? 700 : 500, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'inherit' }}><span style={{ color: isActive('/chat') ? 'var(--blue)' : 'var(--ink-soft)', display: 'flex' }}><MessagesSquare size={18} strokeWidth={1.8} /></span>{E.navChat}</span>
              {unreadChat > 0 && <span style={{ background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{unreadChat > 9 ? '9+' : unreadChat}</span>}
            </Link>
            <NavItem item={{ to: '/settings', C: Settings, label: E.navSettings }} onClick={close} />
            {user && user.plan !== 'premium' && <NavItem item={{ to: '/upgrade', C: Star, label: 'Premium' }} onClick={close} />}
            <NavItem item={{ to: '/wiki', C: HelpCircle, label: t.nav.wiki }} onClick={close} />
          </div>

          {(adminOps.length > 0 || adminLinks.length > 0) && (
            <div style={{ borderTop: '1px solid var(--line)', flexShrink: 0 }}>
              <button onClick={() => setAdminExpanded(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Admin{adminOp.status === 'running' ? ' ⏳' : adminOp.status === 'done' ? ' ✓' : ''}</span>
                {adminExpanded ? <ChevronUp size={13} color="var(--ink-soft)" /> : <ChevronDown size={13} color="var(--ink-soft)" />}
              </button>
              {adminExpanded && (
                <div style={{ padding: '2px 8px 8px' }}>
                  {adminLinks.length > 0 && (
                    <div style={{ marginBottom: 2, paddingBottom: 6, borderBottom: '1px solid var(--line)' }}>
                      {adminLinks.map(link => (
                        <Link key={link.to} to={link.to} onClick={close} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, textDecoration: 'none', color: 'var(--blue)', fontWeight: 600, fontSize: 13 }}>
                          <NIcon C={link.C} size={16} />{link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {adminOps.map(op => {
                    const running = adminOp.status === 'running' && adminOp.name === op.name
                    const done = adminOp.status === 'done' && adminOp.name === op.name
                    return (
                      <button key={op.name} onClick={() => runOp(op.name, op.endpoint)} disabled={adminOp.status === 'running'} title={op.hint}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 9, border: 'none',
                          background: running ? 'rgba(62,127,193,0.10)' : done ? 'rgba(46,125,70,0.12)' : 'transparent',
                          color: running ? 'var(--blue)' : done ? 'var(--good)' : 'var(--ink-soft)',
                          cursor: adminOp.status === 'running' && !running ? 'default' : 'pointer', fontSize: 12, fontWeight: running ? 700 : 500,
                          opacity: adminOp.status === 'running' && !running ? 0.35 : 1, marginBottom: 1 }}>
                        {running ? <Hourglass size={15} /> : done ? <CheckCircle2 size={15} /> : <NIcon C={op.C} size={15} />}
                        <span style={{ flex: 1, lineHeight: 1.2 }}>{running && adminOp.total > 0 ? `${op.label} ${adminOp.done}/${adminOp.total}` : op.label}</span>
                      </button>
                    )
                  })}
                  {adminOp.status === 'error' && (
                    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={13} />{adminOp.error}</div>
                  )}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, padding: '0 2px' }}>Push ученикам</div>
                    <textarea value={pushMsg} onChange={e => { setPushMsg(e.target.value); setPushResult(null) }} placeholder="Сообщение..." rows={2}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, fontSize: 12, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', resize: 'vertical', fontFamily: 'inherit' }} />
                    <button onClick={async () => {
                        if (!pushMsg.trim()) return
                        setPushSending(true); setPushResult(null)
                        try { const res = await api.post('/push/send', { body: pushMsg.trim() }); setPushResult(`✓ Отправлено ${res.sent ?? 1} уч.`); setPushMsg('') }
                        catch (e) { setPushResult('Ошибка: ' + e.message) } finally { setPushSending(false) }
                      }} disabled={pushSending || !pushMsg.trim()}
                      style={{ marginTop: 4, width: '100%', padding: '7px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--blue)', color: '#fff', cursor: pushSending || !pushMsg.trim() ? 'default' : 'pointer', opacity: pushSending || !pushMsg.trim() ? 0.5 : 1 }}>
                      <Bell size={14} /> {pushSending ? 'Отправка…' : 'Отправить всем'}
                    </button>
                    {pushResult && <div style={{ fontSize: 11, color: pushResult.startsWith('✓') ? 'var(--good)' : 'var(--red)', marginTop: 4, textAlign: 'center' }}>{pushResult}</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Подвал: тема, поделиться, озвучка, язык, выход */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          <button onClick={toggleTheme} style={pill}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} {theme === 'dark' ? t.nav.themeLight : t.nav.themeDark}</button>
          <button onClick={shareApp} style={pill} title="Поделиться приложением"><Share2 size={14} /> {shared ? 'Скопировано' : 'Поделиться'}</button>
          <AutoSpeakToggle pill />
          <SpeakTranslationToggle />
          <LangSwitcher pill dropUp />
          <button onClick={handleLogout} style={{ ...pill, color: '#C0392B', borderColor: '#C0392B22' }}><LogOut size={14} /> {t.nav.logout}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', position: 'relative' }} dir={isRtl ? 'rtl' : undefined}>
      {/* Флаговая полоска */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 210, background: 'linear-gradient(90deg, #111 0 33%, #dd0000 33% 66%, #ffce00 66% 100%)' }} />
      <ProcessingBadge />

      {impersonating && (
        <div style={{ position: 'fixed', top: 3, left: 0, right: 0, zIndex: 400, background: '#B3382C', color: '#fff', padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontSize: 13, fontWeight: 600, flexWrap: 'wrap' }}>
          <span>👁️ Вы вошли как <b>{impersonating.email}</b> ({impersonating.role === 'owner' ? 'учитель' : 'ученик'})</span>
          <button onClick={returnToAdmin} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.6)', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>↩ Вернуться к себе</button>
        </div>
      )}

      {/* Десктоп-сайдбар (≥1024px) */}
      <nav className="layout-sidebar" style={{ display: 'none', position: 'fixed', top: 3, left: 0, bottom: 0, zIndex: 100, width: SIDEBAR_W, background: 'var(--surface)', borderRight: '1px solid var(--line)', flexDirection: 'column' }}>
        {SidebarContent({})}
      </nav>

      {/* Мобильный/планшетный топбар */}
      <header className="layout-topbar" style={{ position: 'fixed', top: 3, left: 0, right: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--line)', minHeight: 52 }}>
        {/* Слева: меню + назад */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setOpen(v => !v)} className="layout-hamburger" style={iconBtn} aria-label="Меню"><Menu size={20} /></button>
          {location.pathname !== '/' && (
            <button onClick={() => navigate(-1)} style={iconBtn} aria-label="Назад" title="Назад"><ArrowLeft size={20} color="var(--blue)" /></button>
          )}
        </div>
        {/* Центр: заголовок с флагом + немецкая полоска (как в макете) */}
        <Link to="/" title={`Изучаемый язык: ${tgtName}`}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', color: 'var(--ink)', minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--heading-font)', fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap' }}>{tgt.flag} {tgtName}</span>
          <span style={{ display: 'block', height: 3, width: 40, borderRadius: 2, background: `linear-gradient(90deg, ${(tgt.stripe || TARGET_META.de.stripe).join(',')})` }} />
        </Link>
        {/* Справа: тур + профиль */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {gateLangs && gateLangs.length >= 2 && (
            <button onClick={() => setGateOpen(true)} style={iconBtn} aria-label={t.nav.changeCourse || 'Сменить курс'} title={t.nav.changeCourse || 'Сменить курс'}><Languages size={19} color="var(--gold-dark)" /></button>
          )}
          <button onClick={startTour} style={iconBtn} aria-label="Тур" title="Тур по приложению"><Compass size={19} color="var(--blue)" /></button>
          {user && (
            <button onClick={() => setProfileOpen(v => !v)} aria-label="Профиль"
              style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--surface)', background: 'var(--gold)', color: '#fff', fontWeight: 700, fontSize: /\p{Emoji}/u.test(avatarChar) ? 20 : 15, cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
              {avatarChar}
            </button>
          )}
        </div>
      </header>

      {!online && (
        <div style={{ position: 'fixed', top: 'var(--topbar-h, 56px)', left: 0, right: 0, zIndex: 90, background: '#8a6d1a', color: '#fff', textAlign: 'center', padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
          📴 {t.offlineMode?.badge || 'Офлайн — словарь и упражнения работают, прогресс отправится при появлении сети'}
        </div>
      )}

      {open && <div className="layout-overlay" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 215, background: 'rgba(20,18,14,0.45)' }} />}

      {/* Шторка-меню */}
      <nav ref={drawerRef} className="layout-drawer" style={{ position: 'fixed', top: 3, left: 0, bottom: 0, zIndex: 220, width: 'min(320px, 86vw)', background: 'var(--surface)', transform: open ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform .28s cubic-bezier(.32,.72,0,1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: open ? '2px 0 24px rgba(0,0,0,0.28)' : 'none' }}>
        {SidebarContent({ inDrawer: true })}
      </nav>

      {/* Узкая иконочная полоса (планшет 641-1023px) */}
      <nav className="layout-narrow-strip" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', position: 'fixed', top: 3, left: 0, bottom: 0, zIndex: 100, width: 60, background: 'var(--surface)', borderRight: '1px solid var(--line)', paddingTop: 10, gap: 4, overflowY: 'auto' }}>
        <Link to="/" title={t.nav.today} style={{ fontSize: 22, textDecoration: 'none', marginBottom: 4, lineHeight: 1 }}>{tgt.flag}</Link>
        <div style={{ width: 32, height: 1, background: 'var(--line)', marginBottom: 2 }} />
        {[
          { to: '/', C: Home, label: t.nav.today },
          { to: '/lessons', C: BookText, label: t.nav.lessons },
          { to: '/vocabulary', C: BookOpen, label: t.nav.vocabulary },
          { to: '/reader', C: Glasses, label: t.nav.reader },
          { to: '/phrasebook', C: MessageCircle, label: E.navPhrasebook },
          { to: '/grammar', C: GraduationCap, label: E.navGrammar },
          { to: '/wiki', C: HelpCircle, label: t.nav.wiki },
        ].map(item => {
          const active = isActive(item.to)
          return (
            <Link key={item.to} to={item.to} title={item.label} style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: active ? 'var(--blue)' : 'var(--ink-soft)', background: active ? 'rgba(62,127,193,0.10)' : 'transparent' }}>
              <NIcon C={item.C} size={20} />
            </Link>
          )
        })}
        <Link to="/chat" title={E.navChat} style={{ width: 44, height: 44, borderRadius: 12, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: isActive('/chat') ? 'var(--blue)' : 'var(--ink-soft)', background: isActive('/chat') ? 'rgba(62,127,193,0.10)' : 'transparent' }}>
          <MessagesSquare size={20} strokeWidth={1.8} />
          {unreadChat > 0 && <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '0 4px', fontSize: 9, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{unreadChat > 9 ? '9+' : unreadChat}</span>}
        </Link>
        <div style={{ flex: 1 }} />
        <Link to="/settings" title="Настройки" style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: isActive('/settings') ? 'var(--blue)' : 'var(--ink-soft)', background: isActive('/settings') ? 'rgba(62,127,193,0.10)' : 'transparent' }}>
          <Settings size={20} strokeWidth={1.8} />
        </Link>
        <button onClick={() => setOpen(v => !v)} title="Меню" style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft)' }}>
          <MoreVertical size={20} />
        </button>
      </nav>

      {/* Десктопный мини-хедер (≥1024px) */}
      <header className="layout-desktop-topbar">
        {location.pathname !== '/' ? (
          <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 700, fontSize: 14, padding: '6px 10px', borderRadius: 8 }}>← Назад</button>
        ) : (
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{tgt.flag} {tgtName}</span>
        )}
      </header>

      <main className="main-content">{children}</main>

      {/* Попап профиля — открывается из аватара в топбаре (как в макете) */}
      {user && profileOpen && (
        <>
          {(
            <>
              <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 230 }} />
              <div style={{ position: 'fixed', right: 12, top: 'calc(var(--topbar-h, 56px) + 4px)', zIndex: 231, width: 232, background: 'var(--surface)', borderRadius: 16, boxShadow: '0 16px 40px rgba(0,0,0,0.25)', border: '1px solid var(--line)', padding: 14 }}>
                {/* Профиль = настройки (объединено): шапка ведёт в единый экран аккаунта */}
                <Link to="/settings" onClick={() => setProfileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 8, borderBottom: '1px solid var(--line)', textDecoration: 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gold)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: /\p{Emoji}/u.test(avatarChar) ? 20 : 15 }}>{avatarChar}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{displayName}</div><div style={{ fontSize: 10.5, color: 'var(--ink-soft)' }}>{user.role === 'owner' ? t.nav.teacher : t.nav.student}</div></div>
                  <Settings size={16} color="var(--ink-soft)" />
                </Link>
                <button onClick={() => { toggleTheme() }} style={popRow}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? t.nav.themeLight : t.nav.themeDark}</button>
                <div style={{ ...popRow, cursor: 'default' }}><Globe size={16} /> <span style={{ flex: 1 }}>{t.nav.interfaceLang || 'Язык интерфейса'}</span><LangSwitcher pill dropUp /></div>
                <button onClick={() => { setProfileOpen(false); startTour() }} style={popRow}><Compass size={16} /> {t.nav.tourApp || 'Тур по приложению'}</button>
                <button onClick={handleLogout} style={{ ...popRow, color: '#C0392B' }}><LogOut size={16} /> {t.nav.logout}</button>
              </div>
            </>
          )}
        </>
      )}

      {/* Нижняя навигация (мобиль ≤640px) */}
      <nav className="bottom-nav">
        {[
          { to: '/', C: Home, label: t.nav.today },
          { to: '/vocabulary', C: BookOpen, label: t.nav.vocabulary },
          { to: '/reader', C: Glasses, label: t.nav.reader },
          { to: '/phrasebook', C: MessageCircle, label: E.navPhrasebook },
          { to: '/wiki', C: HelpCircle, label: t.nav.wiki },
        ].map(item => {
          const active = location.pathname === item.to
          return (
            <Link key={item.to} to={item.to} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 2px', textDecoration: 'none', color: active ? 'var(--blue)' : 'var(--ink-soft)', fontSize: 10, fontWeight: active ? 700 : 500, position: 'relative' }}>
              <NIcon C={item.C} size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setOpen(v => !v)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 10 }}>
          <Menu size={22} />
          <span>{t.nav.more}</span>
        </button>
      </nav>

      {/* Онбординг-тур — по кнопке 🧭 и раз при первом входе. onMenu — тур сам открывает меню для шагов по разделам */}
      {tourRun && <Tour onClose={endTour} onMenu={setOpen} />}

      {/* Окно выбора языка изучения — при первом входе и по кнопке «Сменить курс» */}
      {gateOpen && <CourseGate langs={gateLangs} runTourAfter={!localStorage.getItem('lang_chosen')} onClose={() => { localStorage.setItem('lang_chosen', '1'); setGateOpen(false) }} />}
    </div>
  )
}

const iconBtn = { width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink)' }
const pill = { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '8px 12px', fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }
const popRow = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 4px', fontSize: 13, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }
