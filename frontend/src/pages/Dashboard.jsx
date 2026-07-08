import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

const TYPE_ORDER = ['multiple_choice', 'flashcard', 'letter_fill', 'fill_blank', 'sentence_write', 'dictation']
const TYPE_ICON  = { multiple_choice: 'bi-check-square-fill', flashcard: 'bi-card-text', letter_fill: 'bi-fonts', fill_blank: 'bi-pencil-fill', sentence_write: 'bi-pen-fill', dictation: 'bi-mic-fill' }

// Кольцо прогресса
function ProgressRing({ pct, done, total }) {
  const size = 88
  const r = 36
  const circ = 2 * Math.PI * r
  // Минимум 4% чтобы кольцо было видно даже при малом прогрессе
  const dash = circ * (Math.max(pct, pct > 0 ? 4 : 0) / 100)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Фон кольца */}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
        {/* Прогресс */}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .8s cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.4 }}>{done}/{done+total}</span>
      </div>
    </div>
  )
}

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

  const total   = stats?.total ?? 0
  const lessons      = stats?.lessons ?? []
  const done         = stats?.done ?? 0
  const all          = total + done
  const pct          = all > 0 ? Math.round((done / all) * 100) : 100
  const lessonsTotal = stats?.lessonsTotal ?? 0
  const lessonsDone  = stats?.lessonsDone ?? 0
  const lessonsPct   = lessonsTotal > 0 ? Math.round((lessonsDone / lessonsTotal) * 100) : 0

  if (total === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          {t.dashboard.allDone}
        </div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 15 }}>{t.dashboard.comeBack}</div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <style>{`.chips-grid { grid-template-columns: 1fr; } @media (min-width: 480px) { .chips-grid { grid-template-columns: 1fr 1fr; } }`}</style>
      {/* Hero */}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {/* Левая метрика — упражнения */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
            <ProgressRing pct={pct} done={done} total={total} />
            <div>
              <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px', lineHeight: 1.1 }}>
                {t.dashboard.title}
              </h1>
              <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 13 }}>
                {t.dashboard.exercisesWaiting(total)}
              </p>
              <p style={{ margin: '2px 0 0', color: 'var(--ink-soft)', fontSize: 12 }}>
                Пройдено: {done}
              </p>
            </div>
          </div>
          {/* Правая метрика — уроки */}
          {lessonsTotal > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <ProgressRing pct={lessonsPct} done={lessonsDone} total={lessonsTotal - lessonsDone} />
              <span style={{ fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center', letterSpacing: '0.5px' }}>
                {t.lessons.title}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Уроки */}
      <div style={{ padding: '0 0 8px', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600, paddingLeft: 20 }}>
        Уроки
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lessons.map(lesson => (
          <LessonCard key={lesson.lesson_id} lesson={lesson} navigate={navigate} />
        ))}
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 640,
        padding: '12px 16px 20px',
        background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
      }}>
        <button
          onClick={() => navigate('/exercise-session')}
          style={{
            width: '100%', padding: '16px', borderRadius: 16,
            background: 'var(--ink)', color: 'var(--bg)',
            border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          }}>
          ▶ Повторить всё
          <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 8, padding: '2px 10px', fontSize: 13 }}>
            {total}
          </span>
        </button>
      </div>
    </div>
  )
}

function LessonCard({ lesson, navigate }) {
  const { t } = useI18nStore()
  const [words, setWords]       = useState(null)
  const [showWords, setShowWords] = useState(false)

  const typeLabels = {
    flashcard:       t.exercise.flashcard,
    fill_blank:      t.exercise.fillBlank,
    multiple_choice: t.exercise.multipleChoice,
    sentence_write:  t.exercise.sentenceWrite,
    letter_fill:     t.exercise.letterFill,
  }

  const toggleWords = async () => {
    if (!showWords && words === null) {
      const data = await api.get(`/lessons/${lesson.lesson_id}/words`)
      setWords(data)
    }
    setShowWords(v => !v)
  }

  const total   = lesson.total
  const chips   = TYPE_ORDER.filter(type => lesson.byType[type])

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', padding: 16,
    }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📚 {lesson.lesson_title || `Урок #${lesson.lesson_id}`}
          </div>
          {lesson.lesson_description && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, fontStyle: 'italic' }}>
              {lesson.lesson_description}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>
            {total} карточек ждут повторения
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
          ▶ Начать
        </button>
      </div>

      {/* Чипы типов упражнений — 2 колонки на wide, 1 на мобиле */}
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

      {/* Прогресс-бар */}
      <div style={{ height: 4, borderRadius: 3, background: 'var(--red)', marginTop: 14, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: '40%', background: 'var(--accent)', borderRadius: 3 }} />
      </div>

      {/* Слова урока */}
      <button onClick={toggleWords} style={{
        marginTop: 12, width: '100%', textAlign: 'left',
        background: 'none', border: 'none', borderTop: '1px solid var(--line)',
        paddingTop: 12, color: 'var(--ink-soft)', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        Слова урока {words !== null ? `(${words.length})` : ''}
        <span>{showWords ? '▲' : '▾'}</span>
      </button>

      {showWords && words && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {words.map(w => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{w.word_de}</span>
              <SpeakButton text={w.word_de} size={14} appendText={w.translation_ru} />
              <span style={{ color: 'var(--ink-soft)' }}>—</span>
              <span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{w.translation_ru}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
