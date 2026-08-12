import { useState, useEffect, useRef } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speakAuto, speak } from '../hooks/useSpeech.jsx'
import AvatarReaction from './AvatarReaction.jsx'
import { getTranslation } from '../utils/translation.js'
import TapText from './TapText.jsx'

// Карточка слова для режима новичка — макет 2b, экран C.
//
// Отличия от обычной карточки: фото занимает весь верх блока, слово крупное (34),
// рядом чип рода, ниже пример «в предложении» с подсветкой изучаемого слова.
// Оценок по-прежнему три (SM-2 без них деградирует), но по макету крупных кнопок две —
// «Понятно» и «Ещё не выучил», а «Сложно» стоит между ними неброской строкой.
//
// Обычный Flashcard не трогаем: он работает и остаётся для режима эксперта.

// Род по артиклю: в макете чип вида «die · f»
const GENDER = { der: 'm', die: 'f', das: 'n' }
function genderOf(word) {
  const art = String(word || '').trim().split(/\s+/)[0]?.toLowerCase()
  return GENDER[art] ? { article: art, mark: GENDER[art] } : null
}

// Подсветка изучаемого слова в примере: ищем корень без артикля
function highlight(sentence, word) {
  const bare = String(word || '').replace(/^(der|die|das)\s+/i, '').trim()
  if (!bare || !sentence) return [sentence, null, null]
  const idx = sentence.toLowerCase().indexOf(bare.toLowerCase())
  if (idx < 0) return [sentence, null, null]
  return [sentence.slice(0, idx), sentence.slice(idx, idx + bare.length), sentence.slice(idx + bare.length)]
}

export default function FlashcardNovice({
  payload, onAnswer, imageUrl, translations, translationRu, wordId, onMarkLearning, learned,
  exampleSentence, exampleSentenceRu,
}) {
  const [revealed, setRevealed] = useState(false)
  const [reaction, setReaction] = useState(null)
  const [grading, setGrading] = useState(false)
  const [inStudy, setInStudy] = useState(!!learned)
  const gradeRef = useRef(0)
  const { t, lang } = useI18nStore()

  useEffect(() => { speakAuto(payload.question) }, [payload.question])

  const answer = getTranslation(translations, lang, translationRu || payload.answer)
  const gender = genderOf(payload.question)
  const [before, match, after] = highlight(exampleSentence, payload.question)

  const grade = (q) => {
    if (grading) return
    setGrading(true)
    gradeRef.current = q
    if (q === 3) { setTimeout(() => onAnswer(q), 300); return }
    setReaction(q >= 4 ? 'correct' : 'wrong')
  }

  const addToStudy = () => {
    if (inStudy || !wordId) return
    setInStudy(true)
    onMarkLearning?.(wordId)
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="exercise-card" style={{ borderRadius: 28, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 14 }}>
        <AvatarReaction imageUrl={imageUrl} wordDe={payload.question} reaction={reaction}
          onReactionEnd={() => onAnswer(gradeRef.current)} />

        {/* Картинку рисует AvatarReaction (WordImage bleed) — на всю ширину блока.
            Своего <img> здесь быть не должно: получался дубль одной и той же картинки. */}

        <div className="exercise-card-content" style={{ padding: '18px 22px 22px' }}>
          <div className="exercise-word-de" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }} dir="ltr">
            <TapText>{payload.question}</TapText>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {gender && (
              <span style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--accent-soft, rgba(154,92,216,0.18))', color: 'var(--accent)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {gender.article} · {gender.mark}
              </span>
            )}
            {revealed
              ? <span style={{ fontSize: 21, fontWeight: 500 }}>{answer}</span>
              : <button onClick={() => setRevealed(true)}
                  style={{ border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 14, cursor: 'pointer', padding: 0 }}>
                  {t.exercise.tapToReveal}
                </button>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => speak(payload.question)}
              style={{ flex: 1, minHeight: 52, borderRadius: 15, border: 'none', background: '#9A5CD8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              🔊 {t.exercise.listen || 'Слушать'}
            </button>
            {wordId && (
              <button onClick={addToStudy} disabled={inStudy}
                title={t.exercise?.addToStudyHint || 'Добавить слово в изучение'}
                style={{ width: 52, height: 52, borderRadius: 15, border: '1px solid var(--line)', background: inStudy ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--surface-2)', color: inStudy ? 'var(--good)' : 'var(--ink-soft)', fontSize: 19, cursor: inStudy ? 'default' : 'pointer' }}>
                ★
              </button>
            )}
          </div>
        </div>
      </div>

      {/* «В предложении» — слово в живом контексте, с подсветкой */}
      {exampleSentence && (
        <div style={{ borderRadius: 22, border: '1px solid var(--line)', background: 'var(--surface-2)', padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }} dir="ltr">
            {match
              ? <>{before}<span style={{ color: '#E8B024' }}>{match}</span>{after}</>
              : exampleSentence}
          </div>
          {exampleSentenceRu && (
            <div style={{ fontSize: 15, color: 'var(--ink-soft)', marginTop: 6 }}>{exampleSentenceRu}</div>
          )}
        </div>
      )}

      {revealed && (
        <div style={{ opacity: grading ? 0.6 : 1, pointerEvents: grading ? 'none' : 'auto' }}>
          <button onClick={() => grade(5)}
            style={{ width: '100%', minHeight: 60, borderRadius: 18, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.remembered}
          </button>
          <button onClick={() => grade(1)}
            style={{ width: '100%', minHeight: 52, marginTop: 10, borderRadius: 16, border: '2px solid var(--line)', background: 'transparent', color: 'var(--ink)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.forgot}
          </button>
          <button onClick={() => grade(3)}
            style={{ width: '100%', marginTop: 8, border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '8px 0' }}>
            {t.exercise.hard}
          </button>
        </div>
      )}
    </div>
  )
}
