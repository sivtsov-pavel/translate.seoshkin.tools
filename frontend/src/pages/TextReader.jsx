import { useState, useRef, useEffect, useCallback } from 'react'
import { speak, cancel, SpeakButton } from '../hooks/useSpeech.jsx'
import { api } from '../api/client.js'
import CameraWords from '../components/CameraWords.jsx'

// ───────── helpers ─────────

function splitParagraphs(text) {
  return text.split(/\n{2,}|\n/).map(p => p.trim()).filter(Boolean)
}

function splitSentences(text) {
  return text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map(s => s.trim()).filter(Boolean) ?? []
}

function tokenize(sentence) {
  return sentence.match(/[\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]/g) || []
}

function isWord(token) {
  return /[\wäöüÄÖÜß]/.test(token)
}

// Языки для переводчика и разговора
const CONV_LANGS = [
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪', speech: 'de-DE' },
  { code: 'ru', label: 'Русский',    flag: '🇷🇺', speech: 'ru-RU' },
  { code: 'en', label: 'English',    flag: '🇬🇧', speech: 'en-US' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦', speech: 'uk-UA' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷', speech: 'fr-FR' },
  { code: 'es', label: 'Español',    flag: '🇪🇸', speech: 'es-ES' },
  { code: 'tr', label: 'Türkçe',     flag: '🇹🇷', speech: 'tr-TR' },
  { code: 'ar', label: 'العربية',    flag: '🇸🇦', speech: 'ar-SA' },
]

function getLang(code) { return CONV_LANGS.find(l => l.code === code) || CONV_LANGS[0] }

function LangSelect({ value, onChange, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 8, padding: '5px 10px', fontSize: 14, cursor: 'pointer', ...style }}>
      {CONV_LANGS.map(l => (
        <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
      ))}
    </select>
  )
}

// ───────── плавающая панель «Копировать» (только текст на изучаемом языке) ─────────

function CopySelectionBar({ count, onCopy, onCancel, copied, bottomOffset }) {
  if (!count) return null
  const label = count === 1 ? 'предложение' : count < 5 ? 'предложения' : 'предложений'
  return (
    <div style={{
      position: 'fixed', bottom: bottomOffset, left: '50%', transform: 'translateX(-50%)',
      zIndex: 400, display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999,
      padding: '8px 10px 8px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.25)',
      transition: 'bottom .15s',
    }}>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{count} {label}</span>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13, padding: '6px 8px' }}>
        Отмена
      </button>
      <button onClick={onCopy} style={{
        padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
        background: copied ? 'var(--good, #16a34a)' : 'var(--accent)', color: 'var(--accent-ink)',
      }}>
        {copied ? '✓ Скопировано' : '📋 Копировать'}
      </button>
    </div>
  )
}

// ───────── панель выбранных слов ─────────

function WordPanel({ words, onRemove, onClear }) {
  const [saved, setSaved] = useState(() => new Set())
  if (!words.size) return null
  const entries = [...words.values()]
  const count = words.size
  const label = count === 1 ? 'слово' : count < 5 ? 'слова' : 'слов'

  // Добавить слово в разговорник (плюсик у каждого слова)
  const addWord = async (entry) => {
    try {
      await api.post('/phrasebook', { de: entry.word, ru: entry.translation || '', source: 'reader' })
      setSaved(prev => new Set(prev).add(entry.key))
    } catch {}
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 640, zIndex: 300,
      background: 'var(--surface)', borderTop: '1px solid var(--line)',
      borderRadius: '20px 20px 0 0',
      maxHeight: '55vh',
      boxShadow: '0 -12px 40px rgba(0,0,0,.35)',
      animation: 'slideUp .2s ease',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{count} {label}</span>
        <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 8 }}>
          Очистить ✕
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {entries.map(entry => (
          <div key={entry.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
            {entry.imageUrl && (
              <img src={entry.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{entry.word}</span>
                <SpeakButton text={entry.word} size={15} />
              </div>
              {entry.loading ? (
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>…</span>
              ) : entry.translation ? (
                <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>{entry.translation}</span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>не найдено в словаре</span>
              )}
              {!entry.loading && entry.example && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4 }}>
                  <span style={{ fontStyle: 'italic' }}>{entry.example}</span>
                  {entry.exampleRu && <><br />{entry.exampleRu}</>}
                </div>
              )}
            </div>
            {/* Плюсик — добавить слово в разговорник */}
            {!entry.loading && (
              <button onClick={() => addWord(entry)} disabled={saved.has(entry.key)}
                title="Добавить в разговорник" style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: saved.has(entry.key) ? 'default' : 'pointer',
                  border: `1px solid ${saved.has(entry.key) ? 'var(--good, #16a34a)' : 'var(--accent)'}`,
                  background: saved.has(entry.key) ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--accent-soft)',
                  color: saved.has(entry.key) ? 'var(--good, #16a34a)' : 'var(--accent)', fontSize: 16, fontWeight: 700,
                }}>{saved.has(entry.key) ? '✓' : '+'}</button>
            )}
            <button onClick={() => onRemove(entry.key)} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 20, flexShrink: 0, padding: '0 4px' }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ height: 24, flexShrink: 0 }} />
    </div>
  )
}

