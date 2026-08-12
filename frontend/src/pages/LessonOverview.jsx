import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle } from '../utils/translation.js'

// Обзор урока в режиме новичка — макет 2b.
//
// Разница с прежней карточкой: урок показан не россыпью упражнений с цифрами, а
// последовательностью ШАГОВ. Ученик видит, какой шаг сейчас, и жмёт одну кнопку
// «Продолжить». Пройденные шаги — с галочкой, будущие приглушены.
//
// Порядок шагов повторяет учебную логику: сначала знакомство со словами, потом
// узнавание, потом воспроизведение, в конце — речь и фразы.
const STEP_ORDER = ['flashcard', 'multiple_choice', 'letter_fill', 'fill_blank',
                    'sentence_write', 'conjugation', 'declension', 'dictation', 'speech']

const STEP_ICON = {
  flashcard: '🃏', multiple_choice: '✅', letter_fill: '🔤', fill_blank: '✏️',
  sentence_write: '📝', conjugation: '🧩', declension: '📐', dictation: '🎧', speech: '🎤',
}

export default function LessonOverview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get(`/path/lesson/${id}`).then(setData).catch(() => setData({ error: true }))
  }, [id])

  if (!data) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.common.loading}</div>
  if (data.error) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.phrases.empty}</div>

  const { lesson, steps, phrases, total, done, minutes } = data
  const labels = {
    flashcard: t.exercise.flashcard, multiple_choice: t.exercise.multipleChoice,
    letter_fill: t.exercise.letterFill, fill_blank: t.exercise.fillBlank,
    sentence_write: t.exercise.sentenceWrite, conjugation: t.exercise.conjugation,
    declension: t.exercise.declension || 'Падежи', dictation: t.exercise.dictation,
    speech: t.exercise.speech || 'Произношение',
  }

  const ordered = STEP_ORDER.map(type => steps.find(s => s.type === type)).filter(Boolean)
  // Текущий шаг — первый незакрытый: именно на него ведёт большая кнопка внизу
  const currentType = ordered.find(s => s.done < s.total)?.type
  const title = getLessonTitle(lesson.title, lesson.title_translations, lang) || `${t.path.lesson} ${lesson.lesson_number ?? ''}`

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate('/')} style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', fontSize: 17 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{t.path.lesson} {lesson.lesson_number ?? ''}</div>
      </div>

      {/* Герой-карточка: название, из чего состоит урок, полоски прогресса */}
      <div style={{ borderRadius: 26, padding: 24, marginBottom: 20, background: 'linear-gradient(135deg, #6B3AA0, #4A2570)', color: '#fff' }}>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 8 }}>
          {lesson.words_count} {t.path.wordsShort} · {ordered.length + (phrases ? 1 : 0)} {t.path.stepsShort} · ~{minutes} {t.path.minShort}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 16 }}>
          {ordered.map(s => (
            <div key={s.type} style={{
              flex: 1, height: 8, borderRadius: 4,
              background: s.done >= s.total ? '#E8B024' : 'rgba(255,255,255,0.28)',
            }} />
          ))}
        </div>
      </div>

      {/* Шаги урока */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ordered.map((s, i) => {
          const isDone = s.done >= s.total
          const isCurrent = s.type === currentType
          return (
            <button key={s.type} onClick={() => navigate(`/exercise-session?lesson_id=${id}&type=${s.type}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 20,
                border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--line)',
                background: isCurrent ? 'var(--accent-soft, rgba(232,176,36,0.12))' : 'var(--surface)',
                cursor: 'pointer', textAlign: 'left', opacity: isDone ? 0.75 : 1,
              }}>
              <span style={{
                width: 44, height: 44, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                background: isDone ? '#2E7D63' : isCurrent ? 'var(--accent)' : 'var(--surface-2)',
                color: isDone ? '#E8F7F0' : isCurrent ? 'var(--accent-ink)' : 'var(--ink-soft)',
                fontWeight: 800, fontSize: 17,
              }}>{isDone ? '✓' : i + 1}</span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{STEP_ICON[s.type]} {labels[s.type] || s.type}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{s.done} / {s.total}</div>
              </span>
            </button>
          )
        })}

        {/* Фразы — отдельный шаг, как в макете («Скажи вслух») */}
        {phrases?.total > 0 && (
          <button onClick={() => navigate(`/phrases/lesson/${id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 20,
              border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left',
            }}>
            <span style={{
              width: 44, height: 44, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
              background: phrases.done >= phrases.total ? '#2E7D63' : 'var(--surface-2)',
              color: phrases.done >= phrases.total ? '#E8F7F0' : 'var(--ink-soft)', fontWeight: 800, fontSize: 17,
            }}>{phrases.done >= phrases.total ? '✓' : ordered.length + 1}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🗣 {t.phrases.lessonSet}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{phrases.done} / {phrases.total}</div>
            </span>
          </button>
        )}
      </div>

      {/* Одна яркая кнопка — принцип макета «один следующий шаг» */}
      <button onClick={() => navigate(currentType ? `/exercise-session?lesson_id=${id}&type=${currentType}` : `/exercise-session?lesson_id=${id}`)}
        style={{
          width: '100%', marginTop: 22, minHeight: 60, borderRadius: 18, border: 'none',
          background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 18, fontWeight: 700, cursor: 'pointer',
        }}>
        {done >= total && total > 0 ? `✓ ${t.exercise.lessonPassed}` : `${t.path.start} · ${done}/${total}`}
      </button>
    </div>
  )
}
