import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BookOpenText, Zap, Flame, Play, CheckCircle2, Layers, Puzzle, SquarePen,
  Gamepad2, Search, Volume2, RotateCcw, Pencil, ChevronUp, ChevronDown, Check,
  Star, Sparkles, MessageCircle, Heart, ArrowRight, Mic, BarChart3, Printer,
  Camera, GraduationCap, Lock,
} from 'lucide-react'
import { api } from '../api/client.js'
import { getOfflineLessonWords, getOfflineStats, isOnline } from '../offline/store.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import { getTranslation, getLessonTitle, getLessonDesc } from '../utils/translation.js'
import AdSlot from '../components/AdSlot.jsx'
import CameraWords from '../components/CameraWords.jsx'
import '../styles/dashboard-v3.css'

// Языки → флаг/название/полоска флага (для шапки курса)
const LANGS = {
  de: { flag: '🇩🇪', name: 'Немецкий',    stripe: ['#1a1a1a', '#dd0000', '#ffce00'] },
  en: { flag: '🇬🇧', name: 'Английский',  stripe: ['#012169', '#ffffff', '#C8102E'] },
  es: { flag: '🇪🇸', name: 'Испанский',   stripe: ['#AA151B', '#F1BF00', '#AA151B'] },
  fr: { flag: '🇫🇷', name: 'Французский', stripe: ['#0055A4', '#ffffff', '#EF4135'] },
  it: { flag: '🇮🇹', name: 'Итальянский', stripe: ['#008C45', '#ffffff', '#CD212A'] },
  pt: { flag: '🇵🇹', name: 'Португальский', stripe: ['#006600', '#ffffff', '#FF0000'] },
}

const TYPE_ORDER = ['multiple_choice', 'flashcard', 'letter_fill', 'fill_blank', 'sentence_write', 'speech', 'dictation']
// Иконка (lucide) на тип упражнения; letter_fill рисуем как «abc»
const TYPE_ICON = {
  multiple_choice: CheckCircle2, flashcard: Layers, fill_blank: Pencil,
  sentence_write: SquarePen, speech: MessageCircle, dictation: Mic,
}

const ts = (d) => { const t = new Date(d).getTime(); return isNaN(t) ? 0 : t }