// ───────── кликабельный абзац ─────────

function ClickableParagraph({ text, selectedWords, onWordClick }) {
  const tokens = tokenize(text)
  return (
    <p style={{ margin: 0, lineHeight: 2, fontSize: 17 }}>
      {tokens.map((token, j) => {
        const key = token.toLowerCase()
        const sel = isWord(token) && selectedWords?.has(key)
        return isWord(token) ? (
          <span key={j}
            onClick={() => onWordClick(token)}
            style={{
              fontWeight: sel ? 700 : 'inherit',
              color: sel ? 'var(--accent)' : 'inherit',
              cursor: 'pointer',
              borderRadius: 4,
              padding: '1px 2px',
              background: sel ? 'var(--accent-soft)' : 'transparent',
              outline: sel ? '1px solid var(--accent)' : 'none',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--accent-soft)' }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
          >{token}</span>
        ) : (
          <span key={j}>{token}</span>
        )
      })}
    </p>
  )
}

// ───────── основной компонент ─────────

export default function TextReader() {
  const [mode, setMode]     = useState('read')   // 'read' | 'bilingual' | 'conversation'
  const [text, setText]     = useState('')

  // Режим чтения (TTS)
  const [sentences, setSentences]   = useState([])
  const [active, setActive]         = useState(-1)
  const [playing, setPlaying]       = useState(false)
  const [rate, setRate]             = useState(0.85)

  // Двуязычный режим
  const [bilingual, setBilingual]   = useState([]) // [{original, translation}]
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [biSrc, setBiSrc] = useState('de')
  const [biTgt, setBiTgt] = useState('ru')

  // Режим разговора
  const [convSrcLang, setConvSrcLang] = useState('ru')   // левый — инициатор
  const [convTgtLang, setConvTgtLang] = useState('de')   // правый — собеседник
  const [convMessages, setConvMessages] = useState([])   // [{id, side, original, translation}]
  const [convListening, setConvListening] = useState(null) // 'src' | 'tgt' | null
  const [convTranslating, setConvTranslating] = useState(false)
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const hasSpeechApi = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Модель перевода
  const [transModel, setTransModel] = useState('mini')  // 'mini' | 'smart'

  // Выбранные слова
  const [selectedWords, setSelectedWords] = useState(new Map())
  const selectedRef = useRef(new Map())

  // Выбор предложений для копирования (только текст на изучаемом языке —
  // sentences[i] в «Читать», pair.original в «Двуязычном»; перевод НИКОГДА не копируем)
  const [readCopySelected, setReadCopySelected] = useState(new Set())
  const [bilingualCopySelected, setBilingualCopySelected] = useState(new Set())
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Сохранённые наборы
  const [sets, setSets]             = useState([])
  const [saveTitle, setSaveTitle]   = useState('')
  const [showSave, setShowSave]     = useState(false)
  const [saving, setSaving]         = useState(false)

  // Загрузить из урока
  const [lessons, setLessons]       = useState([])
  const [showLessons, setShowLessons] = useState(false)
  const [loadingLesson, setLoadingLesson] = useState(false)

  const cancelRef = useRef(false)

  useEffect(() => {
    api.get('/phrase-sets').then(setSets).catch(() => {})
    api.get('/reader/lessons').then(setLessons).catch(() => {})
    return () => { cancel(); cancelRef.current = true }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [convMessages])

  // закрыть дропдаун при клике вне
  useEffect(() => {
    if (!showLessons) return
    const handler = (e) => {
      if (!e.target.closest('[data-lesson-dropdown]')) setShowLessons(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLessons])

  // ─── слова ───

  const updateSelected = (map) => { selectedRef.current = map; setSelectedWords(new Map(map)) }
  const clearSelection = useCallback(() => updateSelected(new Map()), [])
  const removeWord = useCallback((key) => {
    const next = new Map(selectedRef.current); next.delete(key); updateSelected(next)
  }, [])

  const handleWordClick = useCallback(async (raw) => {
    const word = raw.replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()
    if (!word) return
    const key = word.toLowerCase()
    if (selectedRef.current.has(key)) {
      const next = new Map(selectedRef.current); next.delete(key); updateSelected(next); return
    }
    speak(word)
    const next = new Map(selectedRef.current)
    next.set(key, { key, word, loading: true, translation: null, example: null, exampleRu: null, imageUrl: null })
    updateSelected(next)
    try {
      const res = await api.get(`/words/lookup?q=${encodeURIComponent(word)}`)
      if (selectedRef.current.has(key)) {
        const next2 = new Map(selectedRef.current)
        next2.set(key, { key, word: res?.word_de || word, loading: false, translation: res?.translation_ru || null, example: res?.example_sentence || null, exampleRu: res?.example_sentence_ru || null, imageUrl: res?.image_url || null })
        updateSelected(next2)
      }
    } catch {
      if (selectedRef.current.has(key)) {
        const next2 = new Map(selectedRef.current)
        next2.set(key, { ...next2.get(key), loading: false })
        updateSelected(next2)
      }
    }
  }, [])

  // ─── копирование предложений (изучаемый язык) ───

  const toggleReadCopy = useCallback((i) => {
    setReadCopySelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }, [])

  const toggleBilingualCopy = useCallback((i) => {
    setBilingualCopySelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }, [])

  const flashCopied = () => { setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 1500) }

  // Копируем ТОЛЬКО текст на изучаемом языке — sentences[i], в порядке следования
  const copyReadSelection = async () => {
    const ordered = [...readCopySelected].sort((a, b) => a - b)
    const textToCopy = ordered.map(i => sentences[i]).join(' ').trim()
    if (!textToCopy) return
    await navigator.clipboard.writeText(textToCopy)
    setReadCopySelected(new Set())
    flashCopied()
  }

  // Копируем ТОЛЬКО pair.original (изучаемый язык), НИКОГДА pair.translation
  const copyBilingualSelection = async () => {
    const ordered = [...bilingualCopySelected].sort((a, b) => a - b)
    const textToCopy = ordered.map(i => bilingual[i].original).join('\n\n').trim()
    if (!textToCopy) return
    await navigator.clipboard.writeText(textToCopy)
    setBilingualCopySelected(new Set())
    flashCopied()
  }

  // ─── TTS ───

  const start = (fromIdx = 0) => {
    const parts = splitSentences(text)
    if (!parts.length) return
    setSentences(parts); setPlaying(true); setActive(fromIdx); clearSelection(); setReadCopySelected(new Set())
    cancelRef.current = false

    const playNext = (i) => {
      if (cancelRef.current || i >= parts.length) { setPlaying(false); setActive(-1); return }
      setActive(i)
      const synth = window.speechSynthesis; synth.cancel()
      const utt = new SpeechSynthesisUtterance(parts[i])
      utt.lang = 'de-DE'; utt.rate = rate
      const savedVoice = localStorage.getItem('de_voice_name')
      const voices = synth.getVoices()
      const deVoice = savedVoice ? voices.find(v => v.name === savedVoice) : voices.find(v => v.lang.startsWith('de'))
      if (deVoice) utt.voice = deVoice
      utt.onend = () => { if (!cancelRef.current) playNext(i + 1) }
      utt.onerror = () => { if (!cancelRef.current) playNext(i + 1) }
      synth.speak(utt)
    }
    playNext(fromIdx)
  }

  const stop = () => { cancelRef.current = true; cancel(); setPlaying(false); setActive(-1) }
  const prepare = () => { setSentences(splitSentences(text)); setActive(-1); setReadCopySelected(new Set()) }

  // ─── двуязычный перевод ───

  const handleTranslate = async () => {
    const paragraphs = splitParagraphs(text)
    if (!paragraphs.length) return
    setTranslating(true); setTranslateError(''); setBilingual([]); setBilingualCopySelected(new Set())
    try {
      const res = await api.post('/reader/translate', { paragraphs, sourceLang: biSrc, targetLang: biTgt, model: transModel })
      setBilingual(res.translations || [])
    } catch (e) {
      setTranslateError('Ошибка перевода: ' + e.message)
    } finally {
      setTranslating(false)
    }
  }

  // ─── режим разговора ───

  const speakOut = (text, langCode) => {
    const langInfo = getLang(langCode)
    const synth = window.speechSynthesis
    synth.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = langInfo.speech
    const voices = synth.getVoices()
    const voice = voices.find(v => v.lang.startsWith(langInfo.speech.slice(0, 2)))
    if (voice) utt.voice = voice
    synth.speak(utt)
  }

  const handleConvResult = useCallback(async (transcript, side) => {
    const srcLang = side === 'src' ? convSrcLang : convTgtLang
    const tgtLang = side === 'src' ? convTgtLang : convSrcLang
    const msgId = Date.now()
    setConvMessages(prev => [...prev, { id: msgId, side, original: transcript, translation: '…' }])
    setConvTranslating(true)
    try {
      const res = await api.post('/reader/speak-translate', {
        text: transcript, sourceLang: srcLang, targetLang: tgtLang,
        model: transModel,
      })
      setConvMessages(prev => prev.map(m => m.id === msgId ? { ...m, translation: res.translation } : m))
      speakOut(res.translation, tgtLang)
    } catch {
      setConvMessages(prev => prev.map(m => m.id === msgId ? { ...m, translation: '❌' } : m))
    } finally {
      setConvTranslating(false)
    }
  }, [convSrcLang, convTgtLang, transModel])

  const startListening = useCallback((side) => {
    if (!hasSpeechApi) {
      alert('Распознавание речи доступно только в Google Chrome. Попробуйте открыть страницу в Chrome.')
      return
    }
    window.speechSynthesis.cancel() // останавливаем TTS перед слушанием
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    const langCode = side === 'src' ? convSrcLang : convTgtLang
    recognition.lang = getLang(langCode).speech
    recognition.continuous = false
    recognition.interimResults = false
    setConvListening(side)
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim()
      if (transcript) handleConvResult(transcript, side)
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') alert('Нет доступа к микрофону. Разрешите в настройках браузера.')
      setConvListening(null)
    }
    recognition.onend = () => setConvListening(null)
    recognition.start()
  }, [convSrcLang, convTgtLang, hasSpeechApi, handleConvResult])

  const stopListening = () => { recognitionRef.current?.stop(); setConvListening(null) }

  const swapConvLangs = () => { setConvSrcLang(convTgtLang); setConvTgtLang(convSrcLang) }

  // ─── загрузить из урока ───

  const loadLesson = async (lesson) => {
    setShowLessons(false); setLoadingLesson(true)
    try {
      const res = await api.get(`/lessons/${lesson.id}/reader-text`)
      if (res.text) {
        setText(res.text); setSentences([]); setBilingual([]); setActive(-1); setReadCopySelected(new Set()); setBilingualCopySelected(new Set())
      } else {
        alert('У этого урока нет примеров предложений')
      }
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setLoadingLesson(false)
    }
  }

  // ─── наборы ───

  const handleSave = async () => {
    if (!saveTitle.trim() || !text.trim()) return
    setSaving(true)
    try {
      const set = await api.post('/phrase-sets', { title: saveTitle.trim(), content: text.trim() })
      setSets(prev => [set, ...prev]); setSaveTitle(''); setShowSave(false)
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  const loadSet = (set) => { stop(); setText(set.content); setSentences([]); setBilingual([]); setActive(-1); setReadCopySelected(new Set()); setBilingualCopySelected(new Set()) }
  const deleteSet = async (id, e) => {
    e.stopPropagation()
    try { await api.delete(`/phrase-sets/${id}`); setSets(prev => prev.filter(s => s.id !== id)) } catch {}
  }

  const textHasContent = text.trim().length > 0
  const hasSelection = selectedWords.size > 0
  const hasCopySelection = mode === 'read' ? readCopySelected.size > 0 : mode === 'bilingual' ? bilingualCopySelected.size > 0 : false

  const srcInfo = getLang(convSrcLang)
  const tgtInfo = getLang(convTgtLang)

  return (
    <div style={{ padding: '24px 14px 60px' }}>

      {/* Заголовок + вкладки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: 0 }}>📖 Читалка</h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
          {[
            { key: 'read',         label: '▶ Читать' },
            { key: 'bilingual',    label: '🌐 Двуязычный' },
            { key: 'conversation', label: '💬 Разговор' },
          ].map(tab => (
            <button key={tab.key} onClick={() => { setMode(tab.key); setReadCopySelected(new Set()); setBilingualCopySelected(new Set()) }} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              background: mode === tab.key ? 'var(--accent)' : 'transparent',
              color: mode === tab.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
              transition: 'all .15s',
            }}>{tab.label}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}><CameraWords /></div>

        {/* Выбор модели — для bilingual и conversation */}
        {(mode === 'bilingual' || mode === 'conversation') && (
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 2, marginLeft: 'auto' }}>
            {[
              { key: 'mini', label: '⚡ Быстро' , title: 'GPT-4o-mini: быстро и дёшево' },
              { key: 'smart', label: '✨ Точно', title: 'GPT-4o: лучшее качество перевода' },
            ].map(m => (
              <button key={m.key} onClick={() => setTransModel(m.key)} title={m.title}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: transModel === m.key ? 'var(--accent)' : 'transparent',
                  color: transModel === m.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
                }}>
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Режим разговора — отдельный UI ─── */}
      {mode === 'conversation' && (
        <div>
          {/* Панель языков */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <LangSelect value={convSrcLang} onChange={setConvSrcLang} />
            <button onClick={swapConvLangs} title="Поменять языки"
              style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)' }}>
              ⇄
            </button>
            <LangSelect value={convTgtLang} onChange={setConvTgtLang} />
          </div>

          {/* История разговора */}
          <div style={{
            minHeight: 180, maxHeight: 420, overflowY: 'auto',
            border: '1px solid var(--line)', borderRadius: 14, padding: 12,
            background: 'var(--surface)', marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {convMessages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', padding: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 14, textAlign: 'center' }}>
                  Нажми кнопку микрофона — скажи что-нибудь,<br />система переведёт и ответит голосом
                </div>
                {!hasSpeechApi && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)', padding: '8px 14px', background: 'rgba(239,68,68,.1)', borderRadius: 8 }}>
                    ⚠️ Распознавание речи работает только в Google Chrome
                  </div>
                )}
              </div>
            ) : (
              convMessages.map(msg => {
                const isSrc = msg.side === 'src'
                const fromLang = getLang(isSrc ? convSrcLang : convTgtLang)
                const toLang   = getLang(isSrc ? convTgtLang : convSrcLang)
                return (
                  <div key={msg.id} style={{
                    alignSelf: isSrc ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    background: isSrc ? 'var(--accent-soft)' : 'var(--surface-2)',
                    border: `1px solid ${isSrc ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: isSrc ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                    padding: '10px 14px',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>
                      {fromLang.flag} {fromLang.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                      {msg.original}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 3 }}>
                      → {toLang.flag} {toLang.label}
                    </div>
                    <div style={{ fontSize: 14, color: msg.translation === '…' ? 'var(--ink-soft)' : 'var(--accent)', fontStyle: msg.translation === '…' ? 'italic' : 'normal' }}>
                      {msg.translation}
                      {msg.translation && msg.translation !== '…' && msg.translation !== '❌' && (
                        <button onClick={() => speakOut(msg.translation, isSrc ? convTgtLang : convSrcLang)}
                          title="Воспроизвести перевод"
                          style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13, padding: '0 2px' }}>
                          🔊
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Кнопки микрофона */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { side: 'src', lang: srcInfo, bg: 'var(--accent)', textColor: 'var(--accent-ink)' },
              { side: 'tgt', lang: tgtInfo, bg: 'var(--surface-2)', textColor: 'var(--ink)' },
            ].map(({ side, lang, bg, textColor }) => {
              const isListening = convListening === side
              const isMyTurn = convListening === null && !convTranslating
              return (
                <button key={side}
                  onClick={() => isListening ? stopListening() : isMyTurn ? startListening(side) : null}
                  disabled={!isMyTurn && !isListening}
                  style={{
                    padding: '18px 12px', borderRadius: 14, border: 'none',
                    background: isListening ? 'var(--red)' : bg,
                    color: isListening ? '#fff' : textColor,
                    cursor: (isMyTurn || isListening) ? 'pointer' : 'default',
                    opacity: (!isMyTurn && !isListening) ? 0.5 : 1,
                    fontSize: 14, fontWeight: 700,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'all .15s',
                  }}>
                  <span style={{ fontSize: 28 }}>
                    {isListening ? '⏹' : convTranslating && !isListening ? '⏳' : '🎤'}
                  </span>
                  <span>{lang.flag} {lang.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                    {isListening ? 'Говорите… (нажмите для остановки)' : convTranslating ? 'Перевожу…' : 'Нажмите и говорите'}
                  </span>
                </button>
              )
            })}
          </div>

          {convMessages.length > 0 && (
            <button onClick={() => setConvMessages([])}
              style={{ marginTop: 10, width: '100%', padding: '8px', border: '1px solid var(--line)', background: 'none', borderRadius: 10, cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }}>
              Очистить историю
            </button>
          )}
        </div>
      )}

      {/* ─── Кнопки загрузки (только для read и bilingual) ─── */}
      {mode !== 'conversation' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div data-lesson-dropdown style={{ position: 'relative' }}>
              <button onClick={() => setShowLessons(v => !v)} disabled={loadingLesson}
                style={{ padding: '7px 14px', background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {loadingLesson ? '…' : '📚 Из урока ▾'}
              </button>
              {showLessons && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
                  background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,.15)', minWidth: 260, maxHeight: 280, overflowY: 'auto',
                }}>
                  {lessons.length === 0 ? (
                    <div style={{ padding: 14, fontSize: 13, color: 'var(--ink-soft)' }}>Нет уроков с примерами</div>
                  ) : lessons.map(lesson => (
                    <div key={lesson.id} onClick={() => loadLesson(lesson)}
                      style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontWeight: 600 }}>{lesson.title}</span>
                      <span style={{ color: 'var(--ink-soft)', fontSize: 12, marginLeft: 8 }}>{lesson.sentences_count} предл.</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {sets.map(set => (
              <div key={set.id} onClick={() => loadSet(set)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, fontSize: 13, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--ink)' }}>
                <span>📄 {set.title}</span>
                <button onClick={e => deleteSet(set.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>

          {/* Поле ввода */}
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setSentences([]); setBilingual([]); setActive(-1); setReadCopySelected(new Set()); setBilingualCopySelected(new Set()) }}
            placeholder="Вставь текст... (абзацы разделяй пустой строкой)"
            rows={6}
            style={{ width: '100%', fontSize: 15, lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box' }}
          />

          {/* Панель управления */}
          <div style={{ display: 'flex', gap: 8, margin: '10px 0 16px', flexWrap: 'wrap', alignItems: 'center' }}>

            {mode === 'read' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[0.7, 0.85, 1.0, 1.2].map(r => (
                    <button key={r} onClick={() => setRate(r)} style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: 13,
                      border: `1px solid ${rate === r ? 'var(--accent)' : 'var(--line)'}`,
                      background: rate === r ? 'var(--accent)' : 'var(--surface-2)',
                      color: rate === r ? 'var(--accent-ink)' : 'var(--ink)',
                      cursor: 'pointer', fontWeight: rate === r ? 700 : 400,
                    }}>{r === 0.7 ? '🐢' : r === 0.85 ? '🚶' : r === 1.0 ? '🏃' : '⚡'}</button>
                  ))}
                </div>
                {!playing ? (
                  <button onClick={() => start(0)} disabled={!textHasContent}
                    style={{ padding: '8px 20px', background: textHasContent ? 'var(--accent)' : 'var(--surface-2)', color: textHasContent ? 'var(--accent-ink)' : 'var(--ink-soft)', border: 'none', borderRadius: 10, cursor: textHasContent ? 'pointer' : 'default', fontSize: 14, fontWeight: 700 }}>
                    ▶ Читать всё
                  </button>
                ) : (
                  <button onClick={stop} style={{ padding: '8px 20px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                    ⏹ Стоп
                  </button>
                )}
                {!playing && sentences.length === 0 && textHasContent && (
                  <button onClick={prepare} style={{ padding: '8px 14px', background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
                    Разбить
                  </button>
                )}
              </>
            )}

            {mode === 'bilingual' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <LangSelect value={biSrc} onChange={v => { setBiSrc(v); setBilingual([]) }} />
                <span style={{ color: 'var(--ink-soft)', fontSize: 18 }}>→</span>
                <LangSelect value={biTgt} onChange={v => { setBiTgt(v); setBilingual([]) }} />
                <button onClick={handleTranslate} disabled={!textHasContent || translating}
                  style={{ padding: '8px 20px', background: textHasContent && !translating ? 'var(--accent)' : 'var(--surface-2)', color: textHasContent && !translating ? 'var(--accent-ink)' : 'var(--ink-soft)', border: 'none', borderRadius: 10, cursor: textHasContent && !translating ? 'pointer' : 'default', fontSize: 14, fontWeight: 700 }}>
                  {translating ? '⏳ Перевожу…' : '🌐 Перевести'}
                </button>
              </div>
            )}

            {textHasContent && !showSave && (
              <button onClick={() => setShowSave(true)} style={{ padding: '8px 14px', background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                💾 Сохранить
              </button>
            )}
            {showSave && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input autoFocus value={saveTitle} onChange={e => setSaveTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="Название набора..."
                  style={{ fontSize: 14, width: 200 }}
                />
                <button onClick={handleSave} disabled={saving || !saveTitle.trim()}
                  style={{ padding: '8px 14px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  {saving ? '…' : '✓'}
                </button>
                <button onClick={() => setShowSave(false)}
                  style={{ padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* ─── Режим чтения (TTS) ─── */}
          {mode === 'read' && (
            <>
              {sentences.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
                    💡 Нажми на предложение — начать с него · Нажми на слово — перевод из словаря · ☐ слева — выбрать для копирования
                  </div>
                  <div style={{
                    background: 'var(--surface)', border: '1px solid var(--line)',
                    borderRadius: 16, padding: '20px 18px', lineHeight: 2.4,
                    paddingBottom: (hasSelection || hasCopySelection) ? 160 : 20,
                  }}>
                    {sentences.map((s, i) => {
                      const copySelected = readCopySelected.has(i)
                      return (
                      <span key={i} style={{ display: 'inline' }}>
                        {/* Чекбокс выбора предложения для копирования — отдельное действие, TTS-клик не трогаем */}
                        <span
                          onClick={e => { e.stopPropagation(); toggleReadCopy(i) }}
                          title="Выбрать для копирования"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, marginRight: 4, verticalAlign: 'middle',
                            borderRadius: 4, cursor: 'pointer', fontSize: 11, lineHeight: 1,
                            border: `1px solid ${copySelected ? 'var(--accent)' : 'var(--line)'}`,
                            background: copySelected ? 'var(--accent)' : 'transparent',
                            color: copySelected ? 'var(--accent-ink)' : 'transparent',
                          }}
                        >✓</span>
                        <span onClick={() => !playing && start(i)} style={{
                          display: 'inline',
                          background: active === i ? 'var(--accent-soft)' : 'transparent',
                          borderRadius: 6, padding: '1px 0',
                          cursor: playing ? 'default' : 'pointer',
                          borderBottom: active === i ? '2px solid var(--accent)' : 'none',
                          outline: copySelected ? '1px solid var(--accent)' : 'none',
                        }}>
                          {tokenize(s).map((token, j) => {
                            const key = token.toLowerCase()
                            const sel = isWord(token) && selectedWords.has(key)
                            return isWord(token) ? (
                              <span key={j}
                                onClick={e => { e.stopPropagation(); handleWordClick(token) }}
                                style={{
                                  fontSize: 17, fontWeight: sel ? 700 : active === i ? 600 : 400,
                                  color: sel ? 'var(--accent)' : active === i ? 'var(--accent)' : 'var(--ink)',
                                  cursor: 'pointer', borderRadius: 4, padding: '1px 2px',
                                  background: sel ? 'var(--accent-soft)' : 'transparent',
                                  outline: sel ? '1px solid var(--accent)' : 'none',
                                }}
                                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--accent-soft)' }}
                                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
                              >{token}</span>
                            ) : (
                              <span key={j} style={{ fontSize: 17, color: active === i ? 'var(--accent)' : 'var(--ink)', fontWeight: active === i ? 600 : 400 }}>{token}</span>
                            )
                          })}
                        </span>
                        {' '}
                      </span>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, color: 'var(--ink-soft)', textAlign: 'center' }}>
                  <p style={{ fontSize: 36, marginTop: 0 }}>🎧</p>
                  <p style={{ margin: '0 0 6px' }}>Вставь немецкий текст и нажми «Читать всё»</p>
                  <p style={{ fontSize: 13, margin: 0 }}>Или загрузи текст из урока — «Разбить» для кликабельных предложений</p>
                </div>
              )}
            </>
          )}

          {/* ─── Двуязычный режим ─── */}
          {mode === 'bilingual' && (
            <>
              {translateError && (
                <div style={{ color: 'var(--red)', fontSize: 14, marginBottom: 12 }}>{translateError}</div>
              )}
              {translating && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, color: 'var(--ink-soft)', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, marginTop: 0 }}>⏳</p>
                  <p style={{ margin: 0 }}>GPT переводит абзацы…</p>
                </div>
              )}
              {!translating && bilingual.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: (hasSelection || hasCopySelection) ? 180 : 20 }}>
                  {bilingual.map((pair, i) => {
                    const copySelected = bilingualCopySelected.has(i)
                    return (
                    <div key={i} style={{
                      border: `1px solid ${copySelected ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 14, overflow: 'hidden', background: 'var(--surface)',
                    }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          {/* Чекбокс выбора абзаца для копирования — копируем только pair.original (изучаемый язык) */}
                          <span
                            onClick={() => toggleBilingualCopy(i)}
                            title="Выбрать для копирования"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 16, height: 16, verticalAlign: 'middle',
                              borderRadius: 4, cursor: 'pointer', fontSize: 11, lineHeight: 1, flexShrink: 0,
                              border: `1px solid ${copySelected ? 'var(--accent)' : 'var(--line)'}`,
                              background: copySelected ? 'var(--accent)' : 'transparent',
                              color: copySelected ? 'var(--accent-ink)' : 'transparent',
                            }}
                          >✓</span>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{getLang(biSrc).flag} {getLang(biSrc).label}</div>
                        </div>
                        <ClickableParagraph text={pair.original} selectedWords={selectedWords} onWordClick={handleWordClick} />
                      </div>
                      <div style={{ padding: '10px 16px', background: 'var(--surface-2)' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 4 }}>{getLang(biTgt).flag} {getLang(biTgt).label}</div>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7, fontStyle: 'italic' }}>
                          {pair.translation}
                        </p>
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
              {!translating && bilingual.length === 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, color: 'var(--ink-soft)', textAlign: 'center' }}>
                  <p style={{ fontSize: 36, marginTop: 0 }}>🌐</p>
                  <p style={{ margin: 0 }}>{textHasContent ? 'Выбери языки и нажми «Перевести»' : 'Вставь текст или загрузи из урока'}</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Панель выбранных слов */}
      <WordPanel words={selectedWords} onRemove={removeWord} onClear={clearSelection} />

      {/* Плавающая панель «Копировать» — только текст на изучаемом языке */}
      {mode === 'read' && (
        <CopySelectionBar
          count={readCopySelected.size}
          onCopy={copyReadSelection}
          onCancel={() => setReadCopySelected(new Set())}
          copied={copyFeedback}
          bottomOffset={hasSelection ? 'calc(55vh + 16px)' : 16}
        />
      )}
      {mode === 'bilingual' && (
        <CopySelectionBar
          count={bilingualCopySelected.size}
          onCopy={copyBilingualSelection}
          onCancel={() => setBilingualCopySelected(new Set())}
          copied={copyFeedback}
          bottomOffset={hasSelection ? 'calc(55vh + 16px)' : 16}
        />
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
