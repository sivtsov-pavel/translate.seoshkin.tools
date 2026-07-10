import { useState, useRef, useEffect, useCallback } from 'react'
import { speak, cancel, SpeakButton } from '../hooks/useSpeech.jsx'
import { api } from '../api/client.js'

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

// ───────── панель выбранных слов ─────────

function WordPanel({ words, onRemove, onClear }) {
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
  const [mode, setMode]     = useState('read')   // 'read' | 'bilingual'
  const [text, setText]     = useState('')

  // Режим чтения (TTS)
  const [sentences, setSentences]   = useState([])
  const [active, setActive]         = useState(-1)
  const [playing, setPlaying]       = useState(false)
  const [rate, setRate]             = useState(0.85)

  // Двуязычный режим
  const [bilingual, setBilingual]   = useState([]) // [{de, ru}]
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')

  // Выбранные слова
  const [selectedWords, setSelectedWords] = useState(new Map())
  const selectedRef = useRef(new Map())

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

  // ─── TTS ───

  const start = (fromIdx = 0) => {
    const parts = splitSentences(text)
    if (!parts.length) return
    setSentences(parts); setPlaying(true); setActive(fromIdx); clearSelection()
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
  const prepare = () => { setSentences(splitSentences(text)); setActive(-1) }

  // ─── перевод абзацев ───

  const handleTranslate = async () => {
    const paragraphs = splitParagraphs(text)
    if (!paragraphs.length) return
    setTranslating(true); setTranslateError(''); setBilingual([])
    try {
      const res = await api.post('/reader/translate', { paragraphs })
      setBilingual(res.translations || [])
    } catch (e) {
      setTranslateError('Ошибка перевода: ' + e.message)
    } finally {
      setTranslating(false)
    }
  }

  // ─── загрузить из урока ───

  const loadLesson = async (lesson) => {
    setShowLessons(false); setLoadingLesson(true)
    try {
      const res = await api.get(`/lessons/${lesson.id}/reader-text`)
      if (res.text) {
        setText(res.text); setSentences([]); setBilingual([]); setActive(-1)
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

  const loadSet = (set) => { stop(); setText(set.content); setSentences([]); setBilingual([]); setActive(-1) }
  const deleteSet = async (id, e) => {
    e.stopPropagation()
    try { await api.delete(`/phrase-sets/${id}`); setSets(prev => prev.filter(s => s.id !== id)) } catch {}
  }

  const textHasContent = text.trim().length > 0
  const hasSelection = selectedWords.size > 0

  return (
    <div style={{ padding: '24px 14px 60px' }}>

      {/* Заголовок + вкладки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: 0 }}>📖 Читалка</h1>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
          {[{ key: 'read', label: '▶ Читать' }, { key: 'bilingual', label: '🌐 Двуязычный' }].map(tab => (
            <button key={tab.key} onClick={() => setMode(tab.key)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              background: mode === tab.key ? 'var(--accent)' : 'transparent',
              color: mode === tab.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
              transition: 'all .15s',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Кнопки загрузки */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Загрузить из урока */}
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

        {/* Сохранённые наборы */}
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
        onChange={e => { setText(e.target.value); setSentences([]); setActive(-1) }}
        placeholder="Вставь немецкий текст... (абзацы разделяй пустой строкой)"
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
          <button onClick={handleTranslate} disabled={!textHasContent || translating}
            style={{ padding: '8px 20px', background: textHasContent && !translating ? 'var(--accent)' : 'var(--surface-2)', color: textHasContent && !translating ? 'var(--accent-ink)' : 'var(--ink-soft)', border: 'none', borderRadius: 10, cursor: textHasContent && !translating ? 'pointer' : 'default', fontSize: 14, fontWeight: 700 }}>
            {translating ? '⏳ Перевожу…' : '🌐 Перевести'}
          </button>
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
                💡 Нажми на предложение — начать с него · Нажми на слово — перевод из словаря
              </div>
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 16, padding: '20px 18px', lineHeight: 2.4,
                paddingBottom: hasSelection ? 160 : 20,
              }}>
                {sentences.map((s, i) => (
                  <span key={i} style={{ display: 'inline' }}>
                    <span onClick={() => !playing && start(i)} style={{
                      display: 'inline',
                      background: active === i ? 'var(--accent-soft)' : 'transparent',
                      borderRadius: 6, padding: '1px 0',
                      cursor: playing ? 'default' : 'pointer',
                      borderBottom: active === i ? '2px solid var(--accent)' : 'none',
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
                ))}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: hasSelection ? 180 : 20 }}>
              {bilingual.map((pair, i) => (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
                  {/* Немецкий — кликабельные слова */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                    <ClickableParagraph text={pair.de} selectedWords={selectedWords} onWordClick={handleWordClick} />
                  </div>
                  {/* Русский перевод */}
                  <div style={{ padding: '10px 16px', background: 'var(--surface-2)' }}>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.7, fontStyle: 'italic' }}>
                      {pair.ru}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!translating && bilingual.length === 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, color: 'var(--ink-soft)', textAlign: 'center' }}>
              <p style={{ fontSize: 36, marginTop: 0 }}>🌐</p>
              <p style={{ margin: 0 }}>{textHasContent ? 'Нажми «Перевести» — получишь каждый абзац с русским переводом' : 'Вставь немецкий текст или загрузи из урока'}</p>
            </div>
          )}
        </>
      )}

      {/* Панель выбранных слов */}
      <WordPanel words={selectedWords} onRemove={removeWord} onClear={clearSelection} />

      <style>{`
        @keyframes slideUp { from { transform: translateX(-50%) translateY(20px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
