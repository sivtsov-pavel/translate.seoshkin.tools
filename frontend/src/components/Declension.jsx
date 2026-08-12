import { useState, useMemo, useEffect } from 'react'
import { speak } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'
import ExerciseCardHeader from './ExerciseCardHeader.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'

// Упражнение «Падежи»: существительное в четырёх падежах на одной странице.
// Формы приходят в payload.forms — посчитаны rule-based на бэке, без OpenAI.
// Два режима, как у спряжения: выбрать вариант или вписать руками.
const CASES = ['nom', 'akk', 'dat', 'gen']
const CASE_LABEL = {
  nom: 'Nominativ · кто/что',
  akk: 'Akkusativ · кого/что',
  dat: 'Dativ · кому/чему',
  gen: 'Genitiv · чей',
}

const norm = s => String(s || '').trim().toLowerCase()
const shuffle = arr => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export default function Declension({ payload, onAnswer, lessonTitle, typeLabel }) {
  const { t } = useI18nStore()
  const { word_de, translation_ru, forms } = payload || {}
  const [mode, setMode] = useState('choose')
  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState(false)

  useEffect(() => { setTimeout(() => speak(word_de, 'de-DE', 0.85), 300) }, [word_de])

  // Варианты: все формы этого же слова — ученик выбирает нужный артикль и окончание
  const pool = useMemo(() => [...new Set(CASES.map(c => forms?.[c]).filter(Boolean))], [forms])

  const optionsFor = useMemo(() => {
    const map = {}
    for (const c of CASES) {
      const correct = forms?.[c]
      const others = shuffle(pool.filter(w => norm(w) !== norm(correct))).slice(0, 3)
      map[c] = shuffle([correct, ...others].filter(Boolean))
    }
    return map
  }, [pool, forms])

  const set = (c, v) => { if (!checked) setAnswers(a => ({ ...a, [c]: v })) }

  const correctCount = () => CASES.filter(c => norm(answers[c]) === norm(forms?.[c])).length

  const check = () => {
    setChecked(true)
    if (correctCount() === CASES.length) playCorrect(); else playWrong()
  }

  const next = () => {
    const ok = correctCount()
    const quality = ok === 4 ? 5 : ok === 3 ? 4 : ok === 2 ? 2 : 1
    onAnswer(quality, CASES.map(c => answers[c] || '').join(', '))
  }

  const allFilled = CASES.every(c => (answers[c] || '').trim())

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExerciseCardHeader typeLabel={typeLabel} lessonTitle={lessonTitle} />

      <div style={{ textAlign: 'center', padding: '16px', background: 'var(--surface-2)', borderRadius: 16 }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 30, fontWeight: 700, color: 'var(--accent)' }}>{word_de}</div>
        {translation_ru && <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>{translation_ru}</div>}
        <button onClick={() => speak(word_de, 'de-DE', 0.85)}
          style={{ marginTop: 8, padding: '3px 12px', borderRadius: 20, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13, cursor: 'pointer' }}>🔊</button>
      </div>

      {!checked && (
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', alignSelf: 'center' }}>
          {[['choose', t.exercise?.conjChoose || 'Выбрать'], ['type', t.exercise?.conjType || 'Вписать руками']].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setAnswers({}) }}
              style={{ padding: '7px 16px', border: 'none', fontSize: 13, fontWeight: mode === m ? 700 : 500, cursor: 'pointer', background: mode === m ? 'var(--accent)' : 'var(--surface-2)', color: mode === m ? 'var(--accent-ink)' : 'var(--ink)' }}>{label}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CASES.map(c => {
          const correct = forms?.[c]
          const val = answers[c] || ''
          const isOk = checked && norm(val) === norm(correct)
          const isBad = checked && !isOk
          return (
            <div key={c} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 96, flexShrink: 0, fontWeight: 700, color: 'var(--ink-soft)', fontSize: 12, textAlign: 'right', paddingTop: 10 }}>
                {CASE_LABEL[c]}
              </span>
              {mode === 'type' ? (
                <input value={val} onChange={e => set(c, e.target.value)} disabled={checked} dir="ltr"
                  style={{ flex: 1, padding: '10px 12px', fontSize: 16, borderRadius: 10, fontFamily: 'Georgia,serif',
                    border: `2px solid ${isOk ? 'var(--good)' : isBad ? 'var(--red)' : 'var(--line)'}`, background: 'var(--surface)', color: 'var(--ink)' }} />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {optionsFor[c].map((o, i) => {
                    const chosen = norm(val) === norm(o)
                    const showGood = checked && norm(o) === norm(correct)
                    const showBad = checked && chosen && !showGood
                    return (
                      <button key={i} onClick={() => set(c, o)} disabled={checked}
                        style={{ padding: '8px 12px', borderRadius: 10, fontSize: 15, fontFamily: 'Georgia,serif', cursor: checked ? 'default' : 'pointer',
                          border: `2px solid ${showGood ? 'var(--good)' : showBad ? 'var(--red)' : chosen ? 'var(--accent)' : 'var(--line)'}`,
                          background: chosen && !checked ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)', fontWeight: chosen ? 700 : 500 }}>{o}</button>
                    )
                  })}
                </div>
              )}
              {isBad && <span style={{ fontSize: 13, color: 'var(--good)', fontWeight: 700, flexShrink: 0, paddingTop: 10 }}>{correct}</span>}
            </div>
          )
        })}
      </div>

      {!checked ? (
        <button onClick={check} disabled={!allFilled}
          style={{ padding: '13px', borderRadius: 14, border: 'none', background: allFilled ? 'var(--accent)' : 'var(--surface-2)',
            color: allFilled ? 'var(--accent-ink)' : 'var(--ink-soft)', fontSize: 16, fontWeight: 700, cursor: allFilled ? 'pointer' : 'default' }}>
          {t.exercise?.check || 'Проверить'}
        </button>
      ) : (
        <button onClick={next}
          style={{ padding: '13px', borderRadius: 14, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
          {t.exercise?.next || 'Дальше'}
        </button>
      )}
    </div>
  )
}
