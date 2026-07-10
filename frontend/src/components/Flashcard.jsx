import { useState, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'
import WordImage from './WordImage.jsx'
import { getTranslation } from '../utils/translation.js'

export default function Flashcard({ payload, onAnswer, lessonTitle, imageUrl, translations, translationRu }) {
  const [revealed, setRevealed] = useState(false)
  const { t, lang } = useI18nStore()

  useEffect(() => { speakAuto(payload.question) }, [payload.question])

  const answer = getTranslation(translations, lang, translationRu || payload.answer)

  const reveal = () => { setRevealed(true) }

  return (
    <div>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <div
        onClick={!revealed ? reveal : undefined}
        style={{
          border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden',
          cursor: revealed ? 'default' : 'pointer',
          background: 'var(--surface)', marginBottom: 16, userSelect: 'none',
        }}
      >
        <WordImage imageUrl={imageUrl} wordDe={payload.question} bleed />

        <div style={{ padding: '24px 24px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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

      {revealed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAnswer(1)} style={{ ...answerBtn, background: 'var(--red)' }}>
            {t.exercise.forgot}
          </button>
          <button onClick={() => onAnswer(3)} style={{ ...answerBtn, background: '#B07D1B' }}>
            {t.exercise.hard}
          </button>
          <button onClick={() => onAnswer(5)} style={{ ...answerBtn, background: 'var(--good)' }}>
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
