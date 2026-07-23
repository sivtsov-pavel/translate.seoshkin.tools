import { useState, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, speak, SpeakButton } from '../hooks/useSpeech.jsx'
import AvatarReaction from './AvatarReaction.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'

export default function LetterFill({ payload, onAnswer, lessonTitle, imageUrl, translations, translationRu, showOriginal }) {
  const [input, setInput]       = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect]   = useState(false)
  const [reaction, setReaction] = useState(null)
  const inputRef = useRef(null)
  const { t, lang } = useI18nStore()
  const hint = translations?.[lang] || translationRu || payload.translation_ru

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    speakAuto(payload.word_de)
  }, [payload.word_de])

  const handleSubmit = () => {
    if (!input.trim() || submitted) return
    // Регистрозависимо — заглавная буква обязательна (немецкие существительные с большой)
    const isCorrect = input.trim() === payload.answer.trim()
    setCorrect(isCorrect)
    setSubmitted(true)
    setReaction(isCorrect ? 'correct' : 'wrong')  // Pablo реагирует клипом
    // звук верно/неверно — централизован в AvatarReaction (играет при выключенной озвучке)
    // Листаем ТОЛЬКО после того как Pablo договорил (onReactionEnd) — см. AvatarReaction
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit() }

  // masked и answer одинаковой длины и выровнены по индексу: masked[i]==='_' → буква скрыта.
  // Рендерим ПОСИМВОЛЬНО, каждую скрытую букву — отдельной клеткой с зазором, чтобы было
  // однозначно видно, СКОЛЬКО букв вставлять (раньше подчёркивания сливались в одну черту).
  const chars = [...(payload.masked || '')]
  const resultColor = submitted ? (correct ? 'var(--good)' : 'var(--red)') : 'var(--accent)'

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      <AvatarReaction imageUrl={imageUrl} wordDe={payload.word_de} reaction={reaction}
        onReactionEnd={() => onAnswer(correct ? 5 : 1, input.trim())} />

      <div className="exercise-card-content" style={{ padding: 24 }}>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 15, marginBottom: 16 }}>
        {t.exercise.rememberWord} <strong style={{ color: 'var(--ink)' }}>{hint}</strong>
      </p>

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, fontSize: 38, fontWeight: 700 }} dir="ltr">
          {chars.map((ch, i) => (
            ch === '_'
              // Скрытая буква — отдельная клетка с подчёркиванием и зазором (видно, сколько букв)
              ? <span key={i} style={{ color: resultColor, borderBottom: `3px solid ${submitted ? resultColor : 'var(--accent)'}`, width: 26, display: 'inline-block', textAlign: 'center' }}>
                  {submitted ? (payload.answer?.[i] || '') : ''}
                </span>
              : <span key={i} style={{ color: 'var(--ink)' }}>{ch}</span>
          ))}
          <SpeakButton text={payload.word_de} size={22} style={{ marginLeft: 10 }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, maxWidth: 340, margin: '0 auto' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={submitted}
          placeholder={t.exercise.writeWordFull}
          style={{ flex: 1, fontSize: 18, border: `2px solid ${submitted ? resultColor : 'var(--line)'}`, outline: 'none', fontFamily: 'inherit' }}
        />
        {!submitted && (
          <button onClick={handleSubmit} disabled={!input.trim()}
            style={{ padding: '12px 20px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
            ✓
          </button>
        )}
      </div>

      {submitted && (
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 16, fontWeight: 700, color: resultColor }}>
          {correct ? `✓ ${t.exercise.correct} ${payload.answer}` : `✗ ${t.exercise.wrong} ${payload.answer}`}
        </div>
      )}
      </div>
    </div>
  )
}
