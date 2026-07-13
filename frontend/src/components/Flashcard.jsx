import { useState, useEffect, useRef } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'
import AvatarReaction from './AvatarReaction.jsx'
import { getTranslation } from '../utils/translation.js'
import { JustifyHint } from './ExerciseActions.jsx'

export default function Flashcard({ payload, onAnswer, lessonTitle, imageUrl, translations, translationRu }) {
  const [revealed, setRevealed] = useState(false)
  const [reaction, setReaction] = useState(null)
  const [grading, setGrading]   = useState(false)
  const gradeRef = useRef(0)
  const { t, lang } = useI18nStore()

  useEffect(() => { speakAuto(payload.question) }, [payload.question])

  const answer = getTranslation(translations, lang, translationRu || payload.answer)

  const reveal = () => { setRevealed(true) }

  // Оценка: Pablo реагирует клипом (Помню→верно, Забыл→неверно), листаем ПОСЛЕ клипа
  const grade = (q) => {
    if (grading) return
    setGrading(true)
    gradeRef.current = q
    if (q === 3) { setTimeout(() => onAnswer(q), 300); return }  // «Сложно» — без клипа
    setReaction(q >= 4 ? 'correct' : 'wrong')
  }

  return (
    <div>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <div
        onClick={!revealed ? reveal : undefined}
        className="exercise-card"
        style={{
          border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden',
          cursor: revealed ? 'default' : 'pointer',
          background: 'var(--surface)', marginBottom: 16, userSelect: 'none',
        }}
      >
        <AvatarReaction imageUrl={imageUrl} wordDe={payload.question} reaction={reaction}
          onReactionEnd={() => onAnswer(gradeRef.current)} />

        <div className="exercise-card-content" style={{ padding: '24px 24px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, textAlign: 'center', color: 'var(--ink)' }} dir="ltr">
            {payload.question}
          </div>
          <SpeakButton text={payload.question} size={22} />
        </div>

        {revealed
          ? <div style={{ fontSize: 26, color: 'var(--accent)', textAlign: 'center', borderTop: '1px solid var(--line)', paddingTop: 16, width: '100%' }}>
              {answer}
            </div>
          : <div style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{t.exercise.tapToReveal}</div>
        }
        </div>
      </div>

      {/* Подсказка «Обоснуй» — доступна до и после переворота */}
      <JustifyHint wordDe={payload.question} correctAnswer={payload.answer} type="flashcard" />

      {revealed && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, opacity: grading ? 0.6 : 1, pointerEvents: grading ? 'none' : 'auto' }}>
          <button onClick={() => grade(1)} style={{ ...answerBtn, background: 'var(--red)' }}>
            {t.exercise.forgot}
          </button>
          <button onClick={() => grade(3)} style={{ ...answerBtn, background: '#B07D1B' }}>
            {t.exercise.hard}
          </button>
          <button onClick={() => grade(5)} style={{ ...answerBtn, background: 'var(--good)' }}>
            {t.exercise.remembered}
          </button>
        </div>
      )}
    </div>
  )
}

const answerBtn = {
  flex: 1, padding: 12, color: '#fff', border: 'none', borderRadius: 10,
  cursor: 'pointer', fontSize: 15, fontWeight: 600,
}
