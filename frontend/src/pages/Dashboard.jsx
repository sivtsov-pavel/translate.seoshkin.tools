import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import { getTranslation, getLessonTitle } from '../utils/translation.js'

const TYPE_ORDER = ['multiple_choice', 'flashcard', 'letter_fill', 'fill_blank', 'sentence_write', 'speech', 'dictation']
const TYPE_ICON  = { multiple_choice: 'bi-check-square-fill', flashcard: 'bi-card-text', letter_fill: 'bi-fonts', fill_blank: 'bi-pencil-fill', sentence_write: 'bi-pen-fill', speech: 'bi-soundwave', dictation: 'bi-mic-fill' }

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useI18nStore()

  useEffect(() => {
    api.get('/exercises/stats').then(setStats).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
      {t.dashboard.loading}
    </div>
  )

  const total        = stats?.total ?? 0
  const lessons      = stats?.lessons ?? []

  if (total === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontFamily: 'var(--heading-font, Georgia, serif)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {t.dashboard.allDone}
        </div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{t.dashboard.comeBack}</div>
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

      {/* Игры — наверху, первыми */}
      <div style={{ padding: '4px 12px 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 4, marginBottom: 10 }}>
          Игры
        </div>
        <Link to="/game/match" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--surface)', border: '2px solid var(--accent)',
            borderRadius: 16, padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 32, lineHeight: 1 }}>🃏</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>Словопара</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Найди пары слов — 8 пар, таймер, 4×4</div>
            </div>
            <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>NEW</span>
          </div>
        </Link>
      </div>

      {/* Секция уроков */}
      <div style={{ padding: '0 0 8px', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 20 }}>
        {t.dashboard.lessons}
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lessons.map(lesson => (
          <LessonCard key={lesson.lesson_id} lesson={lesson} navigate={navigate} />
        ))}
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
    </div>
  )
}

function LessonCard({ lesson, navigate }) {
  const { t, lang } = useI18nStore()
  const [words, setWords]         = useState(null)
  const [showWords, setShowWords] = useState(false)
  const [listening, setListening] = useState(false)

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
    ? { label: `выучено ${pct}%`, bg: 'rgba(78,154,110,0.15)', color: 'var(--good)' }
    : pct > 0
    ? { label: 'в процессе', bg: 'rgba(201,165,74,0.15)', color: 'var(--accent)' }
    : { label: 'новое', bg: 'var(--surface-2)', color: 'var(--ink-soft)' }

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
              {lesson.lesson_description}
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
            <i className={`bi ${TYPE_ICON[type]}`} style={{ flexShrink: 0, fontSize: 15 }} />
            <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, borderRadius: 7, padding: '2px 7px', fontSize: 13, flexShrink: 0 }}>
              {lesson.byType[type]}
            </span>
            <span style={{ color: 'var(--ink-soft)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {typeLabels[type]}
            </span>
          </button>
        ))}
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
