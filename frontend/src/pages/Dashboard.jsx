import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { getOfflineLessonWords, getOfflineStats, isOnline } from '../offline/store.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import { getTranslation, getLessonTitle, getLessonDesc } from '../utils/translation.js'
import AdSlot from '../components/AdSlot.jsx'
import CameraWords from '../components/CameraWords.jsx'

const TYPE_ORDER = ['multiple_choice', 'flashcard', 'letter_fill', 'fill_blank', 'sentence_write', 'speech', 'dictation']
const TYPE_ICON  = { multiple_choice: '☑️', flashcard: '🃏', letter_fill: '🔤', fill_blank: '✏️', sentence_write: '✍️', speech: '🗣️', dictation: '🎙️' }

// Кнопка-тумблер в ленте под селектором курса
const ribbonBtn = (active) => ({
  padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  color: active ? 'var(--accent)' : 'var(--ink-soft)',
})

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [progress, setProgress] = useState(null)   // динамика: уроки/слова/карточки/серия
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState([])
  const [completed, setCompleted] = useState([])
  const [lessonQuery, setLessonQuery] = useState('')
  const [pinned, setPinned] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinned_lessons') || '[]')) } catch { return new Set() }
  })
  // «Сегодня»: по умолчанию показываем только текущий (самый свежий) урок; тумблер раскрывает все
  const [todayOnly, setTodayOnly] = useState(() => localStorage.getItem('dash_today_only') !== '0')
  const toggleTodayOnly = () => setTodayOnly(v => { localStorage.setItem('dash_today_only', v ? '0' : '1'); return !v })
  // Наборы по темам — отдельный тумблер (можно скрыть, чтобы не отвлекали)
  const [showSets, setShowSets] = useState(() => localStorage.getItem('dash_show_sets') !== '0')
  const toggleSets = () => setShowSets(v => { localStorage.setItem('dash_show_sets', v ? '0' : '1'); return !v })
  // Активный курс: «Сегодня» показывает уроки только выбранного курса (чтобы не складировалось)
  const [courses, setCourses] = useState([])
  const [activeCourse, setActiveCourse] = useState(() => localStorage.getItem('active_course') || '')
  const changeCourse = (v) => { localStorage.setItem('active_course', v); setActiveCourse(v) }
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const { user } = useAuthStore()

  const togglePin = (key) => setPinned(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    localStorage.setItem('pinned_lessons', JSON.stringify([...next]))
    return next
  })

  const reloadStats = () => {
    // Офлайн (или сервер недоступен) — статистика «Сегодня» из локальной базы
    const load = isOnline()
      ? api.get('/exercises/stats').catch(() => getOfflineStats())
      : getOfflineStats()
    load.then(setStats).catch(console.error).finally(() => setLoading(false))
    api.get('/exercises/completed-lessons').then(setCompleted).catch(() => {})
    if (isOnline()) api.get('/exercises/progress').then(setProgress).catch(() => {})
  }
  useEffect(() => {
    reloadStats()
    api.get('/class-games').then(rows => setGames((rows || []).filter(g => g.status === 'ready'))).catch(() => {})
    api.get('/courses').then(cs => setCourses(Array.isArray(cs) ? cs : [])).catch(() => {})
  }, []) // eslint-disable-line

  // Авто-обновление без F5: когда возвращаешься на дашборд (после зачёта/карточек) —
  // перечитываем прогресс и статус уроков (вкладка снова видима / окно в фокусе).
  useEffect(() => {
    const onFocus = () => { if (isOnline()) reloadStats() }
    const onVisible = () => { if (document.visibilityState === 'visible' && isOnline()) reloadStats() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible) }
  }, []) // eslint-disable-line

  // Повторить пройденный урок — вернуть его упражнения «на сегодня»
  const repeatLesson = async (id) => {
    try { await api.post(`/exercises/reset-lesson/${id}`, {}); reloadStats() } catch (e) { alert('Ошибка: ' + e.message) }
  }

  // Баннер «Игра класса» — самая свежая готовая игра (для ученика; учитель тоже видит свои)
  const gameBanner = games.length > 0 && (
    <div style={{ padding: '4px 12px 8px' }}>
      <div onClick={() => navigate(`/class-game/${games[0].id}`)} style={{
        cursor: 'pointer', background: 'linear-gradient(135deg, rgba(201,165,74,0.16), rgba(124,92,255,0.14))',
        border: '1px solid var(--accent)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ fontSize: 30 }}>🎮</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{t.dashboard.gameReadyTitle}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {games[0].title || t.dashboard.gameReadyDesc}{games[0].my_lines ? ` · : my_lines` : ''}
          </div>
        </div>
        <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>{t.dashboard.open} →</span>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
      {t.dashboard.loading}
    </div>
  )

  const total        = stats?.total ?? 0
  const allLessons   = stats?.lessons ?? []
  // Курсы, по которым ученик ещё не выбрал календарь обучения (строгий дрип) → баннер-требование
  const needsSchedule = stats?.needs_schedule ?? []
  const needsScheduleBanner = needsSchedule.length > 0 && (
    <div style={{ padding: '10px 12px 4px' }}>
      {needsSchedule.map(c => (
        <div key={c.id} onClick={() => navigate(`/courses/${c.id}`)} style={{
          cursor: 'pointer', background: 'var(--accent-soft)', border: '2px solid var(--accent)',
          borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
        }}>
          <span style={{ fontSize: 28 }}>📅</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Выбери календарь обучения</div>
            <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
              «{c.title}» — выбери удобные дни, чтобы открыть уроки →
            </div>
          </div>
        </div>
      ))}
    </div>
  )
  // Фильтр по активному курсу (пусто = все). Наборы/личные (без course_id) показываем всегда.
  const lessons = activeCourse
    ? allLessons.filter(l => String(l.course_id || '') === activeCourse || l.is_set)
    : allLessons
  // Селектор активного курса — показываем, когда курсов ≥2 (иначе не нужен)
  const courseSelector = courses.length >= 2 && (
    <div style={{ padding: '4px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>📚 Курс:</span>
      <select value={activeCourse} onChange={e => changeCourse(e.target.value)}
        style={{ flex: 1, maxWidth: 320, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
        <option value="">Все курсы</option>
        {courses.map(c => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
      </select>
    </div>
  )

  if (total === 0) {
    return (
      <div style={{ paddingTop: 12 }}>
        {gameBanner}
        {/* Сначала — требование выбрать календарь (если есть незапланированные курсы) */}
        {needsScheduleBanner}
        {needsSchedule.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              {t.dashboard.allDone}
            </div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{t.dashboard.comeBack}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <style>{`.chips-grid { grid-template-columns: 1fr; } @media (min-width: 480px) { .chips-grid { grid-template-columns: 1fr 1fr; } }`}</style>

      {courseSelector}
      {needsScheduleBanner}

      {/* Тумблеры «Сегодня»: только текущий урок / все доступные · наборы вкл-выкл */}
      <div style={{ padding: '4px 12px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={toggleTodayOnly} style={ribbonBtn(todayOnly)}>
          {todayOnly ? '📅 Только сегодня' : '📚 Все доступные'}
        </button>
        <button onClick={toggleSets} style={ribbonBtn(showSets)}>
          {showSets ? '🗂 Наборы: вкл' : '🗂 Наборы: выкл'}
        </button>
      </div>

      {/* Hero — просто заголовок и счёт */}
      <div style={{ padding: '20px 20px 14px' }}>
        <h1 style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 22, margin: '0 0 6px', lineHeight: 1.2 }}>
          {t.dashboard.title}
        </h1>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          {t.dashboard.exercisesWaiting(total)}
        </p>
      </div>

      {/* 📈 Динамика: две дорожки прогресса + карточки за день + серия */}
      <ProgressPanel progress={progress} />

      {/* 📊 Аналитика класса — для учителя (отчётность по ученикам) */}
      {user?.role === 'owner' && (
        <div style={{ padding: '4px 12px 8px' }}>
          <div style={{ fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 4, marginBottom: 10 }}>
            {t.dashboard.newForTeacher}
          </div>
          <div onClick={() => navigate('/analytics')} style={{
            cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(59,122,87,0.16), rgba(124,92,255,0.12))',
            border: '2px solid var(--accent)', borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 30, lineHeight: 1 }}>📊</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{t.nav.analytics}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t.dashboard.analyticsDesc}</div>
            </div>
            <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>NEW</span>
          </div>
        </div>
      )}

      {/* AI-тренер — над играми: живой разговор с Pablo */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 4, marginBottom: 10 }}>
          {t.dashboard.trainer}
        </div>
        <Link to="/ai-trainer" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(124,92,255,0.14), rgba(59,122,87,0.14))',
            border: '2px solid var(--accent)', borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, border: '2px solid var(--accent)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🤓</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✨ Hallo! Ich bin Pablo 👋</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t.dashboard.trainerDesc}</div>
            </div>
            <span style={{ fontSize: 22, flexShrink: 0 }}>🗣️</span>
          </div>
        </Link>
      </div>

      {/* ❤️ Любовь к детям — душа продукта: тёплые фразы для детей */}
      <div style={{ padding: '4px 12px 8px' }}>
        <Link to="/love" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(224,87,111,0.16), rgba(201,69,94,0.10))',
            border: '2px solid #e0576f', borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>❤️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{t.dashboard.loveTitle}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t.dashboard.loveDesc}</div>
            </div>
            <span style={{ fontSize: 18, flexShrink: 0 }}>→</span>
          </div>
        </Link>
      </div>

      {/* Игры */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 4, marginBottom: 10 }}>
          {t.dashboard.games}
        </div>
        {/* Быстрая тренировка по типу — по ВСЕМ урокам сразу */}
        {total > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={() => navigate('/exercise-session?type=multiple_choice')}
              style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 30, lineHeight: 1 }}>✅</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', display: 'block' }}>Выбери ответ</span>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Тест по всем словам</span>
              </span>
            </button>
            <button onClick={() => navigate('/exercise-session?type=flashcard')}
              style={{ flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 30, lineHeight: 1 }}>🃏</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', display: 'block' }}>Все карточки</span>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Флеш-карты по всем урокам</span>
              </span>
            </button>
          </div>
        )}
        <Link to="/game/match" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--surface)', border: '2px solid var(--accent)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>🃏</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{t.dashboard.matchTitle}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t.dashboard.matchDesc}</div>
            </div>
            <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>NEW</span>
          </div>
        </Link>
        <Link to="/game/crossword" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--surface)', border: '2px solid var(--accent)',
            borderRadius: 16, padding: '14px 16px', marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>🧩</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{t.dashboard.crossTitle}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t.dashboard.crossDesc}</div>
            </div>
            <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>NEW</span>
          </div>
        </Link>
        {/* 🎮 Игра класса — читаем фразы урока по очереди */}
        <div onClick={() => games.length && navigate(`/class-game/${games[0].id}`)}
          style={{
            background: 'var(--surface)', border: '2px solid var(--accent)', borderRadius: 16, padding: '14px 16px', marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 14, cursor: games.length ? 'pointer' : 'default', opacity: games.length ? 1 : 0.7,
          }}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>🎮</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{t.dashboard.classGameTitle}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              {games.length ? t.dashboard.classGameReady : t.dashboard.classGameNot}
            </div>
          </div>
          {games.length > 0 && <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>ГОТОВА</span>}
        </div>
      </div>

      {/* Поиск — когда карточек много, отобрать по теме */}
      {lessons.length > 5 && (
        <div style={{ padding: '0 12px 10px' }}>
          <input value={lessonQuery} onChange={e => setLessonQuery(e.target.value)}
            placeholder={t.dashboard.searchLesson}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }} />
        </div>
      )}

      {(() => {
        const q = lessonQuery.trim().toLowerCase()
        const match = l => !q || (getLessonTitle(l.lesson_title, l.lesson_title_translations, lang) || l.lesson_title || '').toLowerCase().includes(q)
        const shown = lessons.filter(match)
        const byNew = (a, b) => b.lesson_id - a.lesson_id
        // Закреплённые (⭐) — в самый верх, ДО наборов; остальное без них
        const pinnedItems = shown.filter(l => pinned.has(l.lesson_id)).sort(byNew)
        const setsAll = shown.filter(l => l.is_set && !pinned.has(l.lesson_id)).sort(byNew)
        const booksAll = shown.filter(l => !l.is_set && !pinned.has(l.lesson_id)).sort(byNew)
        // «Только сегодня»: показываем ОДИН текущий урок — с бо́льшим НОМЕРОМ урока (в дрипе это
        // фронтир, тот что на прохождении). По lesson_number (а не id!), чтобы совпадать с порядком
        // сессии и чтобы стендалон-уроки с высоким id не выдавались за «текущий». При поиске — все.
        const current = booksAll.length
          ? [...booksAll].sort((a, b) => (b.lesson_number ?? -1) - (a.lesson_number ?? -1) || b.lesson_id - a.lesson_id)[0]
          : null
        const books = (todayOnly && !q) ? (current ? [current] : []) : booksAll
        // Наборы — по тумблеру (но при активном поиске показываем всё, что нашлось)
        const sets = (showSets || q) ? setsAll : []
        const hiddenBooks = booksAll.length - books.length
        if (!shown.length) return <div style={{ color: 'var(--ink-soft)', padding: '8px 20px', fontSize: 14 }}>{t.dashboard.nothingFound}</div>
        const Card = l => (
          <LessonCard key={l.lesson_id} lesson={l} navigate={navigate} onReset={repeatLesson}
            pinned={pinned.has(l.lesson_id)} onTogglePin={() => togglePin(l.lesson_id)} />
        )
        return (
          <>
            {/* ⭐ Закреплённые — в самом верху, перед наборами */}
            {pinnedItems.length > 0 && (
              <>
                <div style={{ padding: '0 0 8px', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, paddingLeft: 20 }}>
                  ⭐ Закреплённые
                </div>
                <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {pinnedItems.map(Card)}
                </div>
              </>
            )}

            {/* 📚 Наборы по темам — глобальные, сверху (по тумблеру showSets, при поиске всегда) */}
            {sets.length > 0 && (
              <>
                <div style={{ padding: '0 0 8px', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 20 }}>
                  📚 {t.nav.sets || 'Наборы по темам'}
                </div>
                <div style={{ padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sets.map(Card)}
                </div>
              </>
            )}

            {/* Уроки — плоско, новый сверху. При «только сегодня» — один текущий + кнопка раскрыть */}
            <div style={{ padding: '6px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>
                {todayOnly && !q ? 'Сегодняшний урок' : t.dashboard.lessons}
              </span>
              {/* Счётчик всех уроков — только в режиме «все уроки». В «Сегодняшний урок» (один
                  урок) число «(15)» читалось как номер урока — убираем, чтобы не путало. */}
              {!(todayOnly && !q) && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>({booksAll.length})</span>}
            </div>
            <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {books.length ? books.map(Card) : <div style={{ color: 'var(--ink-soft)', padding: '4px 8px', fontSize: 14 }}>—</div>}
            </div>
            {hiddenBooks > 0 && (
              <div style={{ padding: '10px 12px 4px' }}>
                <button onClick={toggleTodayOnly} style={{
                  width: '100%', padding: '10px', borderRadius: 12, border: '1px solid var(--line)',
                  background: 'var(--surface)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}>
                  ▼ Показать все доступные уроки ({hiddenBooks})
                </button>
              </div>
            )}
          </>
        )
      })()}

      {/* Круглая кнопка камеры — сразу открывает фотоаппарат (capture), разбирает слова
          с фото и предлагает добавить их в урок / набор / новый урок. Над «Повторить всё». */}
      <CameraWords mode="sentences" renderTrigger={(pick, busy) => (
        <button
          onClick={pick}
          disabled={busy}
          title="Сфотографировать — разбор слов"
          style={{
            position: 'fixed', zIndex: 50,
            right: 16, bottom: `calc(var(--bottom-nav-h, 0px) + ${total > 0 ? 78 : 16}px)`,
            width: 52, height: 52, borderRadius: '50%',
            background: busy ? 'var(--accent)' : 'var(--surface)', color: busy ? 'var(--accent-ink)' : 'var(--ink)',
            border: '1px solid var(--line)', cursor: busy ? 'default' : 'pointer', fontSize: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
          {busy ? '…' : '📷'}
        </button>
      )} />

      {/* Круглая кнопка «Повторить всё» в правом нижнем углу — не перекрывает
          левое меню и контент (была на всю ширину по центру → налезала на сайдбар) */}
      {total > 0 && (
        <button
          onClick={() => navigate('/exercise-session')}
          style={{
            position: 'fixed', zIndex: 50,
            right: 16, bottom: 'calc(var(--bottom-nav-h, 0px) + 16px)',
            padding: '13px 20px', borderRadius: 999,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
          ▶ {t.dashboard.repeatAll}
          <span style={{ background: 'rgba(0,0,0,0.18)', color: 'inherit', borderRadius: 999, padding: '1px 9px', fontSize: 13 }}>
            {total}
          </span>
        </button>
      )}

      {/* Повторить пройденный урок — вернуть его в «Сегодня» */}
      {completed.length > 0 && (
        <div style={{ padding: '12px 12px 20px' }}>
          <div style={{ fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 4, marginBottom: 8 }}>
            {t.dashboard.repeatDone}
          </div>
          {completed.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: 'rgba(78,154,110,0.16)', color: 'var(--good)', flexShrink: 0 }}>✓ пройдено</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getLessonTitle(l.title, l.title_translations, lang)}
              </span>
              <button onClick={() => repeatLesson(l.id)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
                🔄 Повторить
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Реклама для бесплатных на планшете/десктопе (управляется супер-админкой) */}
      <AdSlot />
    </div>
  )
}

// 📈 Панель динамики: шкала «Уроки» + шкала «Слова» + карточки за день + серия дней
function ProgressPanel({ progress }) {
  if (!progress) return null
  const { lessons = {}, words = {}, cards = {}, streak = 0 } = progress
  const lPct = lessons.total ? Math.round((lessons.done / lessons.total) * 100) : 0
  const wPct = words.total ? Math.round((words.known / words.total) * 100) : 0
  const Bar = ({ pct, color }) => (
    <div style={{ height: 8, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width .5s' }} />
    </div>
  )
  return (
    <div style={{ padding: '4px 12px 10px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 14 }}>
        {/* Дорожка 1 — уроки */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>📘 Обучение по урокам</span>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{lessons.done ?? 0} / {lessons.total ?? 0}</span>
        </div>
        <Bar pct={lPct} color="var(--accent)" />

        {/* Дорожка 2 — слова (усиление знаний) */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>💪 Усиление знаний · слова</span>
          <span style={{ fontSize: 13, color: 'var(--good)', fontWeight: 700 }}>{words.known ?? 0} / {words.total ?? 0}</span>
        </div>
        <Bar pct={wPct} color="var(--good)" />

        {/* Карточки за день + серия */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 12, padding: '10px 6px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{cards.today ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>карточек сегодня</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 12, padding: '10px 6px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{cards.all ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>всего карточек</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', background: streak > 0 ? 'rgba(224,87,111,0.12)' : 'var(--surface-2)', borderRadius: 12, padding: '10px 6px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: streak > 0 ? '#e0576f' : 'var(--ink-soft)' }}>🔥 {streak}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>дней подряд</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LessonCard({ lesson, navigate, onReset, pinned, onTogglePin }) {
  const { t, lang } = useI18nStore()
  const { user } = useAuthStore()
  const [words, setWords]         = useState(null)
  const [showWords, setShowWords] = useState(true)     // слова раскрыты по умолчанию
  const [showExercises, setShowExercises] = useState(true) // упражнения раскрыты по умолчанию
  const [listening, setListening] = useState(false)
  const [gameBusy, setGameBusy]   = useState(false)

  // Сбросить прогресс урока и начать заново — доступно для любого урока,
  // не только для уже пройденных (см. блок «Повторить пройденное» выше)
  const handleReset = () => {
    // Сброс прогресса — серверная операция, офлайн недоступна
    if (navigator.onLine === false) { alert(t.offlineMode?.sectionTitle || 'Нужен интернет'); return }
    if (!window.confirm('Точно сбросить прогресс урока и пройти заново?')) return
    onReset(lesson.lesson_id)
  }

  // Учитель: собрать «Игру класса» из слов урока
  const makeClassGame = async () => {
    const n = window.prompt('Сколько фраз собрать для класса? (раздам ученикам по кругу)', '30')
    if (n === null) return
    setGameBusy(true)
    try {
      const res = await api.post('/class-games', { lesson_id: lesson.lesson_id, count: parseInt(n) || 30 })
      navigate(`/class-game/${res.id}`)
    } catch (e) { alert('Ошибка: ' + e.message); setGameBusy(false) }
  }

  const typeLabels = {
    flashcard:       t.exercise.flashcard,
    fill_blank:      t.exercise.fillBlank,
    multiple_choice: t.exercise.multipleChoice,
    sentence_write:  t.exercise.sentenceWrite,
    letter_fill:     t.exercise.letterFill,
    speech:          t.exercise.speech || 'Произношение',
    dictation:       t.exercise.dictation,
  }

  const loadWords = async () => {
    if (words === null) {
      // Офлайн — слова урока из локальной базы (собираются из упражнений)
      const data = await (navigator.onLine === false
        ? getOfflineLessonWords(lesson.lesson_id)
        : api.get(`/lessons/${lesson.lesson_id}/words`).catch(() => getOfflineLessonWords(lesson.lesson_id)))
      setWords(data)
      return data
    }
    return words
  }

  // Слова раскрыты по умолчанию — подгружаем их сразу при появлении карточки
  useEffect(() => { if (showWords && words === null) loadWords() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleWords = async () => {
    await loadWords()
    setShowWords(v => !v)
  }

  const handleListen = async () => {
    const wordList = await loadWords()
    if (!wordList?.length) return
    setListening(true)
    window.speechSynthesis.cancel()
    let idx = 0
    const speakNext = () => {
      if (idx >= wordList.length) { setListening(false); return }
      const utt = new SpeechSynthesisUtterance(wordList[idx].word_de)
      utt.lang = 'de-DE'
      utt.rate = 0.85
      utt.onend = () => { idx++; setTimeout(speakNext, 500) }
      window.speechSynthesis.speak(utt)
    }
    speakNext()
  }

  const chips = TYPE_ORDER.filter(type => lesson.byType[type])
  const wordsCount = lesson.words_count || 0

  // Бейдж прогресса урока
  const pct = lesson.done_pct ?? 0
  const badge = pct >= 80
    ? { label: `${t.dashboard.learnedPct} ${pct}%`, bg: 'rgba(78,154,110,0.15)', color: 'var(--good)' }
    : pct > 0
    ? { label: t.dashboard.statusProgress, bg: 'rgba(201,165,74,0.15)', color: 'var(--accent)' }
    : { label: t.dashboard.statusNew, bg: 'var(--surface-2)', color: 'var(--ink-soft)' }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', padding: 16,
    }}>
      {/* Шапка на всю ширину — клик по ней раскрывает/сворачивает список упражнений */}
      <div style={{ cursor: 'pointer' }} onClick={() => setShowExercises(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2,
          background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)', borderRadius: 8, padding: '8px 10px' }}>
          {onTogglePin && (
            <button onClick={(e) => { e.stopPropagation(); onTogglePin() }} title="Закрепить наверху"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, lineHeight: 1, flexShrink: 0, padding: 0, color: pinned ? 'var(--accent)' : 'var(--ink-soft)' }}>
              {pinned ? '⭐' : '☆'}
            </button>
          )}
          <div style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0, color: 'var(--ink)' }}>
            {getLessonTitle(lesson.lesson_title, lesson.lesson_title_translations, lang) || `Урок #${lesson.lesson_id}`}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: badge.bg, color: badge.color, flexShrink: 0 }}>
            {badge.label}
          </span>
        </div>
        {lesson.lesson_description && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
            {getLessonDesc(lesson.lesson_description, lesson.lesson_description_translations, lang)}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.dashboard.exercisesWaiting(lesson.total)}
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{showExercises ? '▲ свернуть' : '▼ упражнения'}</span>
        </div>
      </div>
      {/* Чипы типов упражнений — свёрнуты по умолчанию, раскрываются нижней полосой */}
      {showExercises && (
      <div className="chips-grid" style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {chips.map(type => (
          <button key={type}
            onClick={() => navigate(`/exercise-session?lesson_id=${lesson.lesson_id}&type=${type}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)', border: '1px solid var(--line)',
              borderRadius: 12, padding: '10px', fontSize: 13,
              color: 'var(--ink)', cursor: 'pointer', textAlign: 'left',
              minWidth: 0, overflow: 'hidden',
            }}>
            <span style={{ flexShrink: 0, fontSize: 16 }}>{TYPE_ICON[type]}</span>
            <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, borderRadius: 7, padding: '2px 7px', fontSize: 13, flexShrink: 0 }}>
              {lesson.byType[type]}
            </span>
            <span style={{ color: 'var(--ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {typeLabels[type]}
            </span>
          </button>
        ))}

        {/* 8-я плитка: живое произношение с AI-тренером Pablo (по словам урока) */}
        {wordsCount > 0 && (
          <button
            onClick={() => navigate(`/ai-trainer?lesson_id=${lesson.lesson_id}&lesson_title=${encodeURIComponent(getLessonTitle(lesson.lesson_title, lesson.lesson_title_translations, lang) || '')}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(59,122,87,0.16))',
              border: '1px solid var(--accent)', borderRadius: 12, padding: '10px', fontSize: 13,
              color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', minWidth: 0, overflow: 'hidden',
            }}>
            <span style={{ flexShrink: 0, fontSize: 15 }}>🗣️</span>
            <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {t.exercise.trainerSpeech || 'Произношение с тренером'}
            </span>
          </button>
        )}

        {/* Учитель: собрать «Игру класса» — фразы из урока раздаются ученикам */}
        {user?.role === 'owner' && wordsCount > 0 && (
          <button onClick={makeClassGame} disabled={gameBusy}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, rgba(201,165,74,0.18), rgba(124,92,255,0.14))',
              border: '1px solid var(--accent)', borderRadius: 12, padding: '10px', fontSize: 13,
              color: 'var(--ink)', cursor: gameBusy ? 'default' : 'pointer', textAlign: 'left', minWidth: 0, overflow: 'hidden', opacity: gameBusy ? 0.6 : 1,
            }}>
            <span style={{ flexShrink: 0, fontSize: 15 }}>🎮</span>
            <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {gameBusy ? 'Собираю…' : 'Игра класса'}
            </span>
          </button>
        )}

        {/* Учитель: отчёт по уроку — где буксует группа + как идут ученики */}
        {user?.role === 'owner' && wordsCount > 0 && (
          <button onClick={() => navigate(`/lesson-report/${lesson.lesson_id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--accent)', borderRadius: 12, padding: '10px', fontSize: 13,
              color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', minWidth: 0, overflow: 'hidden',
            }}>
            <span style={{ flexShrink: 0, fontSize: 15 }}>📊</span>
            <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              Отчёт по уроку
            </span>
          </button>
        )}
      </div>
      )}

      {/* Кнопка «Зачёт по уроку» — под упражнениями, на всю ширину */}
      <button
        onClick={() => navigate(`/exercise-session?lesson_id=${lesson.lesson_id}`)}
        style={{
          width: '100%', marginTop: 14, boxSizing: 'border-box',
          background: 'var(--accent)', color: 'var(--accent-ink)',
          border: 'none', borderRadius: 12, padding: '11px 16px',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        ✅ {t.dashboard.exam || 'Зачёт по уроку'}
      </button>

      {/* Слова урока — нижняя панель (с переносом, чтобы иконки не вылезали за экран) */}
      <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Кнопка Прослушать */}
        {wordsCount > 0 && (
          <button
            onClick={handleListen}
            disabled={listening}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: listening ? 'var(--accent-soft)' : 'var(--surface-2)',
              border: `1px solid ${listening ? 'var(--accent)' : 'var(--line)'}`,
              color: listening ? 'var(--accent)' : 'var(--ink-soft)',
              borderRadius: 10, padding: '7px 12px', fontSize: 12.5,
              cursor: listening ? 'default' : 'pointer', fontWeight: 500,
              flexShrink: 0,
            }}>
            <i className={`bi ${listening ? 'bi-volume-up-fill' : 'bi-volume-up'}`} style={{ fontSize: 14 }} />
            {t.dashboard.listen}
          </button>
        )}

        {/* Сбросить прогресс — начать урок заново (не только для завершённых) */}
        {onReset && (
          <button
            onClick={handleReset}
            title="Сбросить прогресс и пройти урок заново"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--surface-2)', border: '1px solid var(--line)',
              color: 'var(--ink-soft)', borderRadius: 10, padding: '7px 12px', fontSize: 12.5,
              cursor: 'pointer', fontWeight: 500, flexShrink: 0,
            }}>
            🔄 Сбросить
          </button>
        )}

        {/* Свернуть/раскрыть упражнения */}
        <button onClick={() => setShowExercises(v => !v)} title="Показать/скрыть упражнения"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: showExercises ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `1px solid ${showExercises ? 'var(--accent)' : 'var(--line)'}`,
            color: showExercises ? 'var(--accent)' : 'var(--ink-soft)',
            borderRadius: 10, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 500, flexShrink: 0,
          }}>
          ✏️ {lesson.total} {showExercises ? '▲' : '▼'}
        </button>

        {/* Учитель: печатный лист упражнений урока (A4) — открывается в новой вкладке */}
        {user?.role === 'owner' && wordsCount > 0 && (
          <button
            onClick={() => window.open(`/print/${lesson.lesson_id}`, '_blank')}
            title="Распечатать лист упражнений (A4)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'var(--surface-2)', border: '1px solid var(--line)',
              color: 'var(--ink-soft)', borderRadius: 10, padding: '7px 12px', fontSize: 12.5,
              cursor: 'pointer', fontWeight: 500, flexShrink: 0,
            }}>
            🖨️
          </button>
        )}

        {/* Раскрыть/скрыть слова */}
        <button onClick={toggleWords} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none',
          color: 'var(--ink-soft)', fontSize: 13,
          cursor: 'pointer', padding: '7px 4px',
        }}>
          <span style={{ fontWeight: 500 }}>
            {t.dashboard.lessonWords}
            {wordsCount > 0 && <span style={{ marginLeft: 6, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 7px', fontSize: 12, color: 'var(--ink-soft)' }}>{wordsCount}</span>}
          </span>
          <span style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>
            {showWords ? '▲' : '▼'}
          </span>
        </button>
      </div>

      {showWords && words && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {words.map(w => {
            const translation = getTranslation(w.translations, lang, w.translation_ru)
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{w.word_de}</span>
                <SpeakButton text={w.word_de} size={14} appendText={translation} />
                <span style={{ color: 'var(--ink-soft)' }}>—</span>
                <span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{translation}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
