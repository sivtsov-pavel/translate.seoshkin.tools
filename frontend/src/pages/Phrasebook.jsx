import { useState, useEffect } from 'react'
import { api } from '../api/client.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

const CATEGORIES = [
  'Приветствия', 'Прощание', 'Знакомство', 'В школе', 'Числа и время',
  'Покупки', 'Транспорт', 'Семья', 'Еда', 'Разное',
]

export default function Phrasebook() {
  const [phrases, setPhrases]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all')   // 'all' | 'learned' | 'new'
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const [newDe, setNewDe]           = useState('')
  const [newRu, setNewRu]           = useState('')
  const [newCat, setNewCat]         = useState('')
  const [adding, setAdding]         = useState(false)

  useEffect(() => {
    api.get('/phrasebook').then(data => { setPhrases(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const toggleLearned = async (id) => {
    const res = await api.patch(`/phrasebook/${id}/learned`, {})
    setPhrases(prev => prev.map(p => p.id === id ? { ...p, learned: res.learned } : p))
  }

  const deletePhrase = async (id) => {
    await api.delete(`/phrasebook/${id}`)
    setPhrases(prev => prev.filter(p => p.id !== id))
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

  // фильтрация
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

  // группировка по категории
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
          <input value={newDe} onChange={e => setNewDe(e.target.value)}
            placeholder="Немецкая фраза..."
            style={{ fontSize: 15 }} autoFocus
          />
          <input value={newRu} onChange={e => setNewRu(e.target.value)}
            placeholder="Перевод на русский..."
            style={{ fontSize: 15 }}
          />
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
            <button onClick={() => setShowAdd(false)}
              style={{ padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Статус */}
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

        {/* Категория */}
        {cats.length > 0 && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
            <option value="">Все категории</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* Поиск */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Поиск..."
          style={{ flex: 1, minWidth: 140, fontSize: 14, padding: '6px 12px', borderRadius: 8 }}
        />
      </div>

      {/* Пустое состояние */}
      {phrases.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>💬</p>
          <p style={{ margin: '0 0 8px', fontSize: 16 }}>Разговорник пуст</p>
          <p style={{ margin: 0, fontSize: 13 }}>Добавляй фразы вручную или сохраняй из упражнений кнопкой 📖</p>
        </div>
      )}

      {/* Список по категориям */}
      {sortedCats.map(cat => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 8 }}>
            {cat} <span style={{ fontWeight: 400 }}>({grouped[cat].length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped[cat].map(p => (
              <PhraseCard key={p.id} phrase={p} onToggle={toggleLearned} onDelete={deletePhrase} />
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

function PhraseCard({ phrase, onToggle, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      border: '1px solid var(--line)', borderRadius: 12,
      padding: '12px 14px', background: 'var(--surface)',
      opacity: phrase.learned ? 0.65 : 1,
      transition: 'opacity .2s',
    }}>
      {/* Кнопка выучил */}
      <button onClick={() => onToggle(phrase.id)} title={phrase.learned ? 'Снять отметку' : 'Отметить как выученное'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
        {phrase.learned ? '✅' : '⬜'}
      </button>

      {/* Текст */}
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

      {/* Удалить */}
      <button onClick={() => onDelete(phrase.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, flexShrink: 0, padding: '0 4px' }}>
        ×
      </button>
    </div>
  )
}
