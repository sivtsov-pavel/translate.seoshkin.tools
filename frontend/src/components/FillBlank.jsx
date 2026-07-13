import { useState, useRef, useEffect, useMemo } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speak, SpeakButton } from '../hooks/useSpeech.jsx'
import { getTranslation } from '../utils/translation.js'
import { ExerciseActions } from './ExerciseActions.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'
import AvatarReaction from './AvatarReaction.jsx'

export default function FillBlank({ payload, onAnswer, lessonTitle, imageUrl, payloadTranslations, exerciseId }) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [reaction, setReaction] = useState(null)
  const { t, lang } = useI18nStore()
  const inputRef = useRef(null)

  const isCorrect = answer.trim().toLowerCase() === payload.blank.trim().toLowerCase()
  const parts = payload.sentence.split('___')
  const beforeBlank = parts[0]
  const afterBlank  = parts[parts.length - 1]

  // Перемешиваем один раз при монтировании — не при каждом рендере
  const shuffledOptions = useMemo(() => {
    const unique = [
      payload.blank,
      ...payload.options.filter(o => o.trim().toLowerCase() !== payload.blank.trim().toLowerCase()),
    ]
    return [...unique].sort(() => Math.random() - 0.5)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    inputRef.current?.focus()
    setTimeout(() => inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    const correct = answer.trim().toLowerCase() === payload.blank.trim().toLowerCase()
    setSubmitted(true)
    setReaction(correct ? 'correct' : 'wrong')  // Pablo реагирует
    if (correct) playCorrect(); else playWrong()
    const fullSentence = beforeBlank + payload.blank + afterBlank
    setTimeout(() => speak(fullSentence), 300)
  }

  const fullSentence = beforeBlank + payload.blank + afterBlank

  // Перевод предложения — для любого языка (для 'de' fallback → 'en')
  const sentenceTranslation = getTranslation(payloadTranslations, lang, payload.sentence_ru)

  const selectHint = (opt) => {
    setAnswer(opt)
    // Краткое произношение подсказки
    speak(opt)
  }

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
      <AvatarReaction imageUrl={imageUrl} wordDe={payload.blank} reaction={reaction} />
      <div className="exercise-card-content" style={{ padding: 24 }}>

      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      {/* Предложение с пропуском */}
      <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <p style={{ fontSize: 21, margin: 0, lineHeight: 1.7, color: 'var(--ink)' }} dir="ltr">
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
        {/* Перевод во время вопроса НЕ показываем — он полный и выдал бы ответ.
            Полный перевод показывается после ответа (см. блок результата). */}
      </div>

      {/* Слова-подсказки */}
      {!submitted && payload.options?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>{t.exercise.wordHints}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {shuffledOptions.map((opt, i) => (
              <button key={i} onClick={() => selectHint(opt)}
                style={{
                  fontSize: 16,
                  color: answer === opt ? 'var(--accent)' : 'var(--ink)',
                  background: answer === opt ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: `1px solid ${answer === opt ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: answer === opt ? 600 : 400,
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
            dir="ltr"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={t.exercise.enterWord}
            style={{ flex: 1, fontSize: 18 }}
          />
          <button type="submit"
            style={{ padding: '10px 20px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>
            {t.exercise.checkAnswer}
          </button>
        </form>
      ) : (
        <div>
          {isCorrect ? (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: 'var(--good)', fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>✓ {t.exercise.correct}</p>
              {/* Читать всё предложение */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(78,154,110,0.08)', padding: '10px 14px', borderRadius: 10 }}>
                <span style={{ fontSize: 16, color: 'var(--ink)' }}>{fullSentence}</span>
                <SpeakButton text={fullSentence} />
              </div>
              {sentenceTranslation && (
                <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '6px 0 0', fontStyle: 'italic', paddingLeft: 4 }}>
                  {sentenceTranslation}
                </p>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: 'var(--red)', fontSize: 16, margin: '0 0 4px', fontWeight: 600 }}>
                ✗ {t.exercise.wrong}
              </p>
              {/* Объяснение: что ты написал и что правильно */}
              <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 8 }}>
                {t.exercise.yourAnswer}: <span style={{ color: 'var(--red)', fontWeight: 600 }}>{answer}</span>
              </div>
              <div style={{ background: 'rgba(78,154,110,0.10)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--good)', marginBottom: 4, fontWeight: 600 }}>
                  {t.exercise.correctedVersion}:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--good)' }}>{payload.blank}</span>
                  <SpeakButton text={payload.blank} />
                  <span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>→</span>
                  <span style={{ fontSize: 15, color: 'var(--ink)' }}>{fullSentence}</span>
                  <SpeakButton text={fullSentence} size={14} />
                </div>
                {sentenceTranslation && (
                  <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '6px 0 0', fontStyle: 'italic' }}>
                    {sentenceTranslation}
                  </p>
                )}
              </div>
            </div>
          )}
          <ExerciseActions
            de={fullSentence}
            ru={sentenceTranslation}
            type="fill_blank"
            exerciseId={exerciseId}
            userAnswer={answer}
            correctAnswer={payload.blank}
            isCorrect={isCorrect}
          />
          <button
            onClick={() => onAnswer(isCorrect ? 5 : 1, answer)}
            style={{ marginTop: 10, padding: '12px 28px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 600 }}>
            {t.exercise.next} →
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
