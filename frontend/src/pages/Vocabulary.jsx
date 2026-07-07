import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

const STATUS_COLORS = { new: '#6b7280', learning: '#f59e0b', known: '#10b981' }

export default function Vocabulary() {
  const [words, setWords] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const { t } = useI18nStore()

  useEffect(() => {
    setLoading(true)
    const url = filter ? `/words?status=${filter}` : '/words'
    api.get(url).then(setWords).finally(() => setLoading(false))
  }, [filter])

  const updateStatus = async (wordId, status) => {
    const updated = await api.patch(`/words/${wordId}`, { status })
    setWords(ws => ws.map(w => w.id === updated.id ? updated : w))
  }

  const filterLabels = {
    '':        t.vocabulary.all,
    new:      t.vocabulary.new,
    learning: t.vocabulary.learning,
    known:    t.vocabulary.known,
  }

  const statusLabels = {
    new:      t.vocabulary.statusNew,
    learning: t.vocabulary.statusLearning,
    known:    t.vocabulary.statusKnown,
  }

  if (loading) return <p>{t.vocabulary.loading}</p>

  return (
    <div>
      <h1>{t.vocabulary.title}</h1>

      {/* Фильтры по статусу */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', 'new', 'learning', 'known'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: '1px solid #d1d5db',
              backgroundColor: filter === s ? '#4f46e5' : '#fff',
              color: filter === s ? '#fff' : '#374151',
              cursor: 'pointer', fontSize: 14, fontWeight: filter === s ? 600 : 400,
            }}>
            {filterLabels[s]}
          </button>
        ))}
      </div>

      <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>{t.vocabulary.wordsCount(words.length)}</p>

      <div>
        {words.map(word => (
          <div key={word.id} style={{ display: 'flex', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid #f3f4f6', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{word.word_de}</span>
              <span style={{ color: '#6b7280', marginLeft: 12, fontSize: 15 }}>{word.translation_ru}</span>
              {word.example_sentence && (
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 3, fontStyle: 'italic' }}>
                  {word.example_sentence}
                </div>
              )}
            </div>
            <select
              value={word.status}
              onChange={e => updateStatus(word.id, e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db',
                color: STATUS_COLORS[word.status], fontWeight: 600, fontSize: 13,
                cursor: 'pointer', backgroundColor: '#fff',
              }}>
              <option value="new">{statusLabels.new}</option>
              <option value="learning">{statusLabels.learning}</option>
              <option value="known">{statusLabels.known}</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
