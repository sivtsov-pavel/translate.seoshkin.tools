import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle, getTranslation } from '../utils/translation.js'

// Печатный лист упражнений урока — один лист A4 (ч/б-дружелюбно).
// URL: /print/:lessonId. Учитель открывает с карточки набора и жмёт «Печать».
// Состав: «вставь буквы» (letter_fill), «вставь слово» (fill_blank из реальных
// предложений набора) и мелкий блок «слова урока».

const MAX_LETTER_FILL = 10 // лимиты, чтобы гарантированно влезть на один лист
const MAX_FILL_BLANK  = 8
const MAX_WORDS       = 10

export default function PrintSheet() {
  const { lessonId } = useParams()
  const { t, lang } = useI18nStore()
  const [data, setData]   = useState(null)
  const [words, setWords] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get(`/lessons/${lessonId}/print`),
      api.get(`/lessons/${lessonId}/words`),
    ])
      .then(([printData, lessonWords]) => { setData(printData); setWords(lessonWords) })
      .catch(e => setError(e?.message || t.common.error))
  }, [lessonId])

  if (error) return <p style={{ padding: 20 }}>{error}</p>
  if (!data) return <p style={{ padding: 20, color: '#888' }}>…</p>

  const title = getLessonTitle(data.lesson.title, data.lesson.title_translations, lang) || data.lesson.title

  // Дедуп: по слову для «вставь буквы», по предложению для «вставь слово»
  const letterFill = []
  const seenWords = new Set()
  for (const e of data.exercises.filter(e => e.type === 'letter_fill')) {
    const key = (e.payload?.word_de || e.word_de || '').toLowerCase()
    if (!key || seenWords.has(key) || !e.payload?.masked) continue
    seenWords.add(key)
    letterFill.push(e)
    if (letterFill.length >= MAX_LETTER_FILL) break
  }

  const fillBlank = []
  const seenSentences = new Set()
  for (const e of data.exercises.filter(e => e.type === 'fill_blank')) {
    const s = e.payload?.sentence
    if (!s || !s.includes('___') || seenSentences.has(s)) continue
    seenSentences.add(s)
    fillBlank.push(e)
    if (fillBlank.length >= MAX_FILL_BLANK) break
  }

  // Банк слов для пропусков — в перемешанном порядке (стабильно по алфавиту наоборот
  // не годится: подсказка не должна совпадать с порядком заданий)
  const wordBank = [...new Set(fillBlank.map(e => e.payload.blank).filter(Boolean))]
    .sort(() => 0.5 - Math.random())

  const sheetWords = words.slice(0, MAX_WORDS)

  // «H__s» → подчёркивания вместо пропусков, моноширинно и разрежённо для вписывания
  const renderMasked = (masked) => (
    <span style={{ fontFamily: 'monospace', fontSize: '13pt', letterSpacing: 2 }}>
      {[...masked].map((ch, i) => ch === '_' ? <span key={i} style={{ borderBottom: '1.5px solid #000', display: 'inline-block', minWidth: 14 }}>&nbsp;</span> : ch)}
    </span>
  )

  return (
    <div className="print-sheet">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        .print-sheet {
          max-width: 186mm; margin: 0 auto; padding: 16px;
          background: #fff; color: #000;
          font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.45;
        }
        .print-sheet h1 { font-size: 15pt; margin: 0; }
        .print-sheet h2 { font-size: 11.5pt; margin: 14px 0 6px; border-bottom: 1.5px solid #000; padding-bottom: 2px; }
        .print-sheet .blank-line { display: inline-block; min-width: 90px; border-bottom: 1.5px solid #000; }
        .print-sheet ol { margin: 4px 0; padding-left: 22px; }
        .print-sheet li { margin-bottom: 7px; }
      `}</style>

      {/* Кнопка печати — видна на экране, не попадает на лист */}
      <div className="no-print" style={{ textAlign: 'right', marginBottom: 10 }}>
        <button onClick={() => window.print()}
          style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#3b7a57', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          🖨️ {t.print.print}
        </button>
      </div>

      {/* Шапка листа: название урока + Имя/Дата */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, borderBottom: '2px solid #000', paddingBottom: 6 }}>
        <h1>{title}</h1>
        <div style={{ fontSize: '10pt', whiteSpace: 'nowrap' }}>
          {t.print.name}: <span className="blank-line" style={{ minWidth: 110 }} />&nbsp;&nbsp;
          {t.print.date}: <span className="blank-line" style={{ minWidth: 70 }} />
        </div>
      </div>

      {/* 1. Вставь пропущенные буквы */}
      {letterFill.length > 0 && (
        <>
          <h2>1. {t.print.letterFillTask}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24, rowGap: 7 }}>
            {letterFill.map(e => (
              <div key={e.id}>
                {renderMasked(e.payload.masked)}
                <span style={{ fontSize: '9.5pt', color: '#444' }}>
                  {' '}— {getTranslation(e.translations, lang, e.payload.translation_ru || e.translation_ru)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 2. Вставь слово в предложение (реальные предложения набора) */}
      {fillBlank.length > 0 && (
        <>
          <h2>{letterFill.length > 0 ? '2' : '1'}. {t.print.fillBlankTask}</h2>
          {wordBank.length > 0 && (
            <div style={{ border: '1px solid #000', borderRadius: 4, padding: '4px 10px', fontSize: '10pt', marginBottom: 6 }}>
              <b>{t.print.wordBank}:</b> {wordBank.join(' · ')}
            </div>
          )}
          <ol>
            {fillBlank.map(e => (
              <li key={e.id}>
                {e.payload.sentence.split('___').map((part, i, arr) => (
                  <span key={i}>{part}{i < arr.length - 1 && <span className="blank-line" />}</span>
                ))}
              </li>
            ))}
          </ol>
        </>
      )}

      {/* 3. Слова урока — мелкий справочный блок */}
      {sheetWords.length > 0 && (
        <>
          <h2>{(letterFill.length > 0 ? 1 : 0) + (fillBlank.length > 0 ? 1 : 0) + 1}. {t.print.lessonWords}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24, rowGap: 2, fontSize: '9.5pt' }}>
            {sheetWords.map(w => (
              <div key={w.id}>
                <b>{w.word_de}</b> — {getTranslation(w.translations, lang, w.translation_ru)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
