import { useState, useEffect, useRef } from 'react'
import { speak } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'
import { getTranslation } from '../utils/translation.js'
import { ExerciseActions } from './ExerciseActions.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'
import ExerciseCardHeader from './ExerciseCardHeader.jsx'
import { checkDictation, answerVariants, spokenForm } from '../utils/dictation.js'

export default function Dictation({ payload, onAnswer, lessonTitle, typeLabel, translations, translationRu, exerciseId, showOriginal }) {
  const { word_de, translation_ru } = payload
  const [input, setInput]     = useState('')
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [caseHint, setCaseHint] = useState(false) // ответ верный, но перепутан регистр (заглавная)
  const inputRef              = useRef(null)
  const { t, lang }           = useI18nStore()

  // В немецкой локали показываем само немецкое слово (fallback de→ru не нужен для диктанта)
  const displayTranslation = lang === 'de'
    ? word_de
    : getTranslation(translations, lang, translationRu || translation_ru)

  // Диктуем ОДНУ форму (см. spokenForm) — иначе синтезатор читает «die Lehrerin / die
  // Kursleiterin» вместе со слэшем и новичку непонятно, что писать.
  const spoken = spokenForm(word_de)

  useEffect(() => {
    setTimeout(() => speak(spoken, 'de-DE', 0.8), 300)
    inputRef.current?.focus()
    setTimeout(() => inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100)
  }, [word_de])

  // Формы, которые считаем верными («die Lehrerin / die Kursleiterin» → хватит любой одной).
  // Регистр НЕ понижаем — в немецком существительные с заглавной, тренируемся писать правильно.
  const variants = answerVariants(word_de)

  const check = () => {
    const { correct: ok, caseHint: hint } = checkDictation(input, word_de)
    setCaseHint(hint)
    setCorrect(ok)
    setChecked(true)
    // звук верно/неверно — централизован в AvatarReaction (играет при выключенной озвучке)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!checked) { if (input.trim()) check() }
      else onAnswer(correct ? 5 : 1, input.trim())
    }
  }

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ExerciseCardHeader typeLabel={typeLabel} lessonTitle={lessonTitle} />

      <div style={{ textAlign: 'center', padding: '20px 16px', background: 'var(--surface-2)', borderRadius: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {t.exercise.translationLabel}
        </div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 34, fontWeight: 700, color: 'var(--accent)' }} dir="ltr">
          {displayTranslation}
        </div>
        <button
          onClick={() => speak(spoken, 'de-DE', 0.8)}
          style={{ marginTop: 12, padding: '4px 14px', borderRadius: 20, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          ◄ {t.exercise.listenAgain}
        </button>
      </div>

      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t.exercise.enterWord}
        disabled={checked}
        dir="ltr"
        style={{
          width: '100%', padding: '14px 16px', fontSize: 20,
          borderRadius: 12, textAlign: 'center', fontFamily: 'Georgia,serif',
          border: `2px solid ${checked ? (correct ? 'var(--good)' : 'var(--red)') : 'var(--line)'}`,
          background: 'var(--surface)', color: 'var(--ink)',
          transition: 'border-color .2s',
        }}
      />

      {/* У слов с несколькими формами («mein / meine») достаточно ввести любую одну */}
      {!checked && variants.length > 1 && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', textAlign: 'center', marginTop: -8, lineHeight: 1.5 }}>
          💡 {t.exercise.multiVariantHint || 'Здесь несколько форм — достаточно написать любую одну'}
        </div>
      )}

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
              {caseHint && (
                <div style={{ color: 'var(--gold-dark, #8C6D2F)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  ✍️ {t.exercise.checkCapital || 'Почти! Проверь заглавную букву'}
                </div>
              )}
              <div style={{ color: 'var(--ink)', fontSize: 22, fontWeight: 700, fontFamily: 'Georgia,serif' }}>{word_de}</div>
            </div>
          )}
          <ExerciseActions
            de={word_de}
            ru={displayTranslation}
            type="dictation"
            exerciseId={exerciseId}
            userAnswer={input.trim()}
            correctAnswer={word_de}
            isCorrect={correct}
          />
          <button onClick={() => onAnswer(correct ? 5 : 1, input.trim())}
            style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.next}
          </button>
        </div>
      )}
    </div>
  )
}
