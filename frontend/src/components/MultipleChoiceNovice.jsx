import { useState, useMemo, useEffect, useRef } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, speak } from '../hooks/useSpeech.jsx'
import { getTranslation, getEffectiveLang } from '../utils/translation.js'
import { playCorrect, playWrong } from '../utils/sound.js'
import WordImage from './WordImage.jsx'

// «Выбери ответ» для режима новичка — макет 2b, экран D.
//
// Отличия от прежней карточки: крупный вопрос, аудио-блок с кнопкой и эквалайзером,
// варианты плитками с номерами и зоной нажатия 60px, фидбек-полоска снизу вместо
// строчки текста. Ошибка не наказывает: показывает верный ответ и идём дальше.
//
// Прежний MultipleChoice не трогаем — он остаётся для режима эксперта.
export default function MultipleChoiceNovice({
  payload, onAnswer, wordDe, imageUrl, translations, translationRu, payloadTranslations,
}) {
  const { t, lang } = useI18nStore()
  const [selected, setSelected] = useState(null)
  const answeredRef = useRef(false)

  // Варианты берём на локали ученика, порядок перемешиваем один раз
  const { options, correctIdx } = useMemo(() => {
    const orig = payload.options ?? []
    const effLang = getEffectiveLang(payloadTranslations, lang)
    const localized = effLang ? payloadTranslations[effLang] : null
    const display = Array.isArray(localized) && localized.length ? localized : orig
    const indexed = display.map((opt, i) => ({ opt, i }))
    indexed.sort(() => Math.random() - 0.5)
    const correctOrig = Number(payload.correct ?? 0)
    return { options: indexed.map(x => x.opt), correctIdx: indexed.findIndex(x => x.i === correctOrig) }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const word = wordDe || String(payload.question || '').replace(/^.*:\s*/i, '').replace(/\?$/, '').trim()
  const correctAnswer = options[correctIdx] || getTranslation(translations, lang, translationRu)

  useEffect(() => { if (word) speakAuto(word) }, [word])

  const choose = (idx) => {
    if (selected !== null) return
    setSelected(idx)
    if (idx === correctIdx) playCorrect(); else playWrong()
  }

  const next = () => {
    if (answeredRef.current) return
    answeredRef.current = true
    onAnswer(selected === correctIdx ? 5 : 1)
  }

  const ok = selected === correctIdx

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 2px 20px' }}>
      {/* Слово с картинкой — крупным блоком, как в макете */}
      <div className="exercise-card" style={{ borderRadius: 26, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 16 }}>
        {imageUrl && <WordImage imageUrl={imageUrl} wordDe={word} bleed />}
        <div style={{ padding: '18px 20px' }}>
          <div className="exercise-word-de" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }} dir="ltr">{word}</div>
          <button onClick={() => speak(word)}
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              borderRadius: 15, border: 'none', background: '#9A5CD8', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
            🔊 {t.exercise.listen || 'Слушать'}
            {/* Эквалайзер из макета: полоски разной высоты рядом с кнопкой звука */}
            <span style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 18 }}>
              {[9, 16, 11, 18, 13, 8].map((h, i) => (
                <span key={i} style={{ width: 3, height: h, borderRadius: 3, background: 'rgba(255,255,255,0.75)' }} />
              ))}
            </span>
          </button>
        </div>
      </div>

      {/* Варианты ответа — плитки с номерами */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {options.map((opt, idx) => {
          const isCorrect = selected !== null && idx === correctIdx
          const isWrong = selected === idx && idx !== correctIdx
          return (
            <button key={idx} onClick={() => choose(idx)} disabled={selected !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '16px 18px',
                borderRadius: 20, cursor: selected === null ? 'pointer' : 'default', textAlign: 'left',
                border: `2px solid ${isCorrect ? '#3FBF8F' : isWrong ? '#C0392B' : 'var(--line)'}`,
                background: isCorrect ? 'rgba(63,191,143,0.14)' : isWrong ? 'rgba(192,57,43,0.12)' : 'var(--surface)',
                color: 'var(--ink)', fontSize: 17, fontWeight: 600,
              }}>
              <span style={{
                width: 34, height: 34, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center',
                background: isCorrect ? '#3FBF8F' : isWrong ? '#C0392B' : 'var(--surface-2)',
                color: isCorrect || isWrong ? '#fff' : 'var(--ink-soft)', fontSize: 14, fontWeight: 800,
              }}>{isCorrect ? '✓' : isWrong ? '✕' : idx + 1}</span>
              <span style={{ flex: 1 }}>{opt}</span>
            </button>
          )
        })}
      </div>

      {/* Фидбек-полоска: ошибка не наказывает, а показывает верный ответ */}
      {selected !== null && (
        <div style={{
          marginTop: 16, padding: '14px 16px', borderRadius: 18,
          background: ok ? 'rgba(63,191,143,0.16)' : 'rgba(192,57,43,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
            background: ok ? '#3FBF8F' : '#C0392B', color: '#fff', fontWeight: 800 }}>{ok ? '✓' : '✕'}</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {ok ? `${t.exercise.correct} +10 XP` : `${t.exercise.wrong} — ${correctAnswer}`}
          </span>
        </div>
      )}

      {selected !== null && (
        <button onClick={next}
          style={{ width: '100%', minHeight: 60, marginTop: 14, borderRadius: 18, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
          {t.exercise.next || 'Дальше'}
        </button>
      )}
    </div>
  )
}
