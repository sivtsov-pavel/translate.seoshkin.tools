import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

const STATUS_COLORS = { new: '#6b7280', learning: '#f59e0b', known: '#10b981' }
const STATUS_BG     = { new: '#fff', learning: '#fffdf0', known: '#f0fdf4' }

export default function Vocabulary() {
  const [words, setWords]   = useState([])
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
    setWords(ws => ws.map(w => w.id === updated.id ? { ...w, status: updated.status } : w))
  }

  const filterLabels = {
    '':       t.vocabulary.all,
    new:      t.vocabulary.new,
    learning: t.vocabulary.learning,
    known:    t.vocabulary.known,
  }
  const statusLabels = {
    new:      t.vocabulary.statusNew,
    learning: t.vocabulary.statusLearning,
    known:    t.vocabulary.statusKnown,
  }

  // Группируем по уроку
  const grouped = words.reduce((acc, w) => {
    const key = w.lesson_title || 'Без урока'
    if (!acc[key]) acc[key] = []
    acc[key].push(w)
    return acc
  }, {})

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

      <p style={{ color: '#6b7280', marginBottom: 20, fontSize: 14 }}>{t.vocabulary.wordsCount(words.length)}</p>

      {/* Сгруппировано по урокам */}
      {Object.entries(grouped).map(([lessonTitle, lessonWords]) => (
        <div key={lessonTitle} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #e5e7eb' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📚 {lessonTitle}
            </span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{lessonWords.length} сл.</span>
          </div>

          {lessonWords.map(word => (
            <div key={word.id} style={{
              display: 'flex', alignItems: 'flex-start', padding: '10px 10px',
              borderBottom: '1px solid #f3f4f6', gap: 10, borderRadius: 8,
              marginBottom: 3, backgroundColor: STATUS_BG[word.status] ?? '#fff',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 17 }}>{word.word_de}</span>
                  <SpeakButton text={word.word_de} />
                  <span style={{ color: '#9ca3af' }}>—</span>
                  <span style={{ color: '#374151', fontSize: 15 }}>{word.translation_ru}</span>
                </div>
                {word.example_sentence && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <span style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>{word.example_sentence}</span>
                    <SpeakButton text={word.example_sentence} size={13} />
                  </div>
                )}
              </div>
              <select
                value={word.status}
                onChange={e => updateStatus(word.id, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${STATUS_COLORS[word.status]}`,
                  color: STATUS_COLORS[word.status], fontWeight: 700, fontSize: 12,
                  cursor: 'pointer', backgroundColor: '#fff', flexShrink: 0,
                }}>
                <option value="new">{statusLabels.new}</option>
                <option value="learning">{statusLabels.learning}</option>
                <option value="known">{statusLabels.known}</option>
              </select>
            </div>
          ))}
        </div>
      ))}

      {words.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 60, color: '#9ca3af' }}>
          <p style={{ fontSize: 40 }}>📚</p>
          <p>Слова появятся после обработки урока</p>
        </div>
      )}
    </div>
  )
}
