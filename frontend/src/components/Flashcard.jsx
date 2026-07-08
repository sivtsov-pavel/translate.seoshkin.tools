import { useState, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'
import WordImage from './WordImage.jsx'

export default function Flashcard({ payload, onAnswer, lessonTitle }) {
  const [revealed, setRevealed] = useState(false)
  const { t } = useI18nStore()

  // Автопроизношение немецкого слова при появлении карточки
  useEffect(() => {
    speakAuto(payload.question)
  }, [payload.question])

  const reveal = () => {
    setRevealed(true)
  }

  return (
    <div>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: '#a5b4fc', marginBottom: 8, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <div
        onClick={!revealed ? reveal : undefined}
        style={{
          minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', border: '2px solid #e5e7eb', borderRadius: 12,
          padding: 32, cursor: revealed ? 'default' : 'pointer',
          backgroundColor: '#fafafa', marginBottom: 16, userSelect: 'none',
          transition: 'border-color .2s',
        }}
      >
          {/* Картинка по слову */}
        <WordImage wordDe={payload.question} size={280} />

        {/* Немецкое слово + кнопка произнести */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, textAlign: 'center' }}>
            {payload.question}
          </div>
          <SpeakButton text={payload.question} size={22} />
        </div>

        {revealed
          ? <div style={{ fontSize: 26, color: '#4f46e5', textAlign: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 16, width: '100%' }}>{payload.answer}</div>
          : <div style={{ color: '#9ca3af', fontSize: 14 }}>{t.exercise.tapToReveal}</div>}
      </div>

      {revealed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAnswer(1)} style={{ ...answerBtn, backgroundColor: '#ef4444' }}>
            {t.exercise.forgot}
          </button>
          <button onClick={() => onAnswer(3)} style={{ ...answerBtn, backgroundColor: '#f59e0b' }}>
            {t.exercise.hard}
          </button>
          <button onClick={() => onAnswer(5)} style={{ ...answerBtn, backgroundColor: '#10b981' }}>
            {t.exercise.remembered}
          </button>
        </div>
      )}
    </div>
  )
}

const answerBtn = {
  flex: 1, padding: 12, color: '#fff', border: 'none', borderRadius: 6,
  cursor: 'pointer', fontSize: 15, fontWeight: 500,
}
