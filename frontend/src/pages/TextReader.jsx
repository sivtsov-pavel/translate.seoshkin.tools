import { useState, useRef, useEffect, useCallback } from 'react'
import { speak, cancel, SpeakButton } from '../hooks/useSpeech.jsx'
import { api } from '../api/client.js'

function splitSentences(text) {
  return text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map(s => s.trim()).filter(Boolean) ?? []
}

function tokenize(sentence) {
  return sentence.match(/[\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]/g) || []
}

function isWord(token) {
  return /[\wäöüÄÖÜß]/.test(token)
}

// Панель выбранных слов — фиксированная снизу
function SelectionPanel({ words, onRemove, onClear }) {
  if (!words.size) return null
  const entries = [...words.values()]
  const count = words.size
  const label = count === 1 ? 'слово' : count < 5 ? 'слова' : 'слов'

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
      {/* Заголовок */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
          {count} {label}
        </span>
        <button onClick={onClear} style={{
          background: 'none', border: 'none', color: 'var(--ink-soft)',
          cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 8,
        }}>
          Очистить всё ✕
        </button>
      </div>

      {/* Список слов с прокруткой */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {entries.map(entry => (
          <div key={entry.key} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px', borderBottom: '1px solid var(--line)',
          }}>
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
            <button onClick={() => onRemove(entry.key)} style={{
              background: 'none', border: 'none', color: 'var(--ink-soft)',
              cursor: 'pointer', fontSize: 20, flexShrink: 0, padding: '0 4px', lineHeight: 1,
            }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ height: 24, flexShrink: 0 }} />
    </div>
  )
}

export default function TextReader() {
  const [text, setText]           = useState('')
  const [sentences, setSentences] = useState([])
  const [active, setActive]       = useState(-1)
  const [playing, setPlaying]     = useState(false)
  const [rate, setRate]           = useState(0.85)

  const [sets, setSets]           = useState([])
  const [saveTitle, setSaveTitle] = useState('')
  const [showSave, setShowSave]   = useState(false)
  const [saving, setSaving]       = useState(false)

  const [customSentence, setCustomSentence] = useState('')
  const [showCustom, setShowCustom]         = useState(false)

  // Выбранные слова: Map<key, {key, word, loading, translation, example, exampleRu, imageUrl}>
  const [selectedWords, setSelectedWords] = useState(new Map())
  const selectedRef = useRef(new Map()) // синхронный доступ внутри async

  const idxRef    = useRef(0)
  const cancelRef = useRef(false)

  useEffect(() => {
    api.get('/phrase-sets').then(setSets).catch(e => console.error('phrase-sets:', e))
    return () => { cancel(); cancelRef.current = true }
  }, [])

  const updateSelected = (map) => {
    selectedRef.current = map
    setSelectedWords(new Map(map))
  }

  const handleWordClick = useCallback(async (raw) => {
    const word = raw.replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()
    if (!word) return
    const key = word.toLowerCase()

    // Если уже выбрано — снять выбор
    if (selectedRef.current.has(key)) {
      const next = new Map(selectedRef.current)
      next.delete(key)
      updateSelected(next)
      return
    }

    // Добавить с загрузкой
    speak(word)
    const next = new Map(selectedRef.current)
    next.set(key, { key, word, loading: true, translation: null, example: null, exampleRu: null, imageUrl: null })
    updateSelected(next)

    try {
      const res = await api.get(`/words/lookup?q=${encodeURIComponent(word)}`)
      if (selectedRef.current.has(key)) {
        const next2 = new Map(selectedRef.current)
        next2.set(key, {
          key,
          word: res?.word_de || word,
          loading: false,
          translation: res?.translation_ru || null,
          example: res?.example_sentence || null,
          exampleRu: res?.example_sentence_ru || null,
          imageUrl: res?.image_url || null,
        })
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

  const clearSelection = useCallback(() => { updateSelected(new Map()) }, [])
  const removeWord = useCallback((key) => {
    const next = new Map(selectedRef.current)
    next.delete(key)
    updateSelected(next)
  }, [])

  const start = async (fromIdx = 0) => {
    const parts = splitSentences(text)
    if (!parts.length) return
    setSentences(parts)
    setPlaying(true)
    setActive(fromIdx)
    clearSelection()
    cancelRef.current = false
    idxRef.current = fromIdx

    const playNext = (i) => {
      if (cancelRef.current || i >= parts.length) {
        setPlaying(false); setActive(-1); return
      }
      setActive(i); idxRef.current = i
      const synth = window.speechSynthesis
      synth.cancel()
      const utt = new SpeechSynthesisUtterance(parts[i])
      utt.lang = 'de-DE'; utt.rate = rate
      const savedVoice = localStorage.getItem('de_voice_name')
      const voices = synth.getVoices()
      const deVoice = savedVoice
        ? voices.find(v => v.name === savedVoice)
        : voices.find(v => v.lang.startsWith('de'))
      if (deVoice) utt.voice = deVoice
      utt.onend  = () => { if (!cancelRef.current) playNext(i + 1) }
      utt.onerror = () => { if (!cancelRef.current) playNext(i + 1) }
      synth.speak(utt)
    }
    playNext(fromIdx)
  }

  const stop = () => {
    cancelRef.current = true; cancel()
    setPlaying(false); setActive(-1)
  }

  const prepare = () => { setSentences(splitSentences(text)); setActive(-1) }

  const handleSave = async () => {
    if (!saveTitle.trim() || !text.trim()) return
    setSaving(true)
    try {
      const set = await api.post('/phrase-sets', { title: saveTitle.trim(), content: text.trim() })
      setSets(prev => [set, ...prev])
      setSaveTitle(''); setShowSave(false)
      alert(`Набор "${set.title}" сохранён!`)
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  const addCustomSentence = () => {
    const s = customSentence.trim(); if (!s) return
    setText(prev => prev ? prev + '\n' + s : s)
    setSentences([]); setActive(-1)
    setCustomSentence(''); setShowCustom(false)
  }

  const handleLoad = (set) => { stop(); setText(set.content); setSentences([]); setActive(-1) }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    try { await api.delete(`/phrase-sets/${id}`); setSets(prev => prev.filter(s => s.id !== id)) } catch {}
  }

  const hasSelection = selectedWords.size > 0

  return (
    <div style={{ padding: '12px 14px 40px' }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 24, marginTop: 0, marginBottom: 6 }}>📖 Читалка</h1>
      <p style={{ color: 'var(--ink-soft)', marginBottom: 16, fontSize: 14 }}>
        Вставь немецкий текст — читай по абзацам или выбирай слова для перевода.
      </p>

      {/* Сохранённые наборы */}
      {sets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
            Сохранённые наборы
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sets.map(set => (
              <div key={set.id} onClick={() => handleLoad(set)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 20, fontSize: 13,
                  border: '1px solid var(--line)', background: 'var(--surface-2)',
                  cursor: 'pointer', color: 'var(--ink)',
                }}>
                <span>📄 {set.title}</span>
                <button onClick={e => handleDelete(set.id, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Поле ввода текста */}
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSentences([]); setActive(-1) }}
        placeholder="Вставь сюда немецкий текст..."
        rows={7}
        style={{ width: '100%', fontSize: 15, lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box' }}
      />

      {/* Скорость */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Скорость:</span>
        {[0.7, 0.85, 1.0, 1.2].map(r => (
          <button key={r} onClick={() => setRate(r)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13,
              border: `1px solid ${rate === r ? 'var(--accent)' : 'var(--line)'}`,
              background: rate === r ? 'var(--accent)' : 'var(--surface-2)',
              color: rate === r ? 'var(--accent-ink)' : 'var(--ink)',
              cursor: 'pointer', fontWeight: rate === r ? 700 : 400,
            }}>
            {r === 0.7 ? '🐢' : r === 0.85 ? '🚶' : r === 1.0 ? '🏃' : '⚡'}
          </button>
        ))}
      </div>

      {/* Кнопки управления */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {!playing ? (
          <button onClick={() => start(0)} disabled={!text.trim()}
            style={{ padding: '10px 24px', background: text.trim() ? 'var(--accent)' : 'var(--surface-2)', color: text.trim() ? 'var(--accent-ink)' : 'var(--ink-soft)', border: 'none', borderRadius: 10, cursor: text.trim() ? 'pointer' : 'default', fontSize: 15, fontWeight: 700 }}>
            ▶ Читать всё
          </button>
        ) : (
          <button onClick={stop}
            style={{ padding: '10px 24px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            ⏹ Стоп
          </button>
        )}

        {!playing && sentences.length === 0 && text.trim() && (
          <button onClick={prepare}
            style={{ padding: '10px 16px', background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
            Разбить
          </button>
        )}

        {text.trim() && !showSave && (
          <button onClick={() => setShowSave(true)}
            style={{ padding: '10px 16px', background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
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
              style={{ padding: '10px 16px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {saving ? '...' : '✓'}
            </button>
            <button onClick={() => setShowSave(false)}
              style={{ padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Добавить своё предложение */}
      <div style={{ marginBottom: 16 }}>
        {!showCustom ? (
          <button onClick={() => setShowCustom(true)}
            style={{ padding: '7px 14px', background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 13 }}>
            ✏️ Добавить предложение
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input autoFocus value={customSentence} onChange={e => setCustomSentence(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomSentence()}
              placeholder="Немецкое предложение..."
              style={{ fontSize: 14, flex: 1, minWidth: 220 }}
            />
            <button onClick={addCustomSentence} disabled={!customSentence.trim()}
              style={{ padding: '10px 16px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              + Добавить
            </button>
            <button onClick={() => { setShowCustom(false); setCustomSentence('') }}
              style={{ padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Текст с подсветкой по предложениям + кликабельные слова */}
      {sentences.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
            💡 Нажми на предложение чтобы начать с него · Нажми на слово — выбрать/убрать перевод
          </div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 16, padding: '20px 18px', lineHeight: 2.4,
            paddingBottom: hasSelection ? 160 : 20,
          }}>
            {sentences.map((s, i) => (
              <span key={i} style={{ display: 'inline' }}>
                <span
                  onClick={() => !playing && start(i)}
                  style={{
                    display: 'inline',
                    background: active === i ? 'var(--accent-soft)' : 'transparent',
                    borderRadius: 6, padding: '1px 0',
                    cursor: playing ? 'default' : 'pointer',
                    borderBottom: active === i ? '2px solid var(--accent)' : 'none',
                    transition: 'background .2s',
                  }}>
                  {tokenize(s).map((token, j) => {
                    const key = token.toLowerCase()
                    const sel = isWord(token) && selectedWords.has(key)
                    return isWord(token) ? (
                      <span key={j}
                        onClick={e => { e.stopPropagation(); handleWordClick(token) }}
                        style={{
                          fontSize: 17,
                          fontWeight: sel ? 700 : (active === i ? 600 : 400),
                          color: sel ? 'var(--accent)' : (active === i ? 'var(--accent)' : 'var(--ink)'),
                          cursor: 'pointer',
                          borderRadius: 4,
                          padding: '1px 2px',
                          background: sel ? 'var(--accent-soft)' : 'transparent',
                          outline: sel ? '1px solid var(--accent)' : 'none',
                          transition: 'background .1s',
                          display: 'inline',
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
            ))}
          </div>
        </>
      )}

      {sentences.length === 0 && !text && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, color: 'var(--ink-soft)', textAlign: 'center' }}>
          <p style={{ fontSize: 36, marginTop: 0 }}>🎧</p>
          <p style={{ margin: '0 0 6px' }}>Вставь немецкий текст и нажми «Читать всё»</p>
          <p style={{ fontSize: 13, margin: 0 }}>Или нажми «Разбить» чтобы кликать по словам и предложениям</p>
        </div>
      )}

      {/* Панель выбранных слов */}
      <SelectionPanel words={selectedWords} onRemove={removeWord} onClear={clearSelection} />

      <style>{`
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
