import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api/client.js'
import { speak, targetLocale } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'

// Язык книги (изучаемый) → TTS-локаль для озвучки
const TTS = { de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', en: 'en-US', pt: 'pt-PT' }

// Разбивка абзаца на токены (слова/пробелы/пунктуация) — для кликабельных слов.
const tokenize = (s) => String(s || '').split(/(\s+|[.,!?;:«»"“”()\-—…]+)/).filter(Boolean)
const isWord = (t) => /[A-Za-zÀ-ÿА-Яа-яäöüßÄÖÜ]/.test(t) && !/^\s+$/.test(t)

// Полноэкранный ридер книги с тап-переводом и «закладкой» по абзацу.
// Место, где остановился, сохраняется автоматически (индекс верхнего видимого абзаца)
// и восстанавливается при следующем открытии.
export default function BookReader({ book, onClose }) {
  const { lang } = useI18nStore()                 // локаль ученика — язык перевода
  const [paras, setParas]     = useState(null)   // null = грузим
  const [title, setTitle]     = useState(book.title || 'Книга')
  const [bookLang, setBookLang] = useState('de')  // язык книги (изучаемый)
  const [resumeIdx, setResumeIdx] = useState(0)
  const [curIdx, setCurIdx]   = useState(0)
  const [popup, setPopup]     = useState(null)    // { text, loading, translation, example, inDict, isSel }
  const [selText, setSelText] = useState('')      // выделенный фрагмент (несколько слов/предложение)
  const [err, setErr]         = useState('')
  const [aloudMode, setAloudMode] = useState(false) // режим «читать вслух»: клик по тексту запускает озвучку
  const [speakIdx, setSpeakIdx]   = useState(-1)    // абзац, который сейчас читается вслух (-1 = нет)
  const aloudCancel = useRef(false)

  const paraRefs = useRef([])          // DOM-узлы абзацев
  const containerRef = useRef(null)    // контейнер текста (для проверки, что выделение внутри книги)
  const visible  = useRef(new Set())   // индексы видимых сейчас абзацев
  const saveTimer = useRef(null)
  const lastSaved = useRef(0)
  const resumedRef = useRef(false)
  const ttsLang = TTS[bookLang] || targetLocale()

  // Загрузка текста книги + сохранённой закладки
  useEffect(() => {
    let alive = true
    api.get(`/books/${book.id}/content`)
      .then(res => {
        if (!alive) return
        setParas(res.paragraphs || [])
        setTitle(res.title || book.title)
        setBookLang(res.target_lang || 'de')
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
    aloudCancel.current = true; window.speechSynthesis?.cancel()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (curIdx !== lastSaved.current) {
      api.put(`/books/${book.id}/position`, { para_index: curIdx }).catch(() => {})
    }
    onClose()
  }
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    aloudCancel.current = true; window.speechSynthesis?.cancel() // не оставляем озвучку после ухода со страницы
  }, [])

  // Выделение текста (несколько слов / предложение) внутри книги → показываем кнопку «перевести».
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()
      const txt = (s?.toString() || '').trim()
      const inside = s?.anchorNode && containerRef.current?.contains(s.anchorNode)
      // Реагируем только на осмысленное выделение (2+ слова или длинный фрагмент) внутри текста книги
      if (txt && inside && (/\s/.test(txt) || txt.length > 14)) setSelText(txt)
      else if (!txt) setSelText('')
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  // Тап по слову → перевод (словарь ИЛИ GPT-фолбэк) + озвучка. inDict = есть ли слово в словаре.
  const onWord = async (raw) => {
    const word = raw.replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()
    if (!word) return
    if ((window.getSelection()?.toString().trim().length || 0) > 1) return // идёт выделение фразы — не перехватываем
    speak(word, ttsLang)
    setPopup({ text: word, loading: true })
    try {
      const res = await api.get(`/words/tap?q=${encodeURIComponent(word)}&lang=${lang}`)
      setPopup({ text: res?.word || word, loading: false, translation: res?.translation || null, example: res?.example || null, inDict: !!res?.inDict })
    } catch {
      setPopup({ text: word, loading: false, translation: null })
    }
  }

  // Перевод выделенного фрагмента (несколько слов / предложение) через GPT.
  const translateSelection = async () => {
    const text = selText.trim()
    if (!text) return
    setPopup({ text, loading: true, isSel: true })
    try {
      const res = await api.post('/reader/speak-translate', { text, sourceLang: bookLang, targetLang: lang, model: 'fast' })
      setPopup({ text, loading: false, translation: res?.translation || null, isSel: true })
    } catch {
      setPopup({ text, loading: false, translation: null, isSel: true })
    }
    setSelText(''); window.getSelection()?.removeAllRanges()
  }

  // ── Чтение вслух: система читает книгу с выбранного абзаца, дальше сама, с подсветкой ──
  const startAloud = (fromIdx) => {
    if (!paras || !paras.length) return
    const synth = window.speechSynthesis
    if (!synth) return
    aloudCancel.current = false
    setPopup(null)
    const voices = synth.getVoices()
    const voice = voices.find(v => v.lang.startsWith(bookLang)) || voices.find(v => v.lang.startsWith('de'))
    const rate = parseFloat(localStorage.getItem('voice_rate') || '0.9')
    const playNext = (i) => {
      if (aloudCancel.current || i >= paras.length) { setSpeakIdx(-1); return }
      setSpeakIdx(i)
      const el = paraRefs.current[i]
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      synth.cancel()
      const utt = new SpeechSynthesisUtterance(paras[i])
      utt.lang = ttsLang; utt.rate = rate
      if (voice) utt.voice = voice
      utt.onend = () => { if (!aloudCancel.current) playNext(i + 1) }
      utt.onerror = () => { if (!aloudCancel.current) playNext(i + 1) }
      synth.speak(utt)
    }
    playNext(fromIdx)
  }
  const stopAloud = () => { aloudCancel.current = true; window.speechSynthesis?.cancel(); setSpeakIdx(-1) }

  // Сохранить в разговорник — работает и для слова, и для выделенного предложения
  const savePhrase = async () => {
    if (!popup) return
    try { await api.post('/phrasebook', { de: popup.text, ru: popup.translation || '', source: 'book' }); setPopup(p => ({ ...p, saved: true })) } catch {}
  }

  const pct = paras && paras.length > 1 ? Math.round(curIdx / (paras.length - 1) * 100) : 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Шапка + прогресс */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
          <button onClick={close} style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, color: 'var(--ink)' }}>← Закрыть</button>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {speakIdx >= 0 ? (
            <button onClick={stopAloud} title="Остановить чтение"
              style={{ border: 'none', background: 'var(--red)', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>⏹ Стоп</button>
          ) : (
            <button onClick={() => setAloudMode(v => !v)} title="Читать вслух: включи и нажми на текст с нужного места"
              style={{ border: `1px solid ${aloudMode ? 'var(--accent)' : 'var(--line)'}`, background: aloudMode ? 'var(--accent-soft)' : 'var(--surface-2)', color: aloudMode ? 'var(--accent)' : 'var(--ink)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>🔊 Вслух</button>
          )}
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{pct}%</div>
        </div>
        <div style={{ height: 3, background: 'var(--surface-2)' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .2s' }} />
        </div>
      </div>

      {/* Текст книги */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 120px', maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {err && <div style={{ color: 'var(--red)', padding: 20 }}>{err}</div>}
        {paras === null && !err && <div style={{ color: 'var(--ink-soft)', padding: 20 }}>Открываю книгу…</div>}
        {paras && resumeIdx > 0 && speakIdx < 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16, textAlign: 'center' }}>↓ продолжаем с места, где ты остановился</div>
        )}
        {aloudMode && speakIdx < 0 && (
          <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 16, textAlign: 'center', fontWeight: 600 }}>🔊 Нажми на текст — начну читать вслух с этого места</div>
        )}
        {paras && paras.map((p, i) => (
          <p key={i} data-idx={i} ref={el => (paraRefs.current[i] = el)}
            onClick={() => { if (aloudMode) startAloud(i) }}
            style={{
              margin: '0 0 18px', lineHeight: 1.9, fontSize: 18, color: 'var(--ink)',
              cursor: aloudMode ? 'pointer' : 'auto',
              background: speakIdx === i ? 'var(--accent-soft)' : 'transparent',
              borderRadius: 6, padding: speakIdx === i ? '4px 6px' : 0, transition: 'background .2s',
            }}>
            {tokenize(p).map((tok, j) => isWord(tok) ? (
              <span key={j} onClick={(e) => { if (aloudMode) return; e.stopPropagation(); onWord(tok) }}
                style={{ cursor: aloudMode ? 'pointer' : 'pointer', borderRadius: 4, padding: '0 1px' }}
                onMouseEnter={e => { if (!aloudMode) e.currentTarget.style.background = 'var(--accent-soft)' }}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{tok}</span>
            ) : <span key={j}>{tok}</span>)}
          </p>
        ))}
        {paras && paras.length === 0 && !err && (
          <div style={{ color: 'var(--ink-soft)', padding: 20 }}>В книге не найден текст.</div>
        )}
      </div>

      {/* Кнопка перевода выделенного фрагмента (несколько слов / предложение) */}
      {selText && !popup && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: '0 -4px 16px rgba(0,0,0,.15)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>«{selText}»</div>
            <button onClick={translateSelection}
              style={{ border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
              🌐 Перевести
            </button>
          </div>
        </div>
      )}

      {/* Попап перевода (слово или выделенный фрагмент) */}
      {popup && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: '0 -4px 16px rgba(0,0,0,.15)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => speak(popup.text, ttsLang)} title="Озвучить"
              style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 16 }}>🔊</button>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 700, fontSize: popup.isSel ? 15 : 17, lineHeight: 1.4 }}>{popup.text}</div>
              <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                {popup.loading ? 'перевожу…' : (popup.translation || 'не удалось перевести')}
              </div>
              {!popup.loading && !popup.isSel && popup.inDict === false && popup.translation && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>перевод ИИ — нет в словаре, можно добавить →</div>
              )}
              {popup.example && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4, fontStyle: 'italic' }}>{popup.example}</div>}
            </div>
            {!popup.loading && popup.translation && (
              <button onClick={savePhrase} disabled={popup.saved}
                style={{ border: '1px solid var(--line)', background: 'transparent', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: popup.saved ? 'var(--good)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
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
