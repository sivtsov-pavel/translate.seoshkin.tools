import { useState, useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { speak, speakAuto } from '../hooks/useSpeech.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'
import WordImage from './WordImage.jsx'

// Упражнение «Артикль»: der / die / das к существительному.
//
// Артикль невозможно выучить карточкой «die — определённый артикль женского рода»:
// он живёт только вместе со словом. Поэтому вместо служебных карточек — выбор
// артикля к настоящему существительному, с картинкой и переводом.
//
// Формы приходят из payload (посчитаны на бэке разбором слова), ИИ не участвует.
const OPTIONS = ['der', 'die', 'das']

export default function ArticleExercise({ payload, onAnswer, imageUrl }) {
  const { t } = useI18nStore()
  const [picked, setPicked] = useState(null)
  const { noun, article, translation_ru } = payload || {}

  useEffect(() => { if (noun) speakAuto(`${article} ${noun}`) }, [noun])

  const choose = (opt) => {
    if (picked) return
    setPicked(opt)
    if (opt === article) playCorrect(); else playWrong()
    // Верный ответ проговариваем целиком — так артикль и слово запоминаются вместе
    setTimeout(() => speak(`${article} ${noun}`), 250)
  }

  const ok = picked === article

  return (
    <div style={{ width: '100%', paddingBottom: 16 }}>
      <div className="exercise-card" style={{ borderRadius: 26, background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 16, padding: 20 }}>
        {imageUrl && (
          <div style={{ borderRadius: 20, overflow: 'hidden', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', marginBottom: 18, aspectRatio: '4 / 3' }}>
            <WordImage imageUrl={imageUrl} wordDe={noun} bleed />
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {t.exercise.article || 'Артикль'}
          </div>
          <div className="exercise-word-de" style={{ fontSize: 32, fontWeight: 800, marginTop: 6 }} dir="ltr">
            {picked ? `${article} ${noun}` : `___ ${noun}`}
          </div>
          {translation_ru && (
            <div style={{ fontSize: 15, color: 'var(--ink-soft)', marginTop: 6 }}>{translation_ru}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {OPTIONS.map(opt => {
          const isCorrect = picked && opt === article
          const isWrong = picked === opt && opt !== article
          return (
            <button key={opt} onClick={() => choose(opt)} disabled={!!picked}
              style={{
                flex: 1, minHeight: 64, borderRadius: 18, fontSize: 20, fontWeight: 800,
                cursor: picked ? 'default' : 'pointer',
                border: `2px solid ${isCorrect ? '#3FBF8F' : isWrong ? '#C0392B' : 'var(--line)'}`,
                background: isCorrect ? 'rgba(63,191,143,0.16)' : isWrong ? 'rgba(192,57,43,0.12)' : 'var(--surface)',
                color: 'var(--ink)',
              }}>{opt}</button>
          )
        })}
      </div>

      {picked && (
        <>
          <div style={{
            marginTop: 14, padding: '13px 16px', borderRadius: 16,
            background: ok ? 'rgba(63,191,143,0.16)' : 'rgba(192,57,43,0.12)',
            fontSize: 15, fontWeight: 700,
          }}>
            {ok ? `✓ ${t.exercise.correct}` : `✗ ${t.exercise.wrong} — ${article} ${noun}`}
          </div>
          <button onClick={() => onAnswer(ok ? 5 : 1)}
            style={{ width: '100%', minHeight: 60, marginTop: 12, borderRadius: 18, border: 'none',
              background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
            {t.exercise.next || 'Дальше'}
          </button>
        </>
      )}
    </div>
  )
}
