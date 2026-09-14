import { useState, useMemo, useRef, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speak } from '../hooks/useSpeech.jsx'
import { reactToAnswer } from '../utils/praise.js'
import AvatarReaction from './AvatarReaction.jsx'
import ExerciseCardHeader from './ExerciseCardHeader.jsx'
import TapText from './TapText.jsx'
import { buildTokens, shuffleTokens, isAssembledCorrect } from '../utils/sentenceBuild.js'

// «Собери предложение» — режим A0 для упражнения «Напиши предложение».
//
// Эталонная фраза разрезана на слова и перемешана: ученик видит правильные формы,
// но порядок выстраивает сам. Так снимаются обе прежние беды — и «нечего написать»
// (A0 фразу с нуля не строит), и «списал образец, получил 2 из 5».
//
// Проверка здесь же, сравнением строк (utils/sentenceBuild.js): слова взяты из
// эталона, поэтому ИИ не нужен — ответ либо совпал с эталоном, либо нет. Платный
// вызов check-sentence остаётся только у режима «написать самому».
//
// Оценка для SM-2: с первой попытки — 5, со второй — 3, не собрал — 1.
export default function SentenceBuild({
  payload, task, reference, translation, imageUrl, onAnswer, onManual, lessonTitle, typeLabel,
}) {
  const { t, lang } = useI18nStore()
  const tokens = useMemo(() => buildTokens(reference), [reference])
  const [bank, setBank] = useState(() => shuffleTokens(tokens))
  const [answer, setAnswer] = useState([])
  const [attempts, setAttempts] = useState(0)
  // null — ещё собирает, 'ok' — собрал, 'retry' — ошибся, есть вторая попытка,
  // 'fail' — две попытки мимо, показываем эталон и идём дальше.
  const [state, setState] = useState(null)
  const [reaction, setReaction] = useState(null)
  const answeredRef = useRef(false)
  const resultRef = useRef(null)

  const { word_de } = payload

  // После ответа подкручиваем к результату: кнопка «Далее» иначе остаётся за экраном
  useEffect(() => {
    if (state) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 150)
  }, [state])

  const take = (idx) => {
    if (state === 'ok' || state === 'fail') return
    setState(null)
    setAnswer(a => [...a, bank[idx]])
    setBank(b => b.filter((_, i) => i !== idx))
  }

  const putBack = (idx) => {
    if (state === 'ok' || state === 'fail') return
    setState(null)
    setBank(b => [...b, answer[idx]])
    setAnswer(a => a.filter((_, i) => i !== idx))
  }

  const reset = () => {
    if (state === 'ok' || state === 'fail') return
    setState(null)
    setBank(shuffleTokens(tokens))
    setAnswer([])
  }

  const check = () => {
    if (state === 'ok' || state === 'fail') return
    const ok = isAssembledCorrect(answer, reference)
    reactToAnswer(ok, t, lang)
    setReaction(ok ? 'correct' : 'wrong')
    if (ok) {
      setState('ok')
      // Слышать собранную фразу целиком — половина пользы упражнения на A0
      setTimeout(() => speak(reference), 400)
      return
    }
    const used = attempts + 1
    setAttempts(used)
    if (used >= 2) { setState('fail'); return }
    // Первая ошибка — слова возвращаются в банк, порядок перемешиваем заново
    setState('retry')
    setBank(shuffleTokens(tokens))
    setAnswer([])
  }

  const next = () => {
    if (answeredRef.current) return
    answeredRef.current = true
    onAnswer(state === 'ok' ? (attempts === 0 ? 5 : 3) : 1, answer.map(x => x.text).join(' '))
  }

  const done = state === 'ok' || state === 'fail'

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
      <AvatarReaction imageUrl={imageUrl} wordDe={word_de} reaction={reaction} />
      <div className="exercise-card-content" style={{ padding: 24 }}>
        <ExerciseCardHeader typeLabel={typeLabel} lessonTitle={lessonTitle} />

        {/* Слово урока и его перевод — как в остальных типах */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)' }} dir="ltr"><TapText>{word_de}</TapText></span>
          {translation && <span style={{ fontSize: 18, color: 'var(--ink-soft)' }}>— {translation}</span>}
        </div>

        {/* Задание: фраза на языке ученика */}
        <p style={{ color: 'var(--accent)', fontSize: 15, margin: '0 0 8px' }}>{t.exercise.buildTask}</p>
        <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink)', padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--line)', marginBottom: 16 }}>
          {task}
        </div>

        {/* Строка ответа: пусто — пунктирная подсказка, иначе собранные слова */}
        <div style={{ minHeight: 64, borderRadius: 14, border: `2px dashed ${state === 'retry' ? 'var(--red)' : 'var(--line)'}`,
          background: 'var(--surface-2)', padding: 10, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
          {answer.length === 0 ? (
            <span style={{ fontSize: 14, color: 'var(--ink-soft)', alignSelf: 'center' }}>{t.exercise.buildHint}</span>
          ) : answer.map((tok, i) => (
            <button key={tok.id} onClick={() => putBack(i)} disabled={done} dir="ltr"
              style={{ ...chip, background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)',
                cursor: done ? 'default' : 'pointer' }}>
              {tok.text}
            </button>
          ))}
        </div>

        {/* Банк слов. Пустой не рисуем вовсе: пустая полоса между ответом и кнопками
            читалась как «тут что-то не загрузилось». */}
        {!done && bank.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {bank.map((tok, i) => (
              <button key={tok.id} onClick={() => take(i)} dir="ltr" style={{ ...chip, background: 'var(--surface)', color: 'var(--ink)' }}>
                {tok.text}
              </button>
            ))}
          </div>
        )}

        {/* Результат */}
        {state === 'retry' && (
          <div style={{ ...banner, background: 'rgba(192,57,43,0.12)' }}>
            <span style={{ ...mark, background: '#C0392B' }}>✕</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t.exercise.praiseWrong}</span>
          </div>
        )}
        {done && (
          <div ref={resultRef} style={{ ...banner, background: state === 'ok' ? 'rgba(63,191,143,0.16)' : 'rgba(192,57,43,0.12)', flexWrap: 'wrap' }}>
            <span style={{ ...mark, background: state === 'ok' ? '#3FBF8F' : '#C0392B' }}>{state === 'ok' ? '✓' : '✕'}</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{state === 'ok' ? t.exercise.correct : t.exercise.wrong}</span>
            <span style={{ fontSize: 17, fontWeight: 700, width: '100%', paddingLeft: 46 }} dir="ltr">
              <TapText>{reference}</TapText>
            </span>
          </div>
        )}

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!done ? (
            <>
              <button onClick={check} disabled={bank.length > 0 || answer.length === 0}
                style={{ padding: '12px 26px', fontSize: 16, fontWeight: 700, borderRadius: 12, border: 'none',
                  background: bank.length > 0 ? 'var(--line)' : 'var(--accent)',
                  color: bank.length > 0 ? 'var(--ink-soft)' : 'var(--accent-ink)',
                  cursor: bank.length > 0 ? 'not-allowed' : 'pointer' }}>
                {t.exercise.checkAnswer}
              </button>
              {answer.length > 0 && (
                <button onClick={reset}
                  style={{ padding: '12px 18px', fontSize: 15, fontWeight: 600, borderRadius: 12,
                    border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)', cursor: 'pointer' }}>
                  {t.exercise.buildClear}
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => speak(reference)}
                style={{ padding: '12px 18px', fontSize: 16, borderRadius: 12, border: 'none', background: '#9A5CD8', color: '#fff', cursor: 'pointer' }}>
                🔊
              </button>
              <button onClick={next}
                style={{ padding: '12px 26px', fontSize: 16, fontWeight: 700, borderRadius: 12, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer' }}>
                {t.exercise.next}
              </button>
            </>
          )}
        </div>

        {/* Свободный ввод остаётся для тех, кто уже пишет сам: та же фраза, но
            проверяет её модель. Кнопка неброская — на A0 это не основной путь. */}
        {!done && onManual && (
          <button onClick={onManual}
            style={{ marginTop: 14, padding: 0, border: 'none', background: 'transparent', color: 'var(--ink-soft)',
              fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>
            {t.exercise.writeMyself}
          </button>
        )}
      </div>
    </div>
  )
}

const chip = {
  padding: '10px 14px', fontSize: 17, fontWeight: 600, borderRadius: 12,
  border: '2px solid var(--line)', cursor: 'pointer', lineHeight: 1.2,
}

const banner = {
  marginBottom: 14, padding: '14px 16px', borderRadius: 14,
  display: 'flex', alignItems: 'center', gap: 12,
}

const mark = {
  width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'grid',
  placeItems: 'center', color: '#fff', fontWeight: 800,
}
