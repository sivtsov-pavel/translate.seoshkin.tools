import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getTranslation } from '../utils/translation.js'
import { generateCrossword } from '../utils/crossword.js'
import { speak } from '../hooks/useSpeech.jsx'
import { ex } from '../utils/extraI18n.js'

export default function Crossword() {
  const [params] = useSearchParams()
  const { t, lang } = useI18nStore()
  const [allWords, setAllWords] = useState([])
  const [puzzle, setPuzzle] = useState(null)
  const [answers, setAnswers] = useState({})   // "r,c" -> буква
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lessons, setLessons] = useState([])
  // Источник слов: '' = все, 'learning' = в изучении, либо id урока
  const [source, setSource] = useState(params.get('lesson_id') || '')

  // Список уроков для выбора
  useEffect(() => { api.get('/lessons').then(setLessons).catch(() => {}) }, [])

  // Загружаем слова по выбранному источнику
  useEffect(() => {
    setLoading(true)
    const url = source === '' ? '/words'
      : source === 'learning' ? '/words?status=learning'
      : `/lessons/${source}/words`
    api.get(url).then(rows => {
      const items = (rows || [])
        .map(w => ({ word: (w.word_de || '').replace(/^(der|die|das|ein|eine)\s+/i, ''), clue: getTranslation(w.translations, lang, w.translation_ru), de: w.word_de }))
        .filter(w => w.word && w.clue && /^[A-Za-zÄÖÜäöüß]{3,9}$/.test(w.word))
      setAllWords(items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [source, lang])

  const build = useCallback(() => {
    if (!allWords.length) return
    // берём случайную выборку и пробуем собрать кроссворд (несколько попыток)
    for (let attempt = 0; attempt < 8; attempt++) {
      const shuffled = [...allWords].sort(() => Math.random() - 0.5).slice(0, 14)
      const p = generateCrossword(shuffled, 11)
      if (p && p.entries.length >= 4) { setPuzzle(p); setAnswers({}); setChecked(false); return }
    }
    // фолбэк — что получится
    const p = generateCrossword([...allWords].sort(() => Math.random() - 0.5).slice(0, 14), 11)
    setPuzzle(p); setAnswers({}); setChecked(false)
  }, [allWords])

  useEffect(() => { if (allWords.length) build() }, [allWords, build])

  const sourceSelector = (
    <select value={source} onChange={e => setSource(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, maxWidth: 200 }}>
      <option value="">{t.games.allWords}</option>
      <option value="learning">{t.games.inLearning}</option>
      {(lessons || []).filter(l => l.status === 'done').map(l => <option key={l.id} value={l.id}>{l.title || `Урок ${l.id}`}</option>)}
    </select>
  )

  if (loading || !puzzle) return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 40px' }}>
      <h1 style={{ fontSize: 22, margin: '4px 0 10px' }}>🧩 {ex(lang).crosswordTitle}</h1>
      <div style={{ marginBottom: 14 }}>{sourceSelector}</div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
        {loading ? t.games.loading : t.games.notEnoughWords}
      </p>
    </div>
  )

  const setCell = (key, val) => {
    const ch = (val || '').toUpperCase().replace(/ß/g, 'SS').replace(/[^A-ZÄÖÜ]/g, '').slice(-1)
    setAnswers(a => ({ ...a, [key]: ch }))
  }
  const cellState = (key, letter) => {
    if (!checked) return 'idle'
    const a = answers[key]
    if (!a) return 'empty'
    return a === letter ? 'ok' : 'bad'
  }

  const cellPx = Math.max(26, Math.min(40, Math.floor((typeof window !== 'undefined' ? window.innerWidth - 40 : 340) / puzzle.cols)))
  const across = puzzle.entries.filter(e => e.dir === 'H')
  const down = puzzle.entries.filter(e => e.dir === 'V')

  const reveal = () => {
    const next = {}
    for (const [key, cell] of puzzle.grid) next[key] = cell.letter
    setAnswers(next); setChecked(true)
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>🧩 {ex(lang).crosswordTitle}</h1>
        <button onClick={build} style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t.games.newPuzzle}</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {sourceSelector}
        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{ex(lang).crosswordSub}</span>
      </div>

      {/* Сетка */}
      <div style={{ overflowX: 'auto', marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${puzzle.cols}, ${cellPx}px)`, gap: 2, width: 'max-content', margin: '0 auto' }}>
          {Array.from({ length: puzzle.rows }).map((_, r) =>
            Array.from({ length: puzzle.cols }).map((_, c) => {
              const key = `${r},${c}`
              const cell = puzzle.grid.get(key)
              if (!cell) return <div key={key} style={{ width: cellPx, height: cellPx }} />
              const st = cellState(key, cell.letter)
              const bg = st === 'ok' ? 'rgba(78,154,110,.25)' : st === 'bad' ? 'rgba(214,83,60,.22)' : 'var(--surface)'
              return (
                <div key={key} style={{ position: 'relative', width: cellPx, height: cellPx }}>
                  {cell.num && <span style={{ position: 'absolute', top: 1, left: 2, fontSize: 9, color: 'var(--ink-soft)', lineHeight: 1, pointerEvents: 'none' }}>{cell.num}</span>}
                  <input value={answers[key] || ''} onChange={e => setCell(key, e.target.value)}
                    inputMode="text" maxLength={2}
                    style={{ width: '100%', height: '100%', textAlign: 'center', fontSize: cellPx * 0.5, fontWeight: 700, textTransform: 'uppercase',
                      border: '1px solid var(--line)', borderRadius: 4, background: bg, color: 'var(--ink)', padding: 0, boxSizing: 'border-box', fontFamily: 'Georgia,serif' }} />
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setChecked(true)} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{t.games.check}</button>
        <button onClick={reveal} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{t.games.reveal}</button>
      </div>

      {/* Подсказки */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[[t.games.across, across], [t.games.down, down]].map(([title, list]) => (
          <div key={title}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', marginBottom: 8 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {list.map(e => (
                <div key={`${e.dir}${e.num}`} onClick={() => checked && speak(e.word, 'de-DE')} style={{ fontSize: 13.5, color: 'var(--ink)', cursor: checked ? 'pointer' : 'default' }}>
                  <b>{e.num}.</b> {e.clue}
                  <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}> ({e.word.length})</span>
                  {checked && <span style={{ color: 'var(--good)', fontWeight: 700, marginLeft: 6, fontFamily: 'Georgia,serif' }}>{e.word}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