// Пилюля-тумблер (лента над путём уроков)
const ribbonBtn = (active) => ({
  padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--blue)' : 'var(--line)'}`,
  background: active ? 'rgba(62,127,193,0.12)' : 'var(--surface)',
  color: active ? 'var(--blue)' : 'var(--ink-soft)',
})

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState([])
  const [completed, setCompleted] = useState([])
  const [tailsCount, setTailsCount] = useState(0) // «хвосты» курса — пропущенные упражнения
  const [lessonQuery, setLessonQuery] = useState('')
  const [showSets, setShowSets] = useState(() => localStorage.getItem('dash_show_sets') === '1')
  const [showAllLessons, setShowAllLessons] = useState(() => localStorage.getItem('dash_all_lessons') !== '0')
  const toggleAllLessons = () => setShowAllLessons(v => { localStorage.setItem('dash_all_lessons', v ? '0' : '1'); return !v })
  const [courses, setCourses] = useState([])
  const [activeCourse, setActiveCourse] = useState(() => localStorage.getItem('active_course') || '')
  const [selectedId, setSelectedId] = useState(null)   // выбранный урок в «нитке»
  const [selectedSetId, setSelectedSetId] = useState(null) // раскрытый набор (аккордеон на месте)
  const [pickSchedCourse, setPickSchedCourse] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { t, lang } = useI18nStore()
  const { user } = useAuthStore()

  // Пришли с упражнений («На главную») → раскрыть свой урок и плавно проскроллить к нему
  useEffect(() => {
    const id = location.state?.scrollToLesson
    if (!id || loading) return
    setSelectedId(id)
    const tid = setTimeout(() => {
      const el = document.querySelector(`[data-node-lesson="${id}"]`) || document.querySelector('.dl-detail-card')
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      window.history.replaceState({}, '') // очистить state — не скроллить повторно
    }, 350)
    return () => clearTimeout(tid)
  }, [loading, location.state])
  const target = (typeof localStorage !== 'undefined' && localStorage.getItem('target_lang')) || 'de'
  const course = LANGS[target] || LANGS.de

  const changeCourse = (v) => { localStorage.setItem('active_course', v); setActiveCourse(v) }
  const toggleSets = () => setShowSets(v => { localStorage.setItem('dash_show_sets', v ? '0' : '1'); return !v })

  const reloadStats = () => {
    const load = isOnline() ? api.get('/exercises/stats').catch(() => getOfflineStats()) : getOfflineStats()
    load.then(setStats).catch(console.error).finally(() => setLoading(false))
    api.get('/exercises/completed-lessons').then(setCompleted).catch(() => {})
    if (isOnline()) api.get('/exercises/progress').then(setProgress).catch(() => {})
    if (isOnline()) api.get('/exercises/deferred').then(rows => setTailsCount((rows || []).reduce((s, r) => s + (r.cnt || 0), 0))).catch(() => {})
  }
  useEffect(() => {
    reloadStats()
    api.get('/class-games').then(rows => setGames((rows || []).filter(g => g.status === 'ready'))).catch(() => {})
    api.get('/courses').then(cs => setCourses(Array.isArray(cs) ? cs : [])).catch(() => {})
  }, []) // eslint-disable-line

  useEffect(() => {
    const onFocus = () => { if (isOnline()) reloadStats() }
    const onVisible = () => { if (document.visibilityState === 'visible' && isOnline()) reloadStats() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible) }
  }, []) // eslint-disable-line

  const repeatLesson = async (id) => {
    try { await api.post(`/exercises/reset-lesson/${id}`, {}); reloadStats() } catch (e) { alert('Ошибка: ' + e.message) }
  }

  if (loading) return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>{t.dashboard.loading}</div>

  const total = stats?.total ?? 0
  const allLessons = stats?.lessons ?? []
  const needsSchedule = stats?.needs_schedule ?? []

  // Фильтр по активному курсу (пусто = все). Наборы/личные (без course_id) — всегда.
  const filtered = activeCourse
    ? allLessons.filter(l => String(l.course_id || '') === activeCourse || l.is_set)
    : allLessons
  const q = lessonQuery.trim().toLowerCase()
  const match = l => !q || (getLessonTitle(l.lesson_title, l.lesson_title_translations, lang) || l.lesson_title || '').toLowerCase().includes(q)
  const shown = filtered.filter(match)

  // Уроки (не наборы) в порядке прохождения (старые → новые = снизу вверх нитки)
  const books = shown.filter(l => !l.is_set).sort((a, b) => ts(a.lesson_date) - ts(b.lesson_date) || a.lesson_id - b.lesson_id)
  const setsAll = shown.filter(l => l.is_set).sort((a, b) => b.lesson_id - a.lesson_id)
  const completedIds = new Set((completed || []).map(c => c.id))
  // Текущий — первый НЕпройденный и НЕзакрытый (locked уроки видно, но проходить нельзя)
  const current = books.find(l => !l.locked && !completedIds.has(l.lesson_id)) || books.filter(l => !l.locked).slice(-1)[0] || null

  // Статус для нитки: пройден / текущий / закрыт (дрип) / доступен
  const pathLessons = books.map(l => ({
    ...l,
    status: l.locked ? 'locked'
      : completedIds.has(l.lesson_id) ? 'done'
      : (current && l.lesson_id === current.lesson_id ? 'current' : 'upcoming'),
  }))
  const selLesson = pathLessons.find(l => l.lesson_id === (selectedId ?? current?.lesson_id)) || null

  const name = user?.name || (user?.email || '').split('@')[0] || ''
  const greeting = t.dashboard.greeting || 'Привет'

  const pct = (a, b) => (b ? Math.max(4, Math.round((a / b) * 100)) : 0)

  // Курс-баннер выбора расписания (дрип): курсы без календаря активного языка
  const needsScheduleBanner = needsSchedule.length > 0 && (
    <div className="dl-banner dl-banner--accent"
      onClick={() => needsSchedule.length === 1 && navigate(`/courses/${needsSchedule[0].id}`)}
      style={{ cursor: needsSchedule.length === 1 ? 'pointer' : 'default' }}>
      <span style={{ fontSize: 26 }}>📅</span>
      <div className="dl-banner-text">
        <div className="dl-banner-title">{needsSchedule.length === 1 ? t.dashboard.needsScheduleTitle : t.dashboard.needsScheduleMultiTitle}</div>
        {needsSchedule.length === 1 ? (
          <div className="dl-banner-sub">{t.dashboard.needsScheduleDesc(needsSchedule[0].title)}</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <select value={pickSchedCourse} onChange={e => setPickSchedCourse(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--gold)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
              <option value="">{t.dashboard.pickCoursePlaceholder}</option>
              {needsSchedule.map(c => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
            </select>
            <button onClick={() => pickSchedCourse && navigate(`/courses/${pickSchedCourse}`)} disabled={!pickSchedCourse}
              style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--gold)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: pickSchedCourse ? 'pointer' : 'default', opacity: pickSchedCourse ? 1 : 0.5 }}>
              {t.dashboard.configureBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="dl-root">
      {/* Заголовок курса (флаг+название+полоска) теперь в топбаре — тут только выбор курса */}
      {courses.length >= 2 && (
        <div className="dl-course-bar" style={{ justifyContent: 'flex-end' }}>
          <select className="dl-switch-course" value={activeCourse} onChange={e => changeCourse(e.target.value)}>
            <option value="">{t.dashboard.allCourses}</option>
            {courses.map(c => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
          </select>
        </div>
      )}

      {needsScheduleBanner}

      {/* 🧩 Хвосты курса — пропущенные упражнения (проговори/диктант). Нужно добить для финиша. */}
      {tailsCount > 0 && (
        <div className="dl-banner dl-banner--accent" style={{ cursor: 'pointer' }} onClick={() => navigate('/exercise-session?tails=1')}>
          <span style={{ fontSize: 26 }}>🧩</span>
          <div className="dl-banner-text">
            <div className="dl-banner-title">{t.dashboard.tailsBanner || 'Доделать хвосты'} ({tailsCount})</div>
            <div className="dl-banner-sub">{t.dashboard.tailsBannerSub || 'Пропущенные упражнения — пройди для финиша курса'}</div>
          </div>
        </div>
      )}

      {/* ---------- HERO / метрики ---------- */}
      <section className="dl-hero">
        <div className="dl-greeting">{greeting}{name ? `, ${name}` : ''} <span className="dl-wave">👋</span></div>
        <p className="dl-greeting-sub">{t.dashboard.exercisesWaiting(total)}</p>

        {progress && (
          <div className="dl-metrics">
            <MetricCard Icon={BookOpenText} title={t.dashboard.progressLessons}
              value={progress.lessons?.done ?? 0} total={progress.lessons?.total ?? 0} color="var(--blue)" pct={pct} />
            <MetricCard Icon={Zap} title={t.dashboard.progressWords}
              value={progress.words?.known ?? 0} total={progress.words?.total ?? 0} color="var(--teal)" pct={pct} />
          </div>
        )}

        {progress && (
          <div className="dl-stats-trio">
            <div className="dl-stat"><b>{progress.cards?.today ?? 0}</b><span>{t.dashboard.cardsToday}</span></div>
            <div className="dl-stat"><b>{progress.cards?.all ?? 0}</b><span>{t.dashboard.cardsAll}</span></div>
            <div className="dl-stat dl-stat--fire"><b><Flame size={15} className="dl-inline-icon" />{progress.streak ?? 0}</b><span>{t.dashboard.streakDays}</span></div>
          </div>
        )}

        {total > 0 && (
          <button className="dl-repeat-big" onClick={() => navigate('/exercise-session')}>
            <Play size={16} /> {t.dashboard.repeatAll} <span>{total}</span>
          </button>
        )}
      </section>

      {/* ---------- Фичи: аналитика (учитель) / тренер / любовь ---------- */}
      <section className="dl-features">
        {user?.role === 'owner' && (
          <>
            <span className="dl-eyebrow dl-eyebrow--block">{t.dashboard.newForTeacher}</span>
            <div className="dl-feature-card dl-feature-card--teacher" onClick={() => navigate('/analytics')}>
              <span className="dl-feature-avatar"><BarChart3 size={20} /></span>
              <div className="dl-feature-text">
                <div className="dl-feature-title">{t.nav.analytics}</div>
                <div className="dl-feature-sub">{t.dashboard.analyticsDesc}</div>
              </div>
              <span className="dl-badge dl-badge--new">NEW</span>
            </div>
          </>
        )}

        <span className="dl-eyebrow dl-eyebrow--block">{t.dashboard.trainer}</span>
        <div className="dl-feature-card dl-feature-card--trainer" onClick={() => navigate('/ai-trainer')}>
          <span className="dl-feature-avatar"><Sparkles size={20} /></span>
          <div className="dl-feature-text">
            <div className="dl-feature-title">Hallo! Ich bin Pablo</div>
            <div className="dl-feature-sub">{t.dashboard.trainerDesc}</div>
          </div>
          <span className="dl-feature-corner"><MessageCircle size={17} /></span>
        </div>
        <div className="dl-feature-card dl-feature-card--love" onClick={() => navigate('/love')}>
          <span className="dl-feature-avatar"><Heart size={20} /></span>
          <div className="dl-feature-text">
            <div className="dl-feature-title">{t.dashboard.loveTitle}</div>
            <div className="dl-feature-sub">{t.dashboard.loveDesc}</div>
          </div>
          <span className="dl-feature-corner"><ArrowRight size={17} /></span>
        </div>

        {/* ---------- Игры ---------- */}
        <span className="dl-eyebrow dl-eyebrow--block">{t.dashboard.games}</span>
        {total > 0 && (
          <div className="dl-games-grid">
            <button className="dl-game-tile" onClick={() => navigate('/exercise-session?type=multiple_choice')}>
              <span className="dl-ico"><CheckCircle2 size={19} /></span>
              <div className="dl-game-tile-title">{t.dashboard.chooseAnswerTitle}</div>
              <div className="dl-game-tile-sub">{t.dashboard.chooseAnswerDesc}</div>
            </button>
            <button className="dl-game-tile" onClick={() => navigate('/exercise-session?type=flashcard')}>
              <span className="dl-ico"><Layers size={19} /></span>
              <div className="dl-game-tile-title">{t.dashboard.allCardsTitle}</div>
              <div className="dl-game-tile-sub">{t.dashboard.allCardsDesc}</div>
            </button>
          </div>
        )}
        <div className="dl-games-list">
          <button className="dl-game-row" onClick={() => navigate('/game/match')}>
            <span className="dl-game-row-icon"><Layers size={18} /></span>
            <div className="dl-game-row-text">
              <div className="dl-game-row-title">{t.dashboard.matchTitle}</div>
              <div className="dl-game-row-sub">{t.dashboard.matchDesc}</div>
            </div>
            <span className="dl-badge dl-badge--new">NEW</span>
          </button>
          <button className="dl-game-row" onClick={() => navigate('/game/crossword')}>
            <span className="dl-game-row-icon"><Puzzle size={18} /></span>
            <div className="dl-game-row-text">
              <div className="dl-game-row-title">{t.dashboard.crossTitle}</div>
              <div className="dl-game-row-sub">{t.dashboard.crossDesc}</div>
            </div>
            <span className="dl-badge dl-badge--new">NEW</span>
          </button>
          <button className="dl-game-row dl-game-row--dashed" onClick={() => navigate('/vocabulary')}>
            <span className="dl-game-row-icon" style={{ color: 'var(--gold-dark)' }}><SquarePen size={18} /></span>
            <div className="dl-game-row-text">
              <div className="dl-game-row-title">{t.dashboard.createSetTitle}</div>
              <div className="dl-game-row-sub">{t.dashboard.createSetDesc}</div>
            </div>
          </button>
          <button className={'dl-game-row' + (games.length ? '' : ' dl-game-row--muted')}
            onClick={() => games.length && navigate(`/class-game/${games[0].id}`)}>
            <span className="dl-game-row-icon"><Gamepad2 size={18} /></span>
            <div className="dl-game-row-text">
              <div className="dl-game-row-title">{t.dashboard.classGameTitle}</div>
              <div className="dl-game-row-sub">{games.length ? t.dashboard.classGameReady : t.dashboard.classGameNot}</div>
            </div>
            {games.length > 0 && <span className="dl-badge dl-badge--ready">ГОТОВА</span>}
          </button>
        </div>
      </section>

      {/* ---------- Поиск ---------- */}
      {books.length > 5 && (
        <div className="dl-search">
          <Search size={17} />
          <input value={lessonQuery} onChange={e => setLessonQuery(e.target.value)} placeholder={t.dashboard.searchLesson} />
        </div>
      )}

      {books.length > 0 && (
        <div className="dl-scrollcue">
          <span>{t.dashboard.lessons}</span>
          <ChevronDown size={16} className="dl-scrollcue-arrow" />
        </div>
      )}

      {/* ---------- ПУТЬ УРОКОВ (нитка) ---------- */}
      <section className="dl-screen2">
        {books.length > 0 && (() => {
          // «Текущий урок» = показываем только текущий (реальный эффект и для ученика);
          // если всё пройдено (нет current) — показываем весь путь.
          const currentOnly = pathLessons.filter(l => l.status === 'current')
          const shownPath = showAllLessons || !currentOnly.length ? pathLessons : currentOnly
          return (
          <>
            <div className="dl-section-head">
              <span className="dl-eyebrow">{t.dashboard.lessonPath || 'Путь урока'}</span>
              <span className="dl-stripe-thin" style={{ background: `linear-gradient(90deg, ${course.stripe.join(',')})` }} />
            </div>
            {/* Тумблер «Все уроки/Текущий» — под полоской пути, над первым кружком */}
            <div className="dl-sets-toggle-row" style={{ marginBottom: 10 }}>
              <div>
                <div className="dl-sets-toggle-title">📚 {t.dashboard.allLessons || 'Все уроки'}</div>
                <div className="dl-sets-toggle-sub">
                  {showAllLessons ? (t.dashboard.allLessonsSub || 'Показан весь путь уроков') : (t.dashboard.currentLessonSub || 'Показан только текущий урок')}
                </div>
              </div>
              <label className="dl-switch">
                <input type="checkbox" checked={showAllLessons} onChange={toggleAllLessons} />
                <span className="dl-switch-track"><span className="dl-switch-thumb" /></span>
              </label>
            </div>
            <LessonPath lessons={shownPath}
              selectedId={selectedId ?? current?.lesson_id}
              onSelect={id => {
                const nid = id === (selectedId ?? current?.lesson_id) ? null : id
                setSelectedId(nid)
                // Клик по уроку на карте → плавно скроллим вниз к раскрытой карточке урока
                if (nid) setTimeout(() => document.querySelector('.dl-detail-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
              }} lang={lang} />
          </>
          )
        })()}

        {selLesson && <LessonDetailCard key={selLesson.lesson_id} lesson={selLesson} navigate={navigate} onReset={repeatLesson} />}

        {/* Тумблер «Наборы» — под уроком, перед списком наборов */}
        {setsAll.length > 0 && (
          <div className="dl-sets-toggle-row" style={{ marginBottom: 8 }}>
            <div>
              <div className="dl-sets-toggle-title">🗂 {t.nav.sets || 'Наборы'}</div>
              <div className="dl-sets-toggle-sub">{t.dashboard.setsSub || 'Твои подборки слов для тренировки'}</div>
            </div>
            <label className="dl-switch">
              <input type="checkbox" checked={showSets} onChange={toggleSets} />
              <span className="dl-switch-track"><span className="dl-switch-thumb" /></span>
            </label>
          </div>
        )}

        {!books.length && !q && (
          <div style={{ padding: '30px 8px', textAlign: 'center', color: 'var(--ink-soft)' }}>
            {total === 0 ? `🎉 ${t.dashboard.allDone}` : t.dashboard.nothingFound}
          </div>
        )}

        {/* ---------- Наборы (тумблер — в ленте вверху) ---------- */}
        {(showSets || q) && setsAll.length > 0 && (
          <div className="dl-sets-list">
            {setsAll.map(s => (
              <div key={s.lesson_id}>
                <div className="dl-set-card" onClick={() => setSelectedSetId(v => v === s.lesson_id ? null : s.lesson_id)}>
                  <span>{getLessonTitle(s.lesson_title, s.lesson_title_translations, lang) || `#${s.lesson_id}`}</span>
                  <span className="dl-set-count">
                    {s.words_count || s.total}
                    {selectedSetId === s.lesson_id ? <ChevronUp size={15} className="dl-inline-icon" style={{ marginLeft: 6 }} /> : <ChevronDown size={15} className="dl-inline-icon" style={{ marginLeft: 6 }} />}
                  </span>
                </div>
                {/* Раскрытие набора НА МЕСТЕ (аккордеон) — не улетает в низ экрана */}
                {selectedSetId === s.lesson_id && (
                  <div style={{ marginTop: 8 }}>
                    <LessonDetailCard key={'set' + s.lesson_id} lesson={{ ...s, status: 'current' }} navigate={navigate} onReset={repeatLesson} />
                  </div>
                )}
              </div>
            ))}
            <button className="dl-set-add" onClick={() => navigate('/vocabulary')}>
              <SquarePen size={15} /> {t.dashboard.createSetTitle}
            </button>
          </div>
        )}
      </section>

      {/* ---------- Повторить пройденное ---------- */}
      {completed.length > 0 && (
        <div style={{ padding: '4px 0 20px' }}>
          <span className="dl-eyebrow" style={{ display: 'block', padding: '0 20px 8px' }}>{t.dashboard.repeatDone}</span>
          {completed.map(l => (
            <div key={l.id} className="dl-redo-row">
              <span className="dl-redo-badge">{t.dashboard.passedBadge}</span>
              <span className="dl-redo-title">{getLessonTitle(l.title, l.title_translations, lang)}</span>
              <button className="dl-redo-btn" onClick={() => repeatLesson(l.id)}><RotateCcw size={14} /> {t.dashboard.repeatBtn || 'Повторить'}</button>
            </div>
          ))}
        </div>
      )}

      <AdSlot />

      {/* ---------- Плавающие кнопки ---------- */}
      <CameraWords mode="sentences" renderTrigger={(pick, busy) => (
        <button className="dl-fab dl-fab-camera" onClick={pick} disabled={busy}
          title="Сфотографировать — разбор слов"
          style={{ bottom: `calc(var(--bottom-nav-h, 0px) + 20px)` }}>
          {busy ? '…' : <Camera size={20} />}
        </button>
      )} />
    </div>
  )
}

/* ================= МЕТРИКА ================= */
function MetricCard({ Icon, title, value, total, color, pct }) {
  return (
    <div className="dl-metric-card">
      <div className="dl-metric-top">
        <span className="dl-ico" style={{ color }}><Icon size={17} /></span>
        <span className="dl-metric-title">{title}</span>
      </div>
      <div className="dl-metric-bar-track">
        <div className="dl-metric-bar-fill" style={{ width: pct(value, total) + '%', background: color }} />
      </div>
      <div className="dl-metric-count">{value} / {total}</div>
    </div>
  )
}

/* ================= НИТКА УРОКОВ ================= */
function LessonPath({ lessons, selectedId, onSelect, lang }) {
  const NODE = 64, GAP_Y = 118
  const xPattern = [0, -78, 74, -46, 52, 0, -70]
  const points = useMemo(() => lessons.map((l, i) => ({
    ...l, x: 160 + xPattern[i % xPattern.length], y: 50 + i * GAP_Y,
  })), [lessons])
  if (!points.length) return null

  const pathD = (() => {
    if (points.length < 2) return `M ${points[0].x} ${points[0].y}`
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1], p1 = points[i], midY = (p0.y + p1.y) / 2
      d += ` C ${p0.x} ${midY}, ${p1.x} ${midY}, ${p1.x} ${p1.y}`
    }
    return d
  })()
  const height = points[points.length - 1].y + 90
  const doneCount = points.filter(p => p.status === 'done').length

  return (
    <div className="dl-path" style={{ height }}>
      <svg className="dl-path-svg" viewBox={`0 0 320 ${height}`} preserveAspectRatio="none">
        <path d={pathD} className="dl-thread-bg" />
        <path d={pathD} className="dl-thread-done"
          style={{ strokeDasharray: 2000, strokeDashoffset: 2000 - (2000 * (doneCount + 0.5)) / points.length }} />
      </svg>
      {points.map(p => (
        <button key={p.lesson_id} data-node-lesson={p.lesson_id}
          className={`dl-node dl-node--${p.status}` + (p.lesson_id === selectedId ? ' dl-node--selected' : '')}
          style={{ left: p.x - NODE / 2, top: p.y - NODE / 2, width: NODE, height: NODE }}
          onClick={() => onSelect(p.lesson_id)}
          title={getLessonTitle(p.lesson_title, p.lesson_title_translations, lang)}>
          <span className="dl-node-icon">
            {p.status === 'done' ? <Check size={22} strokeWidth={2.6} />
              : p.status === 'current' ? <Star size={22} fill="currentColor" />
              : p.status === 'locked' ? <Lock size={20} />
              : <Star size={22} />}
          </span>
          {p.status === 'current' && <span className="dl-node-pulse" />}
          <span className="dl-node-label">{getLessonTitle(p.lesson_title, p.lesson_title_translations, lang)}</span>
        </button>
      ))}
    </div>
  )
}

/* ================= КАРТОЧКА-ДЕТАЛЬ УРОКА ================= */
function LessonDetailCard({ lesson, navigate, onReset }) {
  const { t, lang } = useI18nStore()
  const { user } = useAuthStore()
  const [exOpen, setExOpen] = useState(true)
  const [wordsOpen, setWordsOpen] = useState(false)
  const [words, setWords] = useState(null)
  const [listening, setListening] = useState(false)

  const id = lesson.lesson_id
  const title = getLessonTitle(lesson.lesson_title, lesson.lesson_title_translations, lang) || `#${id}`
  const wordsCount = lesson.words_count || 0
  const chips = TYPE_ORDER.filter(type => lesson.byType?.[type])
  const typeLabels = {
    flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice,
    sentence_write: t.exercise.sentenceWrite, letter_fill: t.exercise.letterFill,
    speech: t.exercise.speech || 'Произношение', dictation: t.exercise.dictation,
  }
  const tag = lesson.status === 'done' ? t.dashboard.passedBadge
    : lesson.status === 'current' ? t.dashboard.statusProgress : t.dashboard.statusNew

  const loadWords = async () => {
    if (words !== null) return words
    const data = await (navigator.onLine === false
      ? getOfflineLessonWords(id)
      : api.get(`/lessons/${id}/words`).catch(() => getOfflineLessonWords(id)))
    setWords(data); return data
  }
  const toggleWords = async () => { await loadWords(); setWordsOpen(v => !v) }
  const handleListen = async () => {
    const list = await loadWords()
    if (!list?.length) return
    setListening(true); window.speechSynthesis.cancel()
    let i = 0
    const next = () => {
      if (i >= list.length) { setListening(false); return }
      const u = new SpeechSynthesisUtterance(list[i].word_de); u.lang = 'de-DE'; u.rate = 0.85
      u.onend = () => { i++; setTimeout(next, 450) }
      window.speechSynthesis.speak(u)
    }
    next()
  }
  const handleReset = () => {
    if (navigator.onLine === false) { alert(t.offlineMode?.sectionTitle || 'Нужен интернет'); return }
    if (window.confirm('Сбросить прогресс урока и пройти заново?')) onReset(id)
  }

  // Закрытый (дрип) урок — видно, но проходить нельзя. Слова можно посмотреть заранее.
  if (lesson.status === 'locked') {
    return (
      <div className="dl-detail-card">
        <div className="dl-detail-head" style={{ background: 'var(--surface-2)' }}>
          <span className="dl-detail-star"><Lock size={16} /></span>
          <span className="dl-detail-title">{title}</span>
          <span className="dl-detail-tag">🔒</span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gold-dark)', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            <Lock size={15} /> {t.dashboard.lockedLesson || 'Откроется по расписанию'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {t.dashboard.lockedLessonSub || 'Сначала пройди текущий урок — этот откроется следующим. Слова можно посмотреть заранее.'}
          </div>
        </div>
        <div className="dl-detail-controls">
          <span className="dl-ctrl-words">{t.dashboard.lessonWords} <b>{wordsCount}</b></span>
          <button className="dl-linklike dl-ctrl-chevron" onClick={toggleWords}>
            {wordsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
        {wordsOpen && (
          <div className="dl-word-list">
            {(!words || !words.length) && <div className="dl-word-empty">—</div>}
            {words && words.map(w => {
              const tr = getTranslation(w.translations, lang, w.translation_ru)
              return (
                <div key={w.id} className="dl-word-row">
                  <span title={w.source === 'extra' ? 'Из тетради' : 'Из учебника'} style={{ fontSize: 12, flexShrink: 0 }}>{w.source === 'extra' ? '✏️' : '📖'}</span>
                  <b>{w.word_de}</b>
                  <SpeakButton text={w.word_de} size={13} appendText={tr} />
                  <span className="dl-word-dash">—</span> {tr}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dl-detail-card">
      <div className="dl-detail-head" onClick={() => setExOpen(v => !v)}>
        <span className="dl-detail-star"><Star size={16} /></span>
        <span className="dl-detail-title">{title}</span>
        <span className={'dl-detail-tag' + (lesson.status === 'done' ? ' dl-detail-tag--done' : '')}>{tag}</span>
      </div>

      <div className="dl-detail-sub">
        {t.dashboard.exercisesWaiting(lesson.total || 0)}{' '}
        <button className="dl-linklike" onClick={() => setExOpen(v => !v)}>
          {exOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {exOpen ? (t.dashboard.collapse || 'свернуть') : (t.dashboard.exercisesLink || 'упражнения')}
        </button>
      </div>

      {exOpen && (
        <>
          <div className="dl-ex-grid">
            {chips.map(type => {
              const IcoC = TYPE_ICON[type]
              return (
                <button key={type} className="dl-ex-btn"
                  onClick={() => navigate(`/exercise-session?lesson_id=${id}&type=${type}`)}>
                  <span className="dl-ex-icon">{type === 'letter_fill' ? <b style={{ fontSize: 11 }}>abc</b> : <IcoC size={16} />}</span>
                  <span className="dl-ex-count">{lesson.byType[type]}</span>
                  <span className="dl-ex-label">{typeLabels[type]}</span>
                </button>
              )
            })}
            {wordsCount > 0 && (
              <button className="dl-ex-btn dl-ex-btn--special"
                onClick={() => navigate(`/ai-trainer?lesson_id=${id}&lesson_title=${encodeURIComponent(title)}`)}>
                <span className="dl-ex-icon"><MessageCircle size={16} /></span>
                <span className="dl-ex-label">{t.exercise.trainerSpeech || 'Произношение с тренером'}</span>
              </button>
            )}
          </div>
          <button className="dl-pass-btn" onClick={() => navigate(`/exercise-session?lesson_id=${id}&exam=1`)}>
            <CheckCircle2 size={16} /> {t.dashboard.exam || 'Зачёт по уроку'}
          </button>
        </>
      )}

      <div className="dl-detail-controls">
        {wordsCount > 0 && (
          <button className="dl-ctrl-btn" onClick={handleListen} disabled={listening}>
            <Volume2 size={15} /> {t.dashboard.listen}
          </button>
        )}
        <button className="dl-ctrl-btn" onClick={handleReset}><RotateCcw size={15} /> {t.dashboard.reset || 'Сбросить'}</button>
        {user?.role === 'owner' && wordsCount > 0 && (
          <>
            <button className="dl-ctrl-btn" onClick={() => navigate(`/lesson-report/${id}`)}><BarChart3 size={15} /></button>
            <button className="dl-ctrl-btn" onClick={() => window.open(`/print/${id}`, '_blank')}><Printer size={15} /></button>
          </>
        )}
        <button className="dl-ctrl-pencil" onClick={() => navigate(`/exercise-session?lesson_id=${id}&exam=1`)}>
          <Pencil size={14} /> {lesson.total || 0}
        </button>
        <span className="dl-ctrl-words">{t.dashboard.lessonWords} <b>{wordsCount}</b></span>
        <button className="dl-linklike dl-ctrl-chevron" onClick={toggleWords}>
          {wordsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {wordsOpen && (
        <div className="dl-word-list">
          {(!words || !words.length) && <div className="dl-word-empty">—</div>}
          {words && words.map(w => {
            const tr = getTranslation(w.translations, lang, w.translation_ru)
            return (
              <div key={w.id} className="dl-word-row">
                {/* Источник слова: 📖 из учебника (в зачёте), ✏️ из тетради (доп., не в зачёте) */}
                <span title={w.source === 'extra' ? 'Из тетради (доп.)' : 'Из учебника'} style={{ fontSize: 12, flexShrink: 0 }}>
                  {w.source === 'extra' ? '✏️' : '📖'}
                </span>
                <b>{w.word_de}</b>
                <SpeakButton text={w.word_de} size={13} appendText={tr} />
                <span className="dl-word-dash">—</span> {tr}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
