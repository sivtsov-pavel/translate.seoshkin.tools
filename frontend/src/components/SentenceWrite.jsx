import { useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getTranslation } from '../utils/translation.js'
import AvatarReaction from './AvatarReaction.jsx'
import ExerciseCardHeader from './ExerciseCardHeader.jsx'
import TapText from './TapText.jsx'
import { shouldAutoFocus } from '../utils/device.js'

export default function SentenceWrite({ exercise, onAnswer, payloadTranslations, showOriginal, lessonTitle, typeLabel }) {
  const [sentence, setSentence] = useState('')
  const [result, setResult] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t, lang } = useI18nStore()
  const pTranslations = payloadTranslations || exercise.payload_translations
  const { word_de, translation_ru, hint_ru, example, example_ru } = exercise.payload
  // Режим ПЕРЕВОДА: есть русская фраза-задание и эталон. Свободное сочинение на A1 не
  // работает — ученик ещё не строит фразы сам, а списанный со страницы пример проверка
  // оценивала на 2 из 5. Старые упражнения без example_ru показываем по-прежнему.
  const isTranslation = Boolean(example_ru && example)
  const displayTranslation = getTranslation(exercise.translations, lang, exercise.translation_ru || translation_ru)
  const displayHint = getTranslation(pTranslations, lang, hint_ru)

  const handleCheck = async (e) => {
    e.preventDefault()
    if (!sentence.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post(`/exercises/${exercise.id}/check-sentence`, { sentence, lang })
      setResult(res)
      setReaction(res.quality >= 3 ? 'correct' : 'wrong')  // Pablo реагирует
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const qualityColor = (q) => {
    if (q >= 4) return 'var(--good)'
    if (q >= 3) return '#B07D1B'
    return 'var(--red)'
  }

  const qualityStars = (q) => '★'.repeat(q) + '☆'.repeat(5 - q)

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
      <AvatarReaction imageUrl={exercise.image_url} wordDe={word_de} reaction={reaction} />
      <div className="exercise-card-content" style={{ padding: 24 }}>
      <ExerciseCardHeader typeLabel={typeLabel} lessonTitle={lessonTitle} />
      {/* Задание */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          {t.exercise.sentenceWrite}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}><TapText>{word_de}</TapText></span>
          <span style={{ fontSize: 18, color: 'var(--ink-soft)' }}>— {displayTranslation}</span>
        </div>
        {isTranslation ? (
          <>
            <p style={{ color: 'var(--accent)', fontSize: 15, margin: '0 0 8px' }}>
              {t.exercise.translateToTarget || 'Напиши это предложение по-немецки:'}
            </p>
            <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ink)', padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--line)' }}>
              {example_ru}
            </div>
          </>
        ) : (
          <>
            {displayHint && <p style={{ color: 'var(--accent)', fontSize: 15, margin: 0 }}>{displayHint}</p>}
            {/* Эталон до ответа не показываем: ученик списывал его и получал низкую оценку. */}
          </>
        )}
      </div>

      {/* Поле ввода */}
      {!result ? (
        <form onSubmit={handleCheck}>
          <textarea
            value={sentence}
            onChange={e => setSentence(e.target.value)}
            placeholder={t.exercise.sentencePlaceholder}
            rows={3}
            autoFocus={shouldAutoFocus()}
            style={{ width: '100%', fontSize: 16, resize: 'vertical', marginBottom: 12, boxSizing: 'border-box' }}
          />
          {error && <p style={{ color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !sentence.trim()}
            style={{
              padding: '10px 24px', fontSize: 16, fontWeight: 600,
              background: !sentence.trim() || loading ? 'var(--line)' : 'var(--accent)',
              color: !sentence.trim() || loading ? 'var(--ink-soft)' : 'var(--accent-ink)',
              border: 'none', borderRadius: 10,
              cursor: !sentence.trim() || loading ? 'not-allowed' : 'pointer',
            }}>
            {loading ? t.exercise.sentenceChecking : t.exercise.checkAnswer}
          </button>
        </form>
      ) : (
        <div>
          {/* Написанное предложение */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, borderLeft: `4px solid ${qualityColor(result.quality)}` }}>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>{t.exercise.yourSentence}:</div>
            <div style={{ fontSize: 17, color: 'var(--ink)' }}>{sentence}</div>
          </div>

          {/* Оценка */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 22, color: qualityColor(result.quality) }}>{qualityStars(result.quality)}</span>
            <span style={{ fontWeight: 700, color: qualityColor(result.quality), fontSize: 16 }}>{result.quality}/5</span>
          </div>

          <p style={{ fontSize: 15, color: 'var(--ink)', marginBottom: result.corrected ? 12 : 20 }}>
            {result.feedback_ru}
          </p>

          {/* Эталон показываем ПОСЛЕ ответа: до ответа он был подсказкой, которую ученик
              списывал и получал за это низкую оценку. */}
          {isTranslation && (
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>{t.exercise.sentenceExample}:</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}><TapText>{example}</TapText></div>
            </div>
          )}
          {result.corrected ? (
            <div style={{ background: 'rgba(78,154,110,0.12)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--good)', marginBottom: 4 }}>{t.exercise.correctedVersion}:</div>
              <div style={{ fontSize: 16, color: 'var(--good)', fontWeight: 500 }}>{result.corrected}</div>
              {/* Перевод исправленного предложения — чтобы понимать смысл (A2) */}
              {result.corrected_translation && (
                <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontStyle: 'italic', marginTop: 4 }}>{result.corrected_translation}</div>
              )}
            </div>
          ) : (
            /* Ошибок нет — показываем перевод собственного предложения ученика (A2) */
            result.corrected_translation && (
              <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontStyle: 'italic', marginBottom: 16 }}>
                {result.corrected_translation}
              </div>
            )
          )}

          <button
            onClick={() => onAnswer(result.quality, sentence)}
            style={{ padding: '10px 24px', fontSize: 16, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
            {t.exercise.next}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
