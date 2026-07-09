import { useState, useEffect, useRef } from 'react'
import { speak } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'

export default function Dictation({ payload, onAnswer, lessonTitle, translations, translationRu }) {
  const { word_de, translation_ru } = payload
  const [input, setInput]     = useState('')
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const inputRef              = useRef(null)
  const { t, lang }           = useI18nStore()

  const displayTranslation = translations?.[lang] || translationRu || translation_ru

  useEffect(() => {
    setTimeout(() => speak(word_de, 'de-DE', 0.8), 300)
    inputRef.current?.focus()
  }, [word_de])

  const check = () => {
    const isCorrect = input.trim().toLowerCase() === word_de.trim().toLowerCase()
    setCorrect(isCorrect)
    setChecked(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!checked) { if (input.trim()) check() }
      else onAnswer(correct ? 5 : 1, input.trim())
    }
  }

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {lessonTitle}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--surface-2)', borderRadius: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {t.exercise.translationLabel}
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>
          {displayTranslation}
        </div>
        <button
          onClick={() => speak(word_de, 'de-DE', 0.8)}
          style={{ marginTop: 14, padding: '6px 16px', borderRadius: 20, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>
          🔊 {t.exercise.listenAgain}
        </button>
      </div>

      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t.exercise.enterWord}
        disabled={checked}
        style={{
          width: '100%', padding: '14px 16px', fontSize: 20,
          borderRadius: 12, textAlign: 'center', fontFamily: 'Georgia,serif',
          border: `2px solid ${checked ? (correct ? 'var(--good)' : 'var(--red)') : 'var(--line)'}`,
          background: 'var(--surface)', color: 'var(--ink)',
          transition: 'border-color .2s',
        }}
      />

      {!checked ? (
        <button onClick={check} disabled={!input.trim()}
          style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: input.trim() ? 1 : 0.5 }}>
          {t.exercise.checkAnswer}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {correct ? (
            <div style={{ textAlign: 'center', color: 'var(--good)', fontWeight: 700, fontSize: 22 }}>
              ✓ {t.exercise.correct}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px', background: 'var(--surface-2)', borderRadius: 12 }}>
              <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>✗ {t.exercise.wrong}</div>
              <div style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, fontFamily: 'Georgia,serif' }}>{word_de}</div>
            </div>
          )}
          <button onClick={() => onAnswer(correct ? 5 : 1, input.trim())}
            style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.next}
          </button>
        </div>
      )}
    </div>
  )
}
