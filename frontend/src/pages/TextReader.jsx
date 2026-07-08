import { useState, useRef, useEffect, useCallback } from 'react'
import { speak, cancel, SpeakButton } from '../hooks/useSpeech.jsx'
import { api } from '../api/client.js'

function splitSentences(text) {
  return text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g)?.map(s => s.trim()).filter(Boolean) ?? []
}

// Токенизация предложения на слова и пунктуацию
function tokenize(sentence) {
  return sentence.match(/[\wäöüÄÖÜß]+|[^\wäöüÄÖÜß]/g) || []
}

function isWord(token) {
  return /[\wäöüÄÖÜß]/.test(token)
}

// Панель перевода — фиксированная снизу
function WordPanel({ entry, onClose }) {
  if (!entry) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 640, zIndex: 300,
      background: 'var(--surface)', borderTop: '1px solid var(--line)',
      borderRadius: '20px 20px 0 0',
      padding: '20px 24px 36px',
      boxShadow: '0 -12px 40px rgba(0,0,0,.4)',
      animation: 'slideUp .2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>{entry.word}</span>
            <SpeakButton text={entry.word} size={22} />
          </div>
          {entry.loading ? (
            <div style={{ color: 'var(--ink-soft)', fontSize: 14 }}>...</div>
          ) : entry.translation ? (
            <>
              <div style={{ fontSize: 18, color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>
                {entry.translation}
              </div>
              {entry.example && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  <span style={{ fontStyle: 'italic' }}>{entry.example}</span>
                  {entry.exampleRu && <><br /><span style={{ color: 'var(--ink-soft)' }}>{entry.exampleRu}</span></>}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
              Не найдено в словаре — произношение доступно
            </div>
          )}
        </div>
        {entry.imageUrl && (
          <img src={entry.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
        )}
      </div>
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

  // Состояние выбранного слова
  const [wordEntry, setWordEntry] = useState(null) // { word, translation, example, exampleRu, imageUrl, loading }

  const idxRef    = useRef(0)
  const cancelRef = useRef(false)

  useEffect(() => {
    api.get('/phrase-sets').then(setSets).catch(e => console.error('phrase-sets:', e))
    return () => { cancel(); cancelRef.current = true }
  }, [])

  const handleWordClick = useCallback(async (raw) => {
    // Убираем артикли для поиска
    const word = raw.replace(/^(der|die|das|ein|eine|einen|dem|den|des)\s+/i, '').trim()
    if (!word) return

    speak(word)
    setWordEntry({ word, loading: true, translation: null, example: null, exampleRu: null, imageUrl: null })

    try {
      const res = await api.get(`/words/lookup?q=${encodeURIComponent(word)}`)
      if (res) {
        setWordEntry({
          word: res.word_de || word,
          loading: false,
          translation: res.translation_ru,
          example: res.example_sentence,
          exampleRu: res.example_sentence_ru,
          imageUrl: res.image_url,
        })
      } else {
        setWordEntry(prev => ({ ...prev, loading: false }))
      }
    } catch {
      setWordEntry(prev => ({ ...prev, loading: false }))
    }
  }, [])

  const start = async (fromIdx = 0) => {
    const parts = splitSentences(text)
    if (!parts.length) return
    setSentences(parts)
    setPlaying(true)
    setActive(fromIdx)
    setWordEntry(null)
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

  return (
    <div style={{ padding: '12px 14px 40px' }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 24, marginTop: 0, marginBottom: 6 }}>📖 Читалка</h1>
      <p style={{ color: 'var(--ink-soft)', marginBottom: 16, fontSize: 14 }}>
        Вставь немецкий текст — читай по абзацам или кликай на слова для перевода.
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
            💡 Нажми на предложение чтобы начать с него · Нажми на слово чтобы увидеть перевод
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 18px', lineHeight: 2.4, paddingBottom: wordEntry ? 140 : 20 }}>
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
                  {tokenize(s).map((token, j) => (
                    isWord(token) ? (
                      <span key={j}
                        onClick={e => { e.stopPropagation(); handleWordClick(token) }}
                        style={{
                          fontSize: 17,
                          fontWeight: active === i ? 600 : 400,
                          color: active === i ? 'var(--accent)' : 'var(--ink)',
                          cursor: 'pointer',
                          borderRadius: 4,
                          padding: '0 1px',
                          transition: 'background .1s',
                          display: 'inline',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >{token}</span>
                    ) : (
                      <span key={j} style={{ fontSize: 17, color: active === i ? 'var(--accent)' : 'var(--ink)', fontWeight: active === i ? 600 : 400 }}>{token}</span>
                    )
                  ))}
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

      {/* Панель перевода выбранного слова */}
      <WordPanel entry={wordEntry} onClose={() => setWordEntry(null)} />

      <style>{`
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
