import { useState, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speak, SpeakButton } from '../hooks/useSpeech.jsx'

export default function FillBlank({ payload, onAnswer, lessonTitle }) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { t, lang } = useI18nStore()
  const inputRef = useRef(null)

  const isCorrect = answer.trim().toLowerCase() === payload.blank.trim().toLowerCase()
  // Многословный бланк ("Guten Morgen") → GPT ставит "___ ___", split даёт 3+ частей.
  // Берём только до первого ___ и всё после последнего ___.
  const parts = payload.sentence.split('___')
  const beforeBlank = parts[0]
  const afterBlank  = parts[parts.length - 1]
  // Дедупликация options: GPT часто включает правильный ответ в options
  const uniqueOptions = [
    payload.blank,
    ...payload.options.filter(o => o.trim().toLowerCase() !== payload.blank.trim().toLowerCase()),
  ]

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setSubmitted(true)
    setTimeout(() => speak(payload.blank), 300)
  }

  const fullSentence = beforeBlank + payload.blank + afterBlank

  return (
    <div style={{ border: '2px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 16, background: 'var(--surface)' }}>

      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      {/* Предложение с пропуском */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <p style={{ fontSize: 19, margin: 0, lineHeight: 1.7, color: 'var(--ink)' }}>
          {beforeBlank}
          <span style={{
            color: submitted ? (isCorrect ? 'var(--good)' : 'var(--red)') : 'var(--accent)',
            borderBottom: `2px solid ${submitted ? (isCorrect ? 'var(--good)' : 'var(--red)') : 'var(--accent)'}`,
            padding: '0 6px', fontWeight: 700, minWidth: 60, display: 'inline-block', textAlign: 'center',
          }}>
            {submitted ? (answer || '___') : (answer || '   ')}
          </span>
          {afterBlank}
        </p>
        {payload.sentence_ru && lang === 'ru' && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 0', fontStyle: 'italic' }}>
            {payload.sentence_ru}
          </p>
        )}
      </div>

      {/* Слова-подсказки */}
      {!submitted && payload.options?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>{t.exercise.wordHints}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {uniqueOptions.sort(() => Math.random() - 0.5).map((opt, i) => (
              <button key={i} onClick={() => setAnswer(opt)}
                style={{
                  fontSize: 14,
                  color: answer === opt ? 'var(--accent)' : 'var(--ink)',
                  background: answer === opt ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: `1px solid ${answer === opt ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: answer === opt ? 600 : 400,
                }}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {!submitted ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={t.exercise.enterWord}
            style={{ flex: 1, fontSize: 16 }}
          />
          <button type="submit"
            style={{ padding: '10px 20px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
            {t.exercise.checkAnswer}
          </button>
        </form>
      ) : (
        <div>
          {isCorrect
            ? <p style={{ color: 'var(--good)', fontWeight: 700, fontSize: 16, margin: '0 0 10px' }}>✓ {t.exercise.correct}</p>
            : (
              <div style={{ marginBottom: 10 }}>
                <p style={{ color: 'var(--red)', fontSize: 15, margin: '0 0 6px' }}>✗ {t.exercise.wrong}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(78,154,110,0.12)', padding: '8px 12px', borderRadius: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--good)' }}>{payload.blank}</span>
                  <SpeakButton text={payload.blank} />
                  <span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>→</span>
                  <span style={{ fontSize: 14, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{fullSentence}</span>
                  <SpeakButton text={fullSentence} size={14} />
                </div>
              </div>
            )
          }
          <button
            onClick={() => onAnswer(isCorrect ? 5 : 1, answer)}
            style={{ padding: '10px 28px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
            {t.exercise.next} →
          </button>
        </div>
      )}
    </div>
  )
}
