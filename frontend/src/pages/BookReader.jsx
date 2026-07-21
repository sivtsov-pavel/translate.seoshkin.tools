import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api/client.js'
import { speak, targetLocale, SpeakButton } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'

// Язык книги (изучаемый) → TTS-локаль для озвучки
const TTS = { de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', en: 'en-US', pt: 'pt-PT' }

// Разбивка абзаца на токены (слова/пробелы/пунктуация) — для кликабельных слов.
const tokenize = (s) => String(s || '').split(/(\s+|[.,!?;:«»"“”()\-—…]+)/).filter(Boolean)
const isWord = (t) => /[A-Za-zÀ-ÿА-Яа-яäöüßÄÖÜ]/.test(t) && !/^\s+$/.test(t)
const wordKey = (w) => w.toLowerCase().replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()

// Полноэкранный ридер книги: тап по слову → в панель «Слова» (перевод + метка + «＋ в словарь»),
// выделение фразы → перевод + «＋ в разговорник», чтение вслух, закладка по абзацу.
export default function BookReader({ book, onClose }) {
  const { lang } = useI18nStore()                 // локаль ученика — язык перевода
  const [paras, setParas]     = useState(null)   // null = грузим
  const [title, setTitle]     = useState(book.title || 'Книга')
  const [bookLang, setBookLang] = useState('de')  // язык книги (изучаемый)
  const [resumeIdx, setResumeIdx] = useState(0)
  const [curIdx, setCurIdx]   = useState(0)
  const [picked, setPicked]   = useState(new Map()) // выбранные слова: key → {key, word, translation, example, imageUrl, inDict, loading, inMyDict}
  const [showWords, setShowWords] = useState(true)  // свёрнута/развёрнута панель слов
  const [selText, setSelText] = useState('')      // выделенный фрагмент (несколько слов/предложение)
  const [sent, setSent]       = useState(null)    // перевод выделенного: { text, loading, translation, saved }
  const [err, setErr]         = useState('')
  const [aloudMode, setAloudMode] = useState(false)
  const [speakIdx, setSpeakIdx]   = useState(-1)
  const aloudCancel = useRef(false)

  const pickedRef = useRef(new Map())
  const paraRefs = useRef([])
  const containerRef = useRef(null)
  const visible  = useRef(new Set())
  const saveTimer = useRef(null)
  const lastSaved = useRef(0)
  const resumedRef = useRef(false)
  const ttsLang = TTS[bookLang] || targetLocale()

  const updatePicked = (m) => { pickedRef.current = m; setPicked(new Map(m)) }

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

  // Сохранение закладки (дебаунс)
  const scheduleSave = useCallback((idx) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (idx === lastSaved.current) return
      lastSaved.current = idx
      api.put(`/books/${book.id}/position`, { para_index: idx }).catch(() => {})
    }, 1500)
  }, [book.id])

  // IntersectionObserver: «текущий» абзац = самый верхний из видимых
  useEffect(() => {
    if (!paras || !paras.length) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const idx = Number(e.target.dataset.idx)
        if (e.isIntersecting) visible.current.add(idx)
        else visible.current.delete(idx)
      }
      if (visible.current.size) { const top = Math.min(...visible.current); setCurIdx(top); scheduleSave(top) }
    }, { rootMargin: '-8% 0px -80% 0px' })
    paraRefs.current.forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [paras, scheduleSave])

  // Возврат на место
  useEffect(() => {
    if (!paras || resumedRef.current) return
    resumedRef.current = true
    if (resumeIdx > 0) {
      requestAnimationFrame(() => {
        const el = paraRefs.current[resumeIdx]
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'auto' })
          el.style.transition = 'background 1.2s'; el.style.background = 'var(--accent-soft)'
          setTimeout(() => { el.style.background = 'transparent' }, 1400)
        }
      })
    }
  }, [paras, resumeIdx])

  const close = () => {
    aloudCancel.current = true; window.speechSynthesis?.cancel()
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (curIdx !== lastSaved.current) api.put(`/books/${book.id}/position`, { para_index: curIdx }).catch(() => {})
    onClose()
  }
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    aloudCancel.current = true; window.speechSynthesis?.cancel()
  }, [])

  // Выделение фразы/предложения → показываем кнопку «перевести»
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection()
      const txt = (s?.toString() || '').trim()
      const inside = s?.anchorNode && containerRef.current?.contains(s.anchorNode)
      if (txt && inside && txt.length >= 2) { setSelText(txt); setSent(null) }
      else if (!txt) setSelText('')
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  // Тап по слову → добавляем в панель «Слова» (перевод словарь/GPT + метка inDict)
  const onWord = async (raw) => {
    if ((window.getSelection()?.toString().trim().length || 0) >= 2) return // идёт выделение — не перехватываем
    const word = raw.replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()
    if (!word) return
    const key = wordKey(word)
    speak(word, ttsLang)
    setShowWords(true)
    const m = new Map(pickedRef.current)
    if (m.has(key)) { updatePicked(m); return }        // уже в списке — только озвучили
    m.set(key, { key, word, loading: true })
    updatePicked(m)
    try {
      const res = await api.get(`/words/tap?q=${encodeURIComponent(word)}&lang=${lang}`)
      const m2 = new Map(pickedRef.current)
      if (m2.has(key)) {
        m2.set(key, { key, word: res?.word || word, loading: false, translation: res?.translation || null, example: res?.example || null, imageUrl: res?.image_url || null, inDict: !!res?.inDict })
        updatePicked(m2)
      }
    } catch {
      const m2 = new Map(pickedRef.current)
      if (m2.has(key)) { m2.set(key, { ...m2.get(key), loading: false }); updatePicked(m2) }
    }
  }

  const removeWord = (key) => { const m = new Map(pickedRef.current); m.delete(key); updatePicked(m) }
  const clearWords = () => updatePicked(new Map())

  // ＋ добавить слово в личный СЛОВАРЬ (доступно даже если слово уже в словаре)
  const addToDict = async (entry) => {
    try {
      await api.post('/personal-words', { word: entry.word, translation: entry.translation || '' })
      const m = new Map(pickedRef.current)
      if (m.has(entry.key)) { m.set(entry.key, { ...m.get(entry.key), inMyDict: true }); updatePicked(m) }
    } catch {}
  }
  const addAllToDict = async () => {
    for (const e of pickedRef.current.values()) if (!e.loading && !e.inMyDict) await addToDict(e)
  }

  // Перевод выделенного фрагмента → в разговорник
  const translateSelection = async () => {
    const text = selText.trim()
    if (!text) return
    setSent({ text, loading: true })
    setSelText(''); window.getSelection()?.removeAllRanges()
    try {
      const res = await api.post('/reader/speak-translate', { text, sourceLang: bookLang, targetLang: lang, model: 'fast' })
      setSent({ text, loading: false, translation: res?.translation || null })
    } catch { setSent({ text, loading: false, translation: null }) }
  }
  const saveSentence = async () => {
    if (!sent) return
    try { await api.post('/phrasebook', { de: sent.text, ru: sent.translation || '', source: 'book' }); setSent(s => ({ ...s, saved: true })) } catch {}
  }

  // Чтение вслух с выбранного абзаца
  const startAloud = (fromIdx) => {
    if (!paras || !paras.length) return
    const synth = window.speechSynthesis; if (!synth) return
    aloudCancel.current = false
    const voices = synth.getVoices()
    const voice = voices.find(v => v.lang.startsWith(bookLang)) || voices.find(v => v.lang.startsWith('de'))
    const rate = parseFloat(localStorage.getItem('voice_rate') || '0.9')
    const playNext = (i) => {
      if (aloudCancel.current || i >= paras.length) { setSpeakIdx(-1); return }
      setSpeakIdx(i)
      const el = paraRefs.current[i]; if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      synth.cancel()
      const utt = new SpeechSynthesisUtterance(paras[i])
      utt.lang = ttsLang; utt.rate = rate; if (voice) utt.voice = voice
      utt.onend = () => { if (!aloudCancel.current) playNext(i + 1) }
      utt.onerror = () => { if (!aloudCancel.current) playNext(i + 1) }
      synth.speak(utt)
    }
    playNext(fromIdx)
  }
  const stopAloud = () => { aloudCancel.current = true; window.speechSynthesis?.cancel(); setSpeakIdx(-1) }

  const pct = paras && paras.length > 1 ? Math.round(curIdx / (paras.length - 1) * 100) : 0
  const pickedArr = [...picked.values()]

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
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 160px', maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {err && <div style={{ color: 'var(--red)', padding: 20 }}>{err}</div>}
        {paras === null && !err && <div style={{ color: 'var(--ink-soft)', padding: 20 }}>Открываю книгу…</div>}
        {paras && !aloudMode && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 16, textAlign: 'center' }}>
            👆 Тапни слово → в словарь · выдели фразу → перевод в разговорник{resumeIdx > 0 && speakIdx < 0 ? ' · ↓ продолжаем с места' : ''}
          </div>
        )}
        {aloudMode && speakIdx < 0 && (
          <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 16, textAlign: 'center', fontWeight: 600 }}>🔊 Нажми на текст — начну читать вслух с этого места</div>
        )}
        {paras && paras.map((p, i) => (
          <p key={i} data-idx={i} ref={el => (paraRefs.current[i] = el)}
            onClick={() => { if (aloudMode) startAloud(i) }}
            style={{
              margin: '0 0 18px', lineHeight: 1.9, fontSize: 18, color: 'var(--ink)',
              cursor: aloudMode ? 'pointer' : 'auto', WebkitUserSelect: 'text', userSelect: 'text',
              background: speakIdx === i ? 'var(--accent-soft)' : 'transparent',
              borderRadius: 6, padding: speakIdx === i ? '4px 6px' : 0, transition: 'background .2s',
            }}>
            {tokenize(p).map((tok, j) => isWord(tok) ? (
              <span key={j} onClick={(e) => { if (aloudMode) return; e.stopPropagation(); onWord(tok) }}
                style={{ cursor: 'pointer', borderRadius: 4, padding: '0 1px', background: picked.has(wordKey(tok)) ? 'var(--accent-soft)' : 'transparent' }}
                onMouseEnter={e => { if (!aloudMode && !picked.has(wordKey(tok))) e.currentTarget.style.background = 'var(--accent-soft)' }}
                onMouseLeave={e => { if (!picked.has(wordKey(tok))) e.currentTarget.style.background = 'transparent' }}>{tok}</span>
            ) : <span key={j}>{tok}</span>)}
          </p>
        ))}
        {paras && paras.length === 0 && !err && <div style={{ color: 'var(--ink-soft)', padding: 20 }}>В книге не найден текст.</div>}
      </div>

      {/* Кнопка перевода выделенного фрагмента → в разговорник */}
      {selText && !sent && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, padding: 14, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: '0 -4px 16px rgba(0,0,0,.15)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>«{selText}»</div>
            <button onClick={translateSelection}
              style={{ border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>🌐 Перевести</button>
          </div>
        </div>
      )}

      {/* Перевод выделенного предложения → в разговорник */}
      {sent && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40, padding: 16, background: 'var(--surface)', borderTop: '2px solid var(--accent)', boxShadow: '0 -4px 16px rgba(0,0,0,.2)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => speak(sent.text, ttsLang)} title="Озвучить" style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 16 }}>🔊</button>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4 }}>{sent.text}</div>
              <div style={{ fontSize: 14, color: 'var(--ink)' }}>{sent.loading ? 'перевожу…' : (sent.translation || 'не удалось перевести')}</div>
            </div>
            {!sent.loading && sent.translation && (
              <button onClick={saveSentence} disabled={sent.saved}
                style={{ border: '1px solid var(--line)', background: 'transparent', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: sent.saved ? 'var(--good)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
                {sent.saved ? '✓ в разговорнике' : '＋ в разговорник'}
              </button>
            )}
            <button onClick={() => setSent(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)' }}>✕</button>
          </div>
        </div>
      )}

      {/* Панель выбранных слов → в словарь */}
      {pickedArr.length > 0 && !sent && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: '0 -8px 30px rgba(0,0,0,.25)', maxHeight: '58vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 8px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>📚 Слова: {pickedArr.length}</span>
            <button onClick={addAllToDict} style={{ border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>＋ Все в словарь</button>
            <button onClick={() => setShowWords(v => !v)} style={{ border: 'none', background: 'var(--surface-2)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-soft)' }}>{showWords ? '▾' : '▴'}</button>
            <button onClick={clearWords} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-soft)' }}>Очистить ✕</button>
          </div>
          {showWords && (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {pickedArr.map(e => (
                <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                  {e.imageUrl && <img src={e.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 15 }}>{e.word}</b>
                      <SpeakButton text={e.word} size={14} />
                      {!e.loading && (e.inDict
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--good)', background: 'rgba(78,154,110,0.18)', borderRadius: 6, padding: '2px 6px' }}>✓ в словаре</span>
                        : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6, padding: '2px 6px' }}>🆕 новое</span>)}
                    </div>
                    <div style={{ fontSize: 13.5, color: e.translation ? 'var(--accent)' : 'var(--ink-soft)', fontWeight: e.translation ? 600 : 400, fontStyle: e.translation ? 'normal' : 'italic' }}>
                      {e.loading ? '…' : (e.translation || 'нет перевода')}
                    </div>
                  </div>
                  {/* ＋ в словарь — доступно всегда (даже если слово уже в словаре) */}
                  <button onClick={() => addToDict(e)} disabled={e.loading || e.inMyDict} title="Добавить в мой словарь"
                    style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, cursor: e.inMyDict ? 'default' : 'pointer',
                      border: `1px solid ${e.inMyDict ? 'var(--good)' : 'var(--accent)'}`,
                      background: e.inMyDict ? 'rgba(78,154,110,0.15)' : 'var(--accent-soft)',
                      color: e.inMyDict ? 'var(--good)' : 'var(--accent)', fontSize: 16, fontWeight: 700 }}>
                    {e.inMyDict ? '✓' : '+'}
                  </button>
                  <button onClick={() => removeWord(e.key)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)', flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
