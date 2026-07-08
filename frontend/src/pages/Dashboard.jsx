import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

const TYPE_ORDER = ['multiple_choice', 'flashcard', 'letter_fill', 'fill_blank', 'sentence_write']
const TYPE_ICON  = { flashcard: '🃏', fill_blank: '✏️', multiple_choice: '☑️', sentence_write: '✍️', letter_fill: '🔤' }

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useI18nStore()

  useEffect(() => {
    api.get('/exercises/stats').then(setStats).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <p>{t.dashboard.loading}</p>

  const total   = stats?.total ?? 0
  const lessons = stats?.lessons ?? []

  if (total === 0) {
    return (
      <div>
        <h1>{t.dashboard.title}</h1>
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <p style={{ fontSize: 40 }}>🎉</p>
          <p style={{ fontSize: 20, fontWeight: 600 }}>{t.dashboard.allDone}</p>
          <p style={{ color: '#6b7280' }}>{t.dashboard.comeBack}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1>{t.dashboard.title}</h1>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 16 }}>
        {t.dashboard.exercisesWaiting(total)}
      </p>

      {/* Карточки по урокам */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
        {lessons.map(lesson => (
          <LessonCard key={lesson.lesson_id} lesson={lesson} navigate={navigate} />
        ))}
      </div>

      {/* Общее тестирование */}
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 24 }}>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
          Все уроки вместе
        </p>
        <button
          onClick={() => navigate('/exercise-session')}
          style={{ width: '100%', maxWidth: 400, padding: '14px 32px', fontSize: 16, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
          ▶ {t.dashboard.startSession} — все {total} карточек
        </button>
      </div>
    </div>
  )
}

function LessonCard({ lesson, navigate }) {
  const { t } = useI18nStore()
  const [words, setWords]       = useState(null)   // null = не загружены
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

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
      backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.04)',
    }}>
      {/* Шапка карточки */}
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e1b4b' }}>
              📚 {lesson.lesson_title || `Урок #${lesson.lesson_id}`}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {lesson.total} карточек ждут повторения
            </div>
          </div>
          <button
            onClick={() => navigate(`/exercise-session?lesson_id=${lesson.lesson_id}`)}
            style={{
              padding: '8px 20px', backgroundColor: '#4f46e5', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
              whiteSpace: 'nowrap',
            }}>
            ▶ Начать
          </button>
        </div>

        {/* Типы упражнений */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {TYPE_ORDER.filter(type => lesson.byType[type]).map(type => { const count = lesson.byType[type]; return (
            <button
              key={type}
              onClick={() => navigate(`/exercise-session?lesson_id=${lesson.lesson_id}&type=${type}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20, fontSize: 13,
                border: '1px solid #e5e7eb', backgroundColor: '#f9fafb',
                cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#818cf8'; e.currentTarget.style.backgroundColor = '#eef2ff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.backgroundColor = '#f9fafb' }}
            >
              <span>{TYPE_ICON[type]}</span>
              <span style={{ fontWeight: 700, color: '#4f46e5' }}>{count}</span>
              <span style={{ color: '#6b7280' }}>{typeLabels[type]}</span>
            </button>
          )})}
        </div>

        {/* Кнопка показать слова */}
        <button onClick={toggleWords}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6b7280', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {showWords ? '▲' : '▼'} Слова урока {words !== null ? `(${words.length})` : ''}
        </button>
      </div>

      {/* Список слов */}
      {showWords && (
        <div style={{ borderTop: '1px solid #f3f4f6', backgroundColor: '#fafafa', padding: '12px 20px' }}>
          {words === null ? (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Загрузка...</p>
          ) : words.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Нет слов</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px 16px' }}>
              {words.map(w => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                  <SpeakButton text={w.word_de} size={14} />
                  <span style={{ fontWeight: 600 }}>{w.word_de}</span>
                  <span style={{ color: '#9ca3af' }}>—</span>
                  <span style={{ color: '#6b7280' }}>{w.translation_ru}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
