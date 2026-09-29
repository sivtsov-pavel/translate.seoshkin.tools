import { useState, useEffect, useRef } from 'react'
import { useIdleHint } from '../hooks/useIdleHint.js'
import { useI18nStore } from '../store/i18n.js'
import { speakSequence, speakSequenceAuto } from '../hooks/useSpeech.jsx'
import AvatarReaction from './AvatarReaction.jsx'
import { getTranslation } from '../utils/translation.js'
import TapText from './TapText.jsx'

// Карточка слова для режима новичка — макет 2b, экран C.
//
// Поток (уточнён Павлом 29.09.2026 — вернулись к прежнему, с двумя добавками):
//
//   1. Карточка сама читает слово, затем через паузу предложение с ним.
//   2. Перевод СЛОВА спрятан до «Показать ответ» — это проверка памяти.
//   3. Перевод ПРЕДЛОЖЕНИЯ виден сразу: по нему человек читает смысл по-русски и
//      думает, как сказать это по-немецки. Именно этого не хватало раньше.
//   4. После раскрытия снизу выезжают ТРИ оценки.
//
// Почему три, а не две. 28.09 оценок оставили две, и это была ошибка: в SM-2
// (backend/src/services/srs.js) оценка 3 снижает лёгкость на 0.14, НЕ сбрасывая
// прогресс. Без неё остаётся «интервал вырос» или «сброс в ноль», и слово,
// которое знаешь наполовину, вечно начинает заново. Павел это заметил сам.

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
  exampleSentence, exampleSentenceRu, exampleTranslations,
}) {
  const [revealed, setRevealed] = useState(false)
  // Завис на пять секунд — «Показать ответ» начинает мягко пульсировать.
  // Жалоба ученика дословно: «пока я не нажму, я не в курсе, что мне нужно нажать».
  const stuck = useIdleHint(5000, !revealed)
  const [reaction, setReaction] = useState(null)
  const [grading, setGrading] = useState(false)
  const [inStudy, setInStudy] = useState(!!learned)
  const gradeRef = useRef(0)
  const { t, lang } = useI18nStore()

  const answer = getTranslation(translations, lang, translationRu || payload.answer)
  const gender = genderOf(payload.question)
  const [before, match, after] = highlight(exampleSentence, payload.question)
  // Перевод примера на язык ИНТЕРФЕЙСА. Русская колонка остаётся запасным
  // вариантом: у части слов девяти локалей ещё нет, и пустая строка там, где
  // раньше был хоть какой-то перевод, — шаг назад.
  const exampleTr = getTranslation(exampleTranslations, lang, exampleSentenceRu)

  // Слово, пауза, предложение с ним — одной цепочкой. Зависимость по тексту
  // примера тоже нужна: карточки идут подряд, и без неё вторая карточка с тем же
  // словом (единственное/множественное) читала бы пример от первой.
  useEffect(() => {
    speakSequenceAuto([payload.question, exampleSentence])
  }, [payload.question, exampleSentence])

  // Сбрасывать revealed при смене слова не нужно: сессия отдаёт карточку с
  // key={ex.id} (pages/ExerciseSession.jsx), компонент пересоздаётся и состояние
  // начинается заново. Лишний эффект тут только сбивал бы с толку.
  const grade = (q) => {
    if (grading) return
    setGrading(true)
    gradeRef.current = q
    // «С трудом» без реакции аватара: она читается как оценка «верно/неверно»,
    // а середина — ни то, ни другое.
    if (q === 3) { setTimeout(() => onAnswer(q), 300); return }
    setReaction(q >= 4 ? 'correct' : 'wrong')
  }

  const addToStudy = () => {
    if (inStudy || !wordId) return
    setInStudy(true)
    onMarkLearning?.(wordId)
  }

  return (
    <div style={{ width: '100%' }}>
      <div className="exercise-card" onClick={!revealed ? () => setRevealed(true) : undefined}
        style={{ borderRadius: 28, overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)',
          marginBottom: 14, cursor: revealed ? 'default' : 'pointer', userSelect: 'none' }}>
        {/* Картинка — во всю ширину блока (просьба Павла 13.08). Высоту ограничивает
            .novice-card-media: на ноуте квадрат в колонку 620px съедал весь экран. */}
        <div style={{ padding: 20, paddingBottom: 0 }}>
          <div className="novice-card-media"
            style={{ borderRadius: 20, overflow: 'hidden', background: 'var(--surface-2)',
              display: 'grid', placeItems: 'center', aspectRatio: '1 / 1' }}>
            <AvatarReaction imageUrl={imageUrl} wordDe={payload.question} reaction={reaction} fill
              onReactionEnd={() => onAnswer(gradeRef.current)} />
          </div>
        </div>

        <div className="exercise-card-content" style={{ padding: '18px 22px 22px', textAlign: 'center' }}>
          <div className="exercise-word-de" style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }} dir="ltr">
            <TapText>{payload.question}</TapText>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {gender && (
              <span style={{ padding: '6px 12px', borderRadius: 999, background: 'var(--accent-soft, rgba(154,92,216,0.18))', color: 'var(--accent)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {gender.article} · {gender.mark}
              </span>
            )}
            {revealed && <span style={{ fontSize: 21, fontWeight: 500 }}>{answer}</span>}
          </div>

          {!revealed && (
            <button onClick={() => setRevealed(true)}
              className={stuck ? 'dl-idle-pulse' : undefined}
              style={{ width: '100%', minHeight: 52, marginTop: 16, borderRadius: 15, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
              {t.exercise.showAnswer}
            </button>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {/* «Слушать» повторяет всю цепочку целиком — слово и пример.
                Отдельно слово человек уже услышал, а повторить обычно хотят оба. */}
            <button onClick={(e) => { e.stopPropagation(); speakSequence([payload.question, exampleSentence]) }}
              style={{ flex: 1, minHeight: 52, borderRadius: 15, border: 'none', background: '#9A5CD8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              🔊 {t.exercise.listen || 'Слушать'}
            </button>
            {wordId && (
              <button onClick={(e) => { e.stopPropagation(); addToStudy() }} disabled={inStudy}
                title={t.exercise?.addToStudyHint || 'Добавить слово в изучение'}
                style={{ width: 52, height: 52, borderRadius: 15, border: '1px solid var(--line)', background: inStudy ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--surface-2)', color: inStudy ? 'var(--good)' : 'var(--ink-soft)', fontSize: 19, cursor: inStudy ? 'default' : 'pointer' }}>
                ★
              </button>
            )}
          </div>
        </div>
      </div>

      {/* «В предложении» — слово в живом контексте, с подсветкой и переводом */}
      {exampleSentence && (
        <div style={{ borderRadius: 22, border: '1px solid var(--line)', background: 'var(--surface-2)', padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35 }} dir="ltr">
            {match
              ? <>{before}<span style={{ color: '#E8B024' }}>{match}</span>{after}</>
              : exampleSentence}
          </div>
          {exampleTr && (
            <div style={{ fontSize: 15, color: 'var(--ink-soft)', marginTop: 6 }}>{exampleTr}</div>
          )}
        </div>
      )}

      {/* Три оценки, выезжают снизу после раскрытия — как было до 28.09.
          Средняя нужна SM-2: без неё половинчатое знание нечем выразить. */}
      {revealed && (
        <div className="dl-grades-in"
          style={{ display: 'flex', gap: 8, opacity: grading ? 0.6 : 1, pointerEvents: grading ? 'none' : 'auto' }}>
          <button onClick={() => grade(1)}
            style={{ flex: 1, minHeight: 58, borderRadius: 16, border: '2px solid var(--line)', background: 'transparent', color: 'var(--ink)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.notUnderstood}
          </button>
          <button onClick={() => grade(3)}
            style={{ flex: 1, minHeight: 58, borderRadius: 16, border: '2px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.hard}
          </button>
          <button onClick={() => grade(5)}
            style={{ flex: 1.2, minHeight: 58, borderRadius: 16, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
            {t.exercise.understood}
          </button>
        </div>
      )}
    </div>
  )
}
