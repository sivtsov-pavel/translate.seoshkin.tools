import { useState, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, speak } from '../hooks/useSpeech.jsx'
import AvatarReaction from './AvatarReaction.jsx'
import ExerciseCardHeader from './ExerciseCardHeader.jsx'
import { shouldAutoFocus } from '../utils/device.js'

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

export default function LetterFill({ payload, onAnswer, lessonTitle, typeLabel, imageUrl, translations, translationRu }) {
  const [vals, setVals]         = useState({})      // {индекс_буквы: введённый символ}
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect]   = useState(false)
  const [caseHint, setCaseHint] = useState('')      // подсказка про регистр (перепутал большую/маленькую)
  // Что ученик реально собрал. Раньше в отчёт уходил ПРАВИЛЬНЫЙ ответ, поэтому в
  // статистике выглядело так, будто человек написал верно, а система засчитала ошибку.
  // Из-за этого же «Почему ошибка?» разбирал не тот текст.
  const [built, setBuilt] = useState('')
  const [reaction, setReaction] = useState(null)
  const refs = useRef({})
  const { t, lang } = useI18nStore()
  const hint = translations?.[lang] || translationRu || payload.translation_ru

  const answer = (payload.answer || '').trim()
  const chars = buildMask(answer)
  const blanks = chars.map((c, i) => (c === '_' ? i : -1)).filter(i => i >= 0)

  // Разбиваем на слова (по пробелам) — чтобы перенос шёл между словами, а не рвал слово
  // посередине: «der Kugelschreiber» = «der» + «Kugelschreiber» на двух строках.
  const groups = []
  let cur = []
  chars.forEach((ch, i) => {
    if (ch === ' ') { if (cur.length) groups.push(cur); cur = []; return }
    cur.push({ ch, i })
  })
  if (cur.length) groups.push(cur)

  // Клетка ФИКСИРОВАННАЯ (просьба Павла 13.08): раньше размер подгонялся под самое
  // длинное слово, и от упражнения к упражнению буквы прыгали — то крупные, то мелкие.
  // Теперь шаблон один, а слово-гигант («Sozialversicherungsnummer») не ужимается,
  // а прокручивается внутри своего блока влево-вправо.
  const GAP = 5, SLOT = 34, TILE_H = 44
  const font = 20

  useEffect(() => {
    // фокус на первый пропуск + озвучка слова
    const first = blanks[0]
    if (first != null && shouldAutoFocus()) setTimeout(() => refs.current[first]?.focus(), 120)
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
    const assembled = chars.map((c, i) => (c === '_' ? (vals[i] || '') : c)).join('')
    setBuilt(assembled.trim())
    const isCorrect = assembled.trim() === answer
    // Перепутан ТОЛЬКО регистр (буквы верные) → объясняем правило, а не просто «неверно».
    let ch = ''
    if (!isCorrect && assembled.trim().toLowerCase() === answer.toLowerCase()) {
      const bad = blanks.find(i => (vals[i] || '') !== answer[i] && (vals[i] || '').toLowerCase() === (answer[i] || '').toLowerCase())
      const correctIsUpper = bad != null && answer[bad] === (answer[bad] || '').toUpperCase()
      ch = correctIsUpper
        ? (t.exercise.caseShouldUpper || 'Здесь буква ЗАГЛАВНАЯ: в немецком существительные и вежливое «Sie» пишутся с большой.')
        : (t.exercise.caseShouldLower || 'Здесь буква строчная: с большой пишутся только существительные и «Sie», а не середина слова.')
    }
    setCaseHint(ch)
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
    <div className="exercise-card" style={{ border: '1px solid var(--line)', borderRadius: 26, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
      <div className="exercise-card-content" style={{ padding: 20 }}>
      <ExerciseCardHeader typeLabel={typeLabel} lessonTitle={lessonTitle} />

      {/* Картинка — во всю ширину карточки, как в «вопрос-ответ» (просьба Павла 13.08).
          Реакция Pablo играет в этом же блоке; авто-перехода нет — дальше по кнопке. */}
      <div style={{ borderRadius: 20, overflow: 'hidden', background: 'var(--surface-2)',
        display: 'grid', placeItems: 'center', marginBottom: 16, aspectRatio: '1 / 1' }}>
        <AvatarReaction imageUrl={imageUrl} wordDe={payload.word_de} reaction={reaction} fill />
      </div>

      <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 15, marginBottom: 16 }}>
        {t.exercise.rememberWord} <strong style={{ color: 'var(--ink)' }}>{hint}</strong>
      </p>

      {/* Слово — клетки-плитки одного размера, по шаблону (макет Павла):
          видимая буква — заполненная плитка, пропуск — плитка-поле. Перенос идёт
          между словами; слово длиннее экрана не ужимается, а прокручивается
          внутри блока влево-вправо. */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 18, padding: '2px 0' }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
          columnGap: 14, rowGap: 8, fontWeight: 700, width: 'max-content',
          minWidth: '100%',
        }} dir="ltr">
          {groups.map((g, gi) => (
            // Одно слово = неразрывная группа: перенос только по пробелам
            <div key={gi} style={{ display: 'inline-flex', gap: GAP, flexWrap: 'nowrap' }}>
              {g.map(({ ch, i }) => (
                ch === '_'
                  // Показываем то, что ВВЁЛ ученик (даже после проверки) — чтобы он видел свою букву
                  // и понял ошибку (в т.ч. регистр). Автозаглавную клавиатуры выключаем.
                  ? <input key={i}
                      ref={el => { refs.current[i] = el }}
                      value={vals[i] || ''}
                      onChange={e => setChar(i, e.target.value)}
                      onKeyDown={e => handleKey(i, e)}
                      disabled={submitted}
                      maxLength={1}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="text"
                      aria-label={t.exercise.missingLetterAria}
                      style={{
                        width: SLOT, height: TILE_H, padding: 0, textAlign: 'center', flex: 'none',
                        fontSize: font, fontWeight: 800, fontFamily: 'inherit',
                        color: slotColor(i), background: 'var(--surface)',
                        border: `2px solid ${submitted ? slotColor(i) : 'var(--accent)'}`,
                        borderRadius: 10, outline: 'none',
                      }}
                    />
                  : <span key={i} style={{
                      width: SLOT, height: TILE_H, flex: 'none', display: 'grid', placeItems: 'center',
                      color: 'var(--ink)', fontSize: font, fontWeight: 800,
                      background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10,
                    }}>{ch}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Прослушать — крупной кнопкой, как в «вопрос-ответ» */}
      <button onClick={() => speak(payload.word_de)}
        style={{ margin: '0 auto 18px', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
          borderRadius: 15, border: 'none', background: '#9A5CD8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        🔊 {t.exercise.listen || 'Прослушать'}
      </button>

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
          <div style={{ marginBottom: caseHint ? 8 : 14, fontSize: 16, fontWeight: 700, color: resultColor }}>
            {correct ? `✓ ${t.exercise.correct} ${answer}` : `✗ ${t.exercise.wrong} ${answer}`}
          </div>
          {caseHint && (
            <div style={{ marginBottom: 14, fontSize: 13.5, color: 'var(--gold-dark)', background: 'var(--yellow-soft)', borderRadius: 10, padding: '8px 12px' }}>
              ✍️ {caseHint}
            </div>
          )}
          <button onClick={() => onAnswer(correct ? 5 : 1, built || answer)}
            style={{ padding: '13px 36px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
            {t.exercise.next}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
