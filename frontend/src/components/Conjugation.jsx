import { useState, useEffect, useMemo } from 'react'
import { speak } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'
import ExerciseCardHeader from './ExerciseCardHeader.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'

// Упражнение «Склонение/спряжение»: инфинитив + 6 форм (ich/du/er/wir/ihr/sie) на одной странице.
// Два режима: «выбрать» (варианты из форм этого же глагола) и «вписать руками». Формы приходят
// в payload.forms (посчитаны rule-based конъюгатором на бэке — без OpenAI).
const PERSONS = ['ich', 'du', 'er', 'wir', 'ihr', 'sie']
const PRONOUN = { ich: 'ich', du: 'du', er: 'er / sie / es', wir: 'wir', ihr: 'ihr', sie: 'sie / Sie' }

const norm = s => String(s || '').trim().toLowerCase()
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }

export default function Conjugation({ payload, onAnswer, lessonTitle, typeLabel }) {
  const { t } = useI18nStore()
  const { infinitive, translation_ru, forms } = payload || {}
  const [mode, setMode] = useState('choose')          // 'choose' | 'type'
  const [answers, setAnswers] = useState({})           // { person: строка }
  const [checked, setChecked] = useState(false)

  useEffect(() => { setTimeout(() => speak(infinitive, 'de-DE', 0.85), 300) }, [infinitive])

  // Варианты для режима «выбрать»: уникальные формы этого глагола (+ инфинитив как отвлекающий)
  const pool = useMemo(() => {
    const set = new Set(PERSONS.map(p => forms?.[p]).filter(Boolean))
    set.add(infinitive)
    return [...set]
  }, [forms, infinitive])

  const optionsFor = useMemo(() => {
    const map = {}
    for (const p of PERSONS) {
      const correct = forms?.[p]
      const others = shuffle(pool.filter(w => norm(w) !== norm(correct))).slice(0, 3)
      map[p] = shuffle([correct, ...others])
    }
    return map
  }, [pool, forms])

  const set = (p, v) => { if (!checked) setAnswers(a => ({ ...a, [p]: v })) }

  const check = () => {
    let ok = 0
    for (const p of PERSONS) if (norm(answers[p]) === norm(forms?.[p])) ok++
    setChecked(true)
    if (ok === PERSONS.length) playCorrect(); else playWrong()
  }

  const next = () => {
    let ok = 0
    for (const p of PERSONS) if (norm(answers[p]) === norm(forms?.[p])) ok++
    const quality = ok === 6 ? 5 : ok >= 4 ? 4 : ok >= 2 ? 2 : 1
    onAnswer(quality, PERSONS.map(p => answers[p] || '').join(', '))
  }

  const allFilled = PERSONS.every(p => (answers[p] || '').trim())

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExerciseCardHeader typeLabel={typeLabel} lessonTitle={lessonTitle} />

      {/* Инфинитив + перевод */}
      <div style={{ textAlign: 'center', padding: '16px', background: 'var(--surface-2)', borderRadius: 16 }}>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 30, fontWeight: 700, color: 'var(--accent)' }}>{infinitive}</div>
        {translation_ru && <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>{translation_ru}</div>}
        <button onClick={() => speak(infinitive, 'de-DE', 0.85)}
          style={{ marginTop: 8, padding: '3px 12px', borderRadius: 20, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 13, cursor: 'pointer' }}>🔊</button>
      </div>

      {/* Переключатель режима */}
      {!checked && (
        <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', alignSelf: 'center' }}>
          {[['choose', t.exercise?.conjChoose || 'Выбрать'], ['type', t.exercise?.conjType || 'Вписать руками']].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setAnswers({}) }}
              style={{ padding: '7px 16px', border: 'none', fontSize: 13, fontWeight: mode === m ? 700 : 500, cursor: 'pointer', background: mode === m ? 'var(--accent)' : 'var(--surface-2)', color: mode === m ? 'var(--accent-ink)' : 'var(--ink)' }}>{label}</button>
          ))}
        </div>
      )}

      {/* 6 форм */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PERSONS.map(p => {
          const correct = forms?.[p]
          const val = answers[p] || ''
          const isOk = checked && norm(val) === norm(correct)
          const isBad = checked && !isOk
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 78, flexShrink: 0, fontWeight: 700, color: 'var(--ink-soft)', fontSize: 14, textAlign: 'right' }}>{PRONOUN[p]}</span>
              {mode === 'type' ? (
                <input value={val} onChange={e => set(p, e.target.value)} disabled={checked} dir="ltr"
                  style={{ flex: 1, padding: '10px 12px', fontSize: 16, borderRadius: 10, fontFamily: 'Georgia,serif',
                    border: `2px solid ${isOk ? 'var(--good)' : isBad ? 'var(--red)' : 'var(--line)'}`, background: 'var(--surface)', color: 'var(--ink)' }} />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {optionsFor[p].map((o, i) => {
                    const chosen = norm(val) === norm(o)
                    const showGood = checked && norm(o) === norm(correct)
                    const showBad = checked && chosen && !showGood
                    return (
                      <button key={i} onClick={() => set(p, o)} disabled={checked}
                        style={{ padding: '8px 12px', borderRadius: 10, fontSize: 15, fontFamily: 'Georgia,serif', cursor: checked ? 'default' : 'pointer',
                          border: `2px solid ${showGood ? 'var(--good)' : showBad ? 'var(--red)' : chosen ? 'var(--accent)' : 'var(--line)'}`,
                          background: chosen && !checked ? 'var(--accent-soft)' : 'var(--surface)', color: 'var(--ink)', fontWeight: chosen ? 700 : 500 }}>{o}</button>
                    )
                  })}
                </div>
              )}
              {isBad && <span style={{ fontSize: 13, color: 'var(--good)', fontWeight: 700, flexShrink: 0 }}>{correct}</span>}
            </div>
          )
        })}
      </div>

      {!checked ? (
        <button onClick={check} disabled={!allFilled}
          style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 700, cursor: allFilled ? 'pointer' : 'default', opacity: allFilled ? 1 : 0.5 }}>
          {t.exercise?.checkAnswer || 'Проверить'}
        </button>
      ) : (
        <button onClick={next}
          style={{ padding: '14px', borderRadius: 12, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
          {t.exercise?.next || 'Далее'} →
        </button>
      )}
    </div>
  )
}
