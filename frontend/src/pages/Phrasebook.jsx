import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client.js'
import { useOnline, OfflineNotice } from '../components/OfflineGuard.jsx'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import { useSpeechRecognition, speechSimilarity, isSpeechRecognitionSupported } from '../hooks/useSpeechRecognition.jsx'

const CATEGORIES = [
  'Приветствия', 'Прощание', 'Знакомство', 'В школе', 'Числа и время',
  'Покупки', 'Транспорт', 'Семья', 'Еда', 'Разное',
]

// Раздел требует сервер/ИИ: guard-обёртка отдельным компонентом, чтобы ранний
// return не менял список хуков основного компонента (Rules of Hooks)
export default function Phrasebook() {
  const online = useOnline()
  if (!online) return <OfflineNotice />
  return <PhrasebookInner />
}

function PhrasebookInner() {
  const [phrases, setPhrases]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showAdd, setShowAdd]     = useState(false)

  // Поля формы добавления
  const [newDe, setNewDe]       = useState('')
  const [newRu, setNewRu]       = useState('')
  const [newCat, setNewCat]     = useState('')
  const [adding, setAdding]     = useState(false)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    api.get('/phrasebook').then(data => { setPhrases(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Автоперевод DE→RU при blur из поля немецкого текста
  const autoTranslate = async () => {
    const text = newDe.trim()
    if (!text || newRu.trim()) return // не перезаписываем если уже заполнено
    setTranslating(true)
    try {
      const res = await api.post('/translate-text', { text, from: 'de', to: 'ru' })
      if (res.translation) setNewRu(res.translation)
    } catch {}
    setTranslating(false)
  }

  const toggleLearned = async (id) => {
    const res = await api.patch(`/phrasebook/${id}/learned`, {})
    setPhrases(prev => prev.map(p => p.id === id ? { ...p, learned: res.learned } : p))
  }

  const deletePhrase = async (id) => {
    await api.delete(`/phrasebook/${id}`)
    setPhrases(prev => prev.filter(p => p.id !== id))
  }

  const updatePhrase = (updated) => {
    setPhrases(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  const addPhrase = async () => {
    if (!newDe.trim() || !newRu.trim()) return
    setAdding(true)
    try {
      const p = await api.post('/phrasebook', { de: newDe.trim(), ru: newRu.trim(), category: newCat || null, source: 'manual' })
      if (!p.duplicate) setPhrases(prev => [p, ...prev])
      setNewDe(''); setNewRu(''); setNewCat(''); setShowAdd(false)
    } catch (e) { alert('Ошибка: ' + e.message) }
    setAdding(false)
  }

  const visible = phrases.filter(p => {
    if (filter === 'learned' && !p.learned) return false
    if (filter === 'new' && p.learned) return false
    if (catFilter && p.category !== catFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return p.de.toLowerCase().includes(q) || p.ru.toLowerCase().includes(q)
    }
    return true
  })

  const grouped = {}
  for (const p of visible) {
    const cat = p.category || 'Разное'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(p)
  }
  const sortedCats = Object.keys(grouped).sort()
  const cats = [...new Set(phrases.map(p => p.category).filter(Boolean))]
  const learnedCount = phrases.filter(p => p.learned).length

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-soft)' }}>Загрузка…</div>

  return (
    <div style={{ padding: '24px 14px 80px' }}>

      {/* Заголовок */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px' }}>💬 Разговорник</h1>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {phrases.length} фраз · выучено {learnedCount}
          </span>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
          + Добавить фразу
        </button>
      </div>

      {/* Форма добавления */}
      {showAdd && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <input value={newDe} onChange={e => setNewDe(e.target.value)}
              onBlur={autoTranslate}
              placeholder="Немецкая фраза…"
              style={{ fontSize: 15, width: '100%' }} autoFocus
            />
          </div>
          <div style={{ position: 'relative' }}>
            <input value={newRu} onChange={e => setNewRu(e.target.value)}
              placeholder={translating ? 'Перевожу…' : 'Перевод на русский (ИИ заполнит автоматически)…'}
              style={{ fontSize: 15, width: '100%', opacity: translating ? 0.6 : 1 }}
            />
            {translating && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--accent)' }}>
                ⏳
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={newCat} onChange={e => setNewCat(e.target.value)}
              style={{ flex: 1, fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
              <option value="">— Категория —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={addPhrase} disabled={adding || !newDe.trim() || !newRu.trim()}
              style={{ padding: '8px 20px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {adding ? '…' : '✓ Сохранить'}
            </button>
            <button onClick={() => { setShowAdd(false); setNewDe(''); setNewRu(''); setNewCat('') }}
              style={{ padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
          {[['all', 'Все'], ['new', 'Учить'], ['learned', 'Выучил']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '5px 12px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              background: filter === key ? 'var(--accent)' : 'transparent',
              color: filter === key ? 'var(--accent-ink)' : 'var(--ink-soft)',
            }}>{label}</button>
          ))}
        </div>

        {cats.length > 0 && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
            <option value="">Все категории</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Поиск…"
          style={{ flex: 1, minWidth: 140, fontSize: 14, padding: '6px 12px', borderRadius: 8 }}
        />
      </div>

      {phrases.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>💬</p>
          <p style={{ margin: '0 0 8px', fontSize: 16 }}>Разговорник пуст</p>
          <p style={{ margin: 0, fontSize: 13 }}>Добавляй фразы вручную или сохраняй из упражнений кнопкой 📖</p>
        </div>
      )}

      {sortedCats.map(cat => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
            {cat} <span style={{ fontWeight: 400 }}>({grouped[cat].length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped[cat].map(p => (
              <PhraseCard key={p.id} phrase={p} onToggle={toggleLearned} onDelete={deletePhrase} onUpdate={updatePhrase} />
            ))}
          </div>
        </div>
      ))}

      {visible.length === 0 && phrases.length > 0 && (
        <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 32, fontSize: 14 }}>
          Ничего не найдено
        </div>
      )}
    </div>
  )
}

function PhraseCard({ phrase, onToggle, onDelete, onUpdate }) {
  const [editing, setEditing]   = useState(false)
  const [editDe, setEditDe]     = useState(phrase.de)
  const [editRu, setEditRu]     = useState(phrase.ru)
  const [editCat, setEditCat]   = useState(phrase.category || '')
  const [saving, setSaving]     = useState(false)
  const [translating, setTranslating] = useState(false)

  const startEdit = () => { setEditDe(phrase.de); setEditRu(phrase.ru); setEditCat(phrase.category || ''); setEditing(true) }
  const cancelEdit = () => setEditing(false)

  const autoTranslateEdit = async () => {
    const text = editDe.trim()
    if (!text) return
    setTranslating(true)
    try {
      const res = await api.post('/translate-text', { text, from: 'de', to: 'ru' })
      if (res.translation) setEditRu(res.translation)
    } catch {}
    setTranslating(false)
  }

  const save = async () => {
    if (!editDe.trim() || !editRu.trim()) return
    setSaving(true)
    try {
      const updated = await api.patch(`/phrasebook/${phrase.id}`, { de: editDe.trim(), ru: editRu.trim(), category: editCat || null })
      onUpdate(updated)
      setEditing(false)
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  if (editing) {
    return (
      <div style={{ border: '1px solid var(--accent)', borderRadius: 12, padding: '12px 14px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <input value={editDe} onChange={e => setEditDe(e.target.value)}
            onBlur={autoTranslateEdit}
            placeholder="Немецкая фраза…"
            style={{ fontSize: 15, fontWeight: 700, width: '100%' }}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <input value={editRu} onChange={e => setEditRu(e.target.value)}
            placeholder={translating ? 'Перевожу…' : 'Перевод…'}
            style={{ fontSize: 14, width: '100%', color: 'var(--accent)', opacity: translating ? 0.6 : 1 }}
          />
          {translating && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--accent)' }}>⏳</span>
          )}
        </div>
        <select value={editCat} onChange={e => setEditCat(e.target.value)}
          style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
          <option value="">— Категория —</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving || !editDe.trim() || !editRu.trim()}
            style={{ flex: 1, padding: '7px 0', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {saving ? '…' : '✓ Сохранить'}
          </button>
          <button onClick={cancelEdit}
            style={{ padding: '7px 14px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Отмена
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      border: '1px solid var(--line)', borderRadius: 12,
      padding: '12px 14px', background: 'var(--surface)',
      opacity: phrase.learned ? 0.65 : 1,
      transition: 'opacity .2s',
    }}>
      <button onClick={() => onToggle(phrase.id)} title={phrase.learned ? 'Снять отметку' : 'Отметить как выученное'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
        {phrase.learned ? '✅' : '⬜'}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', textDecoration: phrase.learned ? 'line-through' : 'none' }}>
            {phrase.de}
          </span>
          <SpeakButton text={phrase.de} size={14} />
        </div>
        <div style={{ fontSize: 14, color: 'var(--accent)', marginTop: 2 }}>
          {phrase.ru}
        </div>
        {phrase.source === 'exercise' && (
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>из упражнения</div>
        )}
      </div>

      {isSpeechRecognitionSupported() && <MicButton text={phrase.de} />}
      <button onClick={startEdit} title="Редактировать"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 16, flexShrink: 0, padding: '0 4px' }}>
        <i className="bi bi-pencil" />
      </button>
      <button onClick={() => onDelete(phrase.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, flexShrink: 0, padding: '0 4px' }}>
        ×
      </button>
    </div>
  )
}

// Кнопка микрофона для мини-проверки произношения в разговорнике
function MicButton({ text }) {
  const [status, setStatus] = useState('idle') // idle | listening | ok | bad | almost
  const [transcript, setTranscript] = useState('')

  const handleResult = useCallback((tr) => {
    const sim = speechSimilarity(tr, text)
    setTranscript(tr)
    setStatus(sim >= 0.75 ? 'ok' : sim >= 0.5 ? 'almost' : 'bad')
    // Через 3с сбрасываем индикатор
    setTimeout(() => setStatus('idle'), 3000)
  }, [text])

  const { start, listening } = useSpeechRecognition({ lang: 'de-DE', onResult: handleResult })

  useEffect(() => {
    if (listening) setStatus('listening')
  }, [listening])

  const color = { idle: 'var(--ink-soft)', listening: 'var(--red)', ok: 'var(--good)', almost: 'var(--accent)', bad: 'var(--red)' }[status]
  const icon  = { idle: '🎤', listening: '⏺', ok: '✓', almost: '≈', bad: '✗' }[status]
  const title = { idle: 'Проверить произношение', listening: 'Слушаю...', ok: `✓ Верно: «${transcript}»`, almost: `≈ Почти: «${transcript}»`, bad: `✗ Нечётко: «${transcript}»` }[status]

  return (
    <button onClick={start} title={title} disabled={listening}
      style={{
        background: 'none', border: 'none', cursor: listening ? 'default' : 'pointer',
        fontSize: 15, padding: '0 4px', color, flexShrink: 0, lineHeight: 1,
        transition: 'color .2s',
      }}>
      {icon}
    </button>
  )
}
