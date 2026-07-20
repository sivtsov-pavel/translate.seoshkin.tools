import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api/client.js'
import { speak, targetLocale } from '../hooks/useSpeech.jsx'

// Разбивка абзаца на токены (слова/пробелы/пунктуация) — для кликабельных слов.
const tokenize = (s) => String(s || '').split(/(\s+|[.,!?;:«»"“”()\-—…]+)/).filter(Boolean)
const isWord = (t) => /[A-Za-zÀ-ÿА-Яа-яäöüßÄÖÜ]/.test(t) && !/^\s+$/.test(t)

// Полноэкранный ридер книги с тап-переводом и «закладкой» по абзацу.
// Место, где остановился, сохраняется автоматически (индекс верхнего видимого абзаца)
// и восстанавливается при следующем открытии.
export default function BookReader({ book, onClose }) {
  const [paras, setParas]     = useState(null)   // null = грузим
  const [title, setTitle]     = useState(book.title || 'Книга')
  const [resumeIdx, setResumeIdx] = useState(0)
  const [curIdx, setCurIdx]   = useState(0)
  const [popup, setPopup]     = useState(null)    // { word, loading, translation, example }
  const [err, setErr]         = useState('')

  const paraRefs = useRef([])          // DOM-узлы абзацев
  const visible  = useRef(new Set())   // индексы видимых сейчас абзацев
  const saveTimer = useRef(null)
  const lastSaved = useRef(0)
  const resumedRef = useRef(false)

  // Загрузка текста книги + сохранённой закладки
  useEffect(() => {
    let alive = true
    api.get(`/books/${book.id}/content`)
      .then(res => {
        if (!alive) return
        setParas(res.paragraphs || [])
        setTitle(res.title || book.title)
        setResumeIdx(res.para_index || 0)
        setCurIdx(res.para_index || 0)
        lastSaved.current = res.para_index || 0
      })
      .catch(e => alive && setErr(e.message || 'Не удалось открыть книгу'))
    return () => { alive = false }
  }, [book.id])

  // Сохранение закладки (дебаунс). Индекс верхнего видимого абзаца.
  const scheduleSave = useCallback((idx) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (idx === lastSaved.current) return
      lastSaved.current = idx
      api.put(`/books/${book.id}/position`, { para_index: idx }).catch(() => {})
    }, 1500)
  }, [book.id])

  // IntersectionObserver: следим, какие абзацы видны; «текущий» = самый верхний из видимых.
  useEffect(() => {
    if (!paras || !paras.length) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const idx = Number(e.target.dataset.idx)
        if (e.isIntersecting) visible.current.add(idx)
        else visible.current.delete(idx)
      }
      if (visible.current.size) {
        const top = Math.min(...visible.current)
        setCurIdx(top)
        scheduleSave(top)
      }
    }, { rootMargin: '-8% 0px -80% 0px' }) // «строка чтения» у верхней трети экрана
    paraRefs.current.forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [paras, scheduleSave])

  // Возврат на место: после рендера абзацев прокручиваем к сохранённому и мягко подсвечиваем.
  useEffect(() => {
    if (!paras || resumedRef.current) return
    resumedRef.current = true
    if (resumeIdx > 0) {
      requestAnimationFrame(() => {
        const el = paraRefs.current[resumeIdx]
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'auto' })
          el.style.transition = 'background 1.2s'
          el.style.background = 'var(--accent-soft)'
          setTimeout(() => { el.style.background = 'transparent' }, 1400)
        }
      })
    }
  }, [paras, resumeIdx])

  // Сохранить закладку при закрытии (немедленно, без дебаунса)
  const close = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (curIdx !== lastSaved.current) {
      api.put(`/books/${book.id}/position`, { para_index: curIdx }).catch(() => {})
    }
    onClose()
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // Тап по слову → перевод (словарь/GPT) + озвучка
  const onWord = async (raw) => {
    const word = raw.replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()
    if (!word) return
    speak(word, targetLocale())
    setPopup({ word, loading: true })
    try {
      const res = await api.get(`/words/lookup?q=${encodeURIComponent(word)}`)
      setPopup({ word: res?.word_de || word, loading: false, translation: res?.translation_ru || null, example: res?.example_sentence || null })
    } catch {
      setPopup({ word, loading: false, translation: null })
    }
  }

  const savePhrase = async () => {
    if (!popup) return
    try { await api.post('/phrasebook', { de: popup.word, ru: popup.translation || '', source: 'book' }); setPopup(p => ({ ...p, saved: true })) } catch {}
  }

  const pct = paras && paras.length > 1 ? Math.round(curIdx / (paras.length - 1) * 100) : 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Шапка + прогресс */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
          <button onClick={close} style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>← Закрыть</button>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{pct}%</div>
        </div>
        <div style={{ height: 3, background: 'var(--surface-2)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .2s' }} />
        </div>
      </div>

      {/* Текст книги */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 120px', maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {err && <div style={{ color: 'var(--red)', padding: 20 }}>{err}</div>}
        {paras === null && !err && <div style={{ color: 'var(--ink-soft)', padding: 20 }}>Открываю книгу…</div>}
        {paras && resumeIdx > 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16, textAlign: 'center' }}>↓ продолжаем с места, где ты остановился</div>
        )}
        {paras && paras.map((p, i) => (
          <p key={i} data-idx={i} ref={el => (paraRefs.current[i] = el)}
            style={{ margin: '0 0 18px', lineHeight: 1.9, fontSize: 18, color: 'var(--ink)' }}>
            {tokenize(p).map((tok, j) => isWord(tok) ? (
              <span key={j} onClick={() => onWord(tok)}
                style={{ cursor: 'pointer', borderRadius: 4, padding: '0 1px' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{tok}</span>
            ) : <span key={j}>{tok}</span>)}
          </p>
        ))}
        {paras && paras.length === 0 && !err && (
          <div style={{ color: 'var(--ink-soft)', padding: 20 }}>В книге не найден текст.</div>
        )}
      </div>

      {/* Попап перевода слова */}
      {popup && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: '0 -4px 16px rgba(0,0,0,.15)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => speak(popup.word, targetLocale())} title="Озвучить"
              style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 16 }}>🔊</button>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{popup.word}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                {popup.loading ? 'перевожу…' : (popup.translation || 'нет в словаре')}
              </div>
              {popup.example && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, fontStyle: 'italic' }}>{popup.example}</div>}
            </div>
            {!popup.loading && (
              <button onClick={savePhrase} disabled={popup.saved}
                style={{ border: '1px solid var(--line)', background: 'transparent', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: popup.saved ? 'var(--good)' : 'var(--accent)' }}>
                {popup.saved ? '✓ в разговорнике' : '＋ в разговорник'}
              </button>
            )}
            <button onClick={() => setPopup(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
