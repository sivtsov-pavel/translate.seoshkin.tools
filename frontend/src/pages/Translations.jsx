import { useEffect, useState, useMemo, useRef } from 'react'
import { api } from '../api/client.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

const LANGS = [
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'de', label: 'DE', flag: '🇩🇪' },
  { code: 'uk', label: 'UK', flag: '🇺🇦' },
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'ar', label: 'AR', flag: '🇸🇦' },
  { code: 'bg', label: 'BG', flag: '🇧🇬' },
  { code: 'tr', label: 'TR', flag: '🇹🇷' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'sq', label: 'SQ', flag: '🇦🇱' },
]

export default function Translations() {
  const [words, setWords]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [visibleLangs, setVisibleLangs] = useState(['ru', 'en'])
  const [lessonFilter, setLessonFilter] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    api.get('/words').then(data => { setWords(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Фокус на поиск при загрузке
  useEffect(() => { searchRef.current?.focus() }, [loading])

  const lessons = useMemo(() => [...new Set(words.map(w => w.lesson_title).filter(Boolean))], [words])

  // Мгновенный поиск — ищет по DE, RU и по всем переводам
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return words.filter(w => {
      if (lessonFilter && w.lesson_title !== lessonFilter) return false
      if (!q) return true
      if (w.word_de?.toLowerCase().includes(q)) return true
      if (w.translation_ru?.toLowerCase().includes(q)) return true
      // Поиск по всем языковым переводам
      if (w.translations && typeof w.translations === 'object') {
        return Object.values(w.translations).some(v => v?.toLowerCase().includes(q))
      }
      return false
    })
  }, [words, search, lessonFilter])

  const toggleLang = (code) => {
    setVisibleLangs(prev =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter(l => l !== code) : prev) : [...prev, code]
    )
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>Загрузка переводов…</div>

  return (
    <div style={{ padding: '24px 14px 80px' }}>

      {/* Заголовок */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px' }}>🌍 Переводы</h1>
        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{words.length} слов · показано {filtered.length}</span>
      </div>

      {/* Поиск */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: 14, pointerEvents: 'none' }} />
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по немецкому, русскому или любому переводу…"
          style={{ width: '100%', paddingLeft: 36, fontSize: 15, padding: '10px 12px 10px 36px', borderRadius: 10 }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Урок */}
        <select value={lessonFilter} onChange={e => setLessonFilter(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', maxWidth: 220 }}>
          <option value="">Все уроки</option>
          {lessons.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {/* Языки */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => toggleLang(l.code)}
              title={l.code.toUpperCase()}
              style={{
                padding: '4px 10px', borderRadius: 20, border: '1px solid var(--line)',
                background: visibleLangs.includes(l.code) ? 'var(--accent)' : 'var(--surface-2)',
                color: visibleLangs.includes(l.code) ? 'var(--accent-ink)' : 'var(--ink-soft)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Результаты */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)', fontSize: 14 }}>
          {search ? `Ничего не найдено по «${search}»` : 'Нет слов'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(word => (
            <WordRow key={word.id} word={word} visibleLangs={visibleLangs} highlight={search.trim().toLowerCase()} />
          ))}
        </div>
      )}
    </div>
  )
}

function highlight(text, q) {
  if (!q || !text) return text
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 3, padding: '0 2px' }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function WordRow({ word, visibleLangs, highlight: q }) {
  const tr = word.translations || {}

  const getLang = (code) => {
    if (code === 'ru') return word.translation_ru || tr.ru || ''
    return tr[code] || ''
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `200px repeat(${visibleLangs.length}, 1fr)`,
      gap: 0,
      borderRadius: 10, border: '1px solid var(--line)',
      background: 'var(--surface)', overflow: 'hidden',
      fontSize: 13,
    }}>
      {/* Немецкое слово */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderRight: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {highlight(word.word_de, q)}
        </span>
        <SpeakButton text={word.word_de} size={13} />
      </div>

      {/* Переводы */}
      {visibleLangs.map((code, i) => {
        const val = getLang(code)
        const isRtl = code === 'ar'
        return (
          <div key={code} style={{
            padding: '10px 12px',
            borderRight: i < visibleLangs.length - 1 ? '1px solid var(--line)' : 'none',
            color: val ? 'var(--ink)' : 'var(--ink-soft)',
            dir: isRtl ? 'rtl' : undefined,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0,
          }}>
            {val ? highlight(val, q) : <span style={{ opacity: 0.35 }}>—</span>}
          </div>
        )
      })}
    </div>
  )
}
