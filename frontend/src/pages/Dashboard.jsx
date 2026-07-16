import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import { getTranslation, getLessonTitle, getLessonDesc } from '../utils/translation.js'
import AdSlot from '../components/AdSlot.jsx'

const TYPE_ORDER = ['multiple_choice', 'flashcard', 'letter_fill', 'fill_blank', 'sentence_write', 'speech', 'dictation']
const TYPE_ICON  = { multiple_choice: '☑️', flashcard: '🃏', letter_fill: '🔤', fill_blank: '✏️', sentence_write: '✍️', speech: '🗣️', dictation: '🎙️' }

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState([])
  const [completed, setCompleted] = useState([])
  const [lessonQuery, setLessonQuery] = useState('')
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const { user } = useAuthStore()

  const reloadStats = () => {
    api.get('/exercises/stats').then(setStats).catch(console.error).finally(() => setLoading(false))
    api.get('/exercises/completed-lessons').then(setCompleted).catch(() => {})
  }
  useEffect(() => {
    reloadStats()
    api.get('/class-games').then(rows => setGames((rows || []).filter(g => g.status === 'ready'))).catch(() => {})
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
  const lessons      = stats?.lessons ?? []

  if (total === 0) {
    return (
      <div style={{ paddingTop: 12 }}>
        {gameBanner}
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            {t.dashboard.allDone}
          </div>
          <div style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{t.dashboard.comeBack}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <style>{`.chips-grid { grid-template-columns: 1fr; } @media (min-width: 480px) { .chips-grid { grid-template-columns: 1fr 1fr; } }`}</style>

      {/* Hero — просто заголовок и счёт */}
      <div style={{ padding: '20px 20px 14px' }}>
        <h1 style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 22, margin: '0 0 6px', lineHeight: 1.2 }}>
          {t.dashboard.title}
        </h1>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          {t.dashboard.exercisesWaiting(total)}
        </p>
      </div>

      {gameBanner}

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

      {/* Секция уроков */}
      <div style={{ padding: '0 0 8px', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 20 }}>
        {t.dashboard.lessons}
      </div>

      {/* Поиск по урокам — когда их много, отобрать по теме */}
      {lessons.length > 5 && (
        <div style={{ padding: '0 12px 10px' }}>
          <input value={lessonQuery} onChange={e => setLessonQuery(e.target.value)}
            placeholder={t.dashboard.searchLesson}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }} />
        </div>
      )}

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(() => {
          const q = lessonQuery.trim().toLowerCase()
          const shown = q
            ? lessons.filter(l => (getLessonTitle(l.lesson_title, l.lesson_title_translations, lang) || '').toLowerCase().includes(q))
            : lessons
          if (!shown.length) return <div style={{ color: 'var(--ink-soft)', padding: '8px 8px', fontSize: 14 }}>{t.dashboard.nothingFound}</div>
          return shown.map(lesson => (
            <LessonCard key={lesson.lesson_id} lesson={lesson} navigate={navigate} onReset={repeatLesson} />
          ))
        })()}
      </div>

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

function LessonCard({ lesson, navigate, onReset }) {
  const { t, lang } = useI18nStore()
  const { user } = useAuthStore()
  const [words, setWords]         = useState(null)
  const [showWords, setShowWords] = useState(false)
  const [listening, setListening] = useState(false)
  const [gameBusy, setGameBusy]   = useState(false)

  // Сбросить прогресс урока и начать заново — доступно для любого урока,
  // не только для уже пройденных (см. блок «Повторить пройденное» выше)
  const handleReset = () => {
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
      const data = await api.get(`/lessons/${lesson.lesson_id}/words`)
      setWords(data)
      return data
    }
    return words
  }

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
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <div style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 18, fontWeight: 700 }}>
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
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>
            {t.dashboard.exercisesWaiting(lesson.total)}
          </div>
        </div>
        <button
          onClick={() => navigate(`/exercise-session?lesson_id=${lesson.lesson_id}`)}
          style={{
            background: 'var(--accent)', color: 'var(--accent-ink)',
            border: 'none', borderRadius: 12, padding: '10px 16px',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
          ▶ {t.dashboard.start}
        </button>
      </div>

      {/* Чипы типов упражнений */}
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
      </div>

      {/* Слова урока — нижняя панель */}
      <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
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
