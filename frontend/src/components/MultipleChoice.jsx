import { useState, useEffect, useMemo } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'
import WordImage from './WordImage.jsx'
import { getTranslation, getEffectiveLang } from '../utils/translation.js'
import { ExerciseActions } from './ExerciseActions.jsx'

export default function MultipleChoice({ payload, onAnswer, lessonTitle, wordDe, imageUrl, translations, translationRu, payloadTranslations, exerciseId }) {
  const [selected, setSelected] = useState(null)
  const { t, lang } = useI18nStore()

  // Локализованные варианты: если есть payloadTranslations[lang] — массив переводов вариантов
  const { options, correctIdx } = useMemo(() => {
    const orig = payload.options ?? []
    const effectiveLang = getEffectiveLang(payloadTranslations, lang)
    const localized = effectiveLang ? payloadTranslations[effectiveLang] : null
    const displayOpts = Array.isArray(localized) && localized.length ? localized : orig
    // Перемешиваем с сохранением исходного индекса — избегаем indexOf по строке (ломается на "сорок" vs "сорок (40)")
    const indexed = displayOpts.map((opt, i) => ({ opt, i }))
    indexed.sort(() => Math.random() - 0.5)
    const correctOrigIdx = payload.correct ?? 0
    return {
      options: indexed.map(x => x.opt),
      correctIdx: indexed.findIndex(x => x.i === correctOrigIdx),
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveLang = getEffectiveLang(payloadTranslations, lang)
  // Показываем именно тот вариант который в массиве options, чтобы сообщение об ошибке совпадало с опцией
  const correctAnswer = options[correctIdx]
    || (effectiveLang && payloadTranslations[effectiveLang]?.[payload.correct ?? 0])
    || getTranslation(translations, lang, translationRu || (payload.options ?? [])[payload.correct ?? 0])
  const germanWord = wordDe || payload.question.replace(/^.*:\s*/i, '').replace(/\?$/, '').trim()

  useEffect(() => { if (germanWord) speakAuto(germanWord) }, [germanWord])

  const handleSelect = (idx) => {
    if (selected !== null) return
    setSelected(idx)
    // Нет автоперехода — пользователь сам нажмёт «Далее» (чтобы успеть добавить в словарь)
  }

  const getStyle = (idx) => {
    const base = {
      padding: '12px 16px', marginBottom: 8, borderRadius: 12, cursor: 'pointer',
      border: '2px solid', width: '100%', textAlign: 'left', fontSize: 16,
      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
    }
    if (selected === null) return { ...base, borderColor: 'var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }
    if (idx === correctIdx) return { ...base, borderColor: 'var(--good)', background: 'rgba(78,154,110,0.15)', cursor: 'default', color: 'var(--ink)' }
    if (idx === selected)   return { ...base, borderColor: 'var(--red)',  background: 'rgba(179,56,44,0.12)',  cursor: 'default', color: 'var(--ink)' }
    return { ...base, borderColor: 'var(--line)', background: 'var(--surface-2)', cursor: 'default', opacity: 0.5, color: 'var(--ink)' }
  }

  const badgeColor = (idx) => {
    if (selected === null) return 'var(--surface)'
    if (idx === correctIdx) return 'var(--good)'
    if (idx === selected) return 'var(--red)'
    return 'var(--surface)'
  }

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>

      <WordImage imageUrl={imageUrl} wordDe={wordDe} bleed />

      <div className="exercise-card-content" style={{ padding: 24 }}>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '14px 20px', marginBottom: 18, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)' }} dir="ltr">{germanWord}</span>
          <SpeakButton text={germanWord} size={24} />
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '8px 0 0' }}>{t.exercise.chooseTranslation}</p>
      </div>

      {options.map((opt, idx) => (
        <button key={idx} style={getStyle(idx)} onClick={() => handleSelect(idx)}>
          <span style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: badgeColor(idx),
            color: selected !== null && (idx === correctIdx || idx === selected) ? '#fff' : 'var(--ink-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, border: '1px solid var(--line)',
          }}>
            {String.fromCharCode(65 + idx)}
          </span>
          {opt}
          {selected !== null && idx === correctIdx && (
            <span style={{ marginLeft: 'auto', color: 'var(--good)', fontWeight: 700 }}>✓</span>
          )}
        </button>
      ))}

      {selected !== null && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700,
            color: selected === correctIdx ? 'var(--good)' : 'var(--red)' }}>
            {selected === correctIdx
              ? `✓ ${t.exercise.correct}`
              : `✗ ${t.exercise.wrong} — ${correctAnswer}`}
          </p>
          <ExerciseActions
            de={germanWord}
            ru={correctAnswer}
            type="multiple_choice"
            exerciseId={exerciseId}
            userAnswer={options[selected]}
            correctAnswer={correctAnswer}
            isCorrect={selected === correctIdx}
          />
          <button onClick={() => onAnswer(selected === correctIdx ? 5 : 1)}
            style={{ marginTop: 12, padding: '10px 24px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            {t.exercise.next}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
