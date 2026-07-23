import { useState, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, SpeakButton } from '../hooks/useSpeech.jsx'
import AvatarReaction from './AvatarReaction.jsx'

// Строим массив символов слова, скрывая ~40% букв под пропуски ('_'). Детерминированно
// (одно и то же слово → одна и та же маска), первую букву не прячем, пробелы/дефисы не трогаем.
// Из ответа, а не из payload.masked: модель иногда генерировала битый masked (напр. "l_n_m"
// для "langsam" — разная длина, нерешаемо). Проверка идёт по собранному слову.
function buildMask(answer) {
  const chars = [...(answer || '')]
  const maskable = []
  for (let i = 1; i < chars.length; i++) if (/\p{L}/u.test(chars[i])) maskable.push(i)
  if (!maskable.length) return chars
  const count = Math.max(1, Math.round(maskable.length * 0.4))
  const hide = new Set()
  const step = maskable.length / count
  for (let k = 0; k < count; k++) hide.add(maskable[Math.min(maskable.length - 1, Math.floor(k * step + step / 2))])
  return chars.map((c, i) => (hide.has(i) ? '_' : c))
}

export default function LetterFill({ payload, onAnswer, lessonTitle, imageUrl, translations, translationRu }) {
  const [vals, setVals]         = useState({})      // {индекс_буквы: введённый символ}
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect]   = useState(false)
  const [reaction, setReaction] = useState(null)
  const refs = useRef({})
  const { t, lang } = useI18nStore()
  const hint = translations?.[lang] || translationRu || payload.translation_ru

  const answer = (payload.answer || '').trim()
  const chars = buildMask(answer)
  const blanks = chars.map((c, i) => (c === '_' ? i : -1)).filter(i => i >= 0)

  useEffect(() => {
    // фокус на первый пропуск + озвучка слова
    const first = blanks[0]
    if (first != null) setTimeout(() => refs.current[first]?.focus(), 120)
    speakAuto(payload.word_de)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.word_de])

  const focusBlank = (idx) => refs.current[idx]?.focus()
  const nextBlank = (idx) => blanks[blanks.indexOf(idx) + 1]
  const prevBlank = (idx) => blanks[blanks.indexOf(idx) - 1]

  const setChar = (idx, ch) => {
    const c = ch.slice(-1) // берём последний введённый символ
    setVals(v => ({ ...v, [idx]: c }))
    if (c) { const n = nextBlank(idx); if (n != null) focusBlank(n) }
  }

  const handleKey = (idx, e) => {
    if (e.key === 'Enter') { handleSubmit(); return }
    if (e.key === 'Backspace' && !vals[idx]) { const p = prevBlank(idx); if (p != null) { e.preventDefault(); focusBlank(p) } }
  }

  const filledAll = blanks.every(i => (vals[i] || '').trim())

  const handleSubmit = () => {
    if (submitted || !filledAll) return
    // Собираем слово: видимые буквы + вписанные в пропуски. Регистрозависимо (нем. заглавные).
    const built = chars.map((c, i) => (c === '_' ? (vals[i] || '') : c)).join('')
    const isCorrect = built.trim() === answer
    setCorrect(isCorrect)
    setSubmitted(true)
    setReaction(isCorrect ? 'correct' : 'wrong')
  }

  const resultColor = submitted ? (correct ? 'var(--good)' : 'var(--red)') : 'var(--accent)'
  const slotColor = (i) => {
    if (!submitted) return 'var(--ink)'
    return (vals[i] || '') === answer[i] ? 'var(--good)' : 'var(--red)'
  }

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      {/* Реакция Pablo — БЕЗ авто-перехода: дальше только по кнопке «Далее» */}
      <AvatarReaction imageUrl={imageUrl} wordDe={payload.word_de} reaction={reaction} />

      <div className="exercise-card-content" style={{ padding: 24 }}>
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}

      <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 15, marginBottom: 16 }}>
        {t.exercise.rememberWord} <strong style={{ color: 'var(--ink)' }}>{hint}</strong>
      </p>

      {/* Слово: видимые буквы + клетки-пропуски (каждая клетка = одна буква) */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 4, fontSize: 34, fontWeight: 700 }} dir="ltr">
          {chars.map((ch, i) => (
            ch === '_'
              ? <input key={i}
                  ref={el => { refs.current[i] = el }}
                  value={submitted ? (answer[i] || '') : (vals[i] || '')}
                  onChange={e => setChar(i, e.target.value)}
                  onKeyDown={e => handleKey(i, e)}
                  disabled={submitted}
                  maxLength={1}
                  aria-label="пропущенная буква"
                  style={{
                    width: 34, height: 46, padding: 0, textAlign: 'center',
                    fontSize: 30, fontWeight: 700, fontFamily: 'inherit',
                    color: slotColor(i), background: 'transparent',
                    border: 'none', borderBottom: `3px solid ${submitted ? slotColor(i) : 'var(--accent)'}`,
                    borderRadius: 0, outline: 'none',
                  }}
                />
              : <span key={i} style={{ color: 'var(--ink)', lineHeight: '46px' }}>{ch}</span>
          ))}
          <SpeakButton text={payload.word_de} size={22} style={{ marginLeft: 10 }} />
        </div>
      </div>

      {/* Кнопки: Проверить → потом Далее (без авто-перехода) */}
      {!submitted ? (
        <div style={{ textAlign: 'center' }}>
          <button onClick={handleSubmit} disabled={!filledAll}
            style={{ padding: '12px 32px', background: filledAll ? 'var(--accent)' : 'var(--line)', color: filledAll ? 'var(--accent-ink)' : 'var(--ink-soft)', border: 'none', borderRadius: 10, cursor: filledAll ? 'pointer' : 'not-allowed', fontSize: 16, fontWeight: 700 }}>
            {t.exercise.checkAnswer || 'Проверить'}
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 14, fontSize: 16, fontWeight: 700, color: resultColor }}>
            {correct ? `✓ ${t.exercise.correct} ${answer}` : `✗ ${t.exercise.wrong} ${answer}`}
          </div>
          <button onClick={() => onAnswer(correct ? 5 : 1, answer)}
            style={{ padding: '13px 36px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
            {t.exercise.next}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
