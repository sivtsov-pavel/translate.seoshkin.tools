import { useState, useEffect, useMemo } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'
import WordImage from './WordImage.jsx'
import { getTranslation, getEffectiveLang } from '../utils/translation.js'

export default function MultipleChoice({ payload, onAnswer, lessonTitle, wordDe, imageUrl, translations, translationRu, payloadTranslations }) {
  const [selected, setSelected] = useState(null)
  const { t, lang } = useI18nStore()

  // Локализованные варианты: если есть payloadTranslations[lang] — массив переводов вариантов
  const { options, correctIdx } = useMemo(() => {
    const orig = payload.options ?? []
    const correctAnswer = orig[payload.correct ?? 0]
    // Учитываем fallback для 'de' → 'en' и других языков без ключа
    const effectiveLang = getEffectiveLang(payloadTranslations, lang)
    const localized = effectiveLang ? payloadTranslations[effectiveLang] : null
    // Если есть переводы всех вариантов — используем их (сохраняем оригинальный порядок для correctIdx)
    const displayOpts = Array.isArray(localized) ? localized : orig
    const shuffled = [...displayOpts].sort(() => Math.random() - 0.5)
    // Правильный ответ: локализованный или из translations, fallback на оригинал
    const correctLocalized = Array.isArray(localized)
      ? localized[payload.correct ?? 0]
      : getTranslation(translations, lang, translationRu || correctAnswer)
    return { options: shuffled, correctIdx: shuffled.indexOf(correctLocalized) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveLang = getEffectiveLang(payloadTranslations, lang)
  const correctAnswer = (effectiveLang && payloadTranslations[effectiveLang]?.[payload.correct ?? 0])
    || getTranslation(translations, lang, translationRu || options[correctIdx])
  const germanWord = wordDe || payload.question.replace(/^.*:\s*/i, '').replace(/\?$/, '').trim()

  useEffect(() => { if (germanWord) speakAuto(germanWord) }, [germanWord])

  const handleSelect = (idx) => {
    if (selected !== null) return
    setSelected(idx)
    setTimeout(() => onAnswer(idx === correctIdx ? 5 : 1), 1100)
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
    <div style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>

      <WordImage imageUrl={imageUrl} wordDe={wordDe} bleed />

      <div style={{ padding: 24 }}>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '14px 20px', marginBottom: 18, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}>{germanWord}</span>
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
        <p style={{ marginTop: 10, fontSize: 15, fontWeight: 700,
          color: selected === correctIdx ? 'var(--good)' : 'var(--red)' }}>
          {selected === correctIdx
            ? `✓ ${t.exercise.correct}`
            : `✗ ${t.exercise.wrong} — ${correctAnswer}`}
        </p>
      )}
      </div>
    </div>
  )
}
