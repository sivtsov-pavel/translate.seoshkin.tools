import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

const STATUS_COLORS = { new: '#6b7280', learning: '#f59e0b', known: '#10b981' }
const STATUS_BG     = { new: '#fff', learning: '#fffdf0', known: '#f0fdf4' }

export default function Vocabulary() {
  const [words, setWords]         = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [lessonFilter, setLessonFilter] = useState('')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const { t } = useI18nStore()

  useEffect(() => {
    setLoading(true)
    const url = statusFilter ? `/words?status=${statusFilter}` : '/words'
    api.get(url).then(setWords).finally(() => setLoading(false))
  }, [statusFilter])

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

  // Все уроки для фильтра
  const lessonTitles = [...new Set(words.map(w => w.lesson_title || 'Без урока'))]

  // Поиск + фильтр по уроку
  const q = search.toLowerCase().trim()
  const filtered = words.filter(w => {
    if (lessonFilter && (w.lesson_title || 'Без урока') !== lessonFilter) return false
    if (q) return w.word_de.toLowerCase().includes(q) || w.translation_ru.toLowerCase().includes(q)
    return true
  })
  const grouped = filtered.reduce((acc, w) => {
    const key = w.lesson_title || 'Без урока'
    if (!acc[key]) acc[key] = []
    acc[key].push(w)
    return acc
  }, {})

  if (loading) return <p>{t.vocabulary.loading}</p>

  return (
    <div>
      <h1>{t.vocabulary.title}</h1>

      {/* Живой поиск */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по немецкому или переводу..."
          style={{
            width: '100%', padding: '10px 36px 10px 14px', fontSize: 15,
            border: '1px solid #d1d5db', borderRadius: 10, boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        {search
          ? <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
          : <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: '#d1d5db' }}>🔍</span>
        }
      </div>

      {/* Фильтр по статусу */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {['', 'new', 'learning', 'known'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: '1px solid #d1d5db',
              backgroundColor: statusFilter === s ? '#4f46e5' : '#fff',
              color: statusFilter === s ? '#fff' : '#374151',
              cursor: 'pointer', fontSize: 14, fontWeight: statusFilter === s ? 600 : 400,
            }}>
            {filterLabels[s]}
          </button>
        ))}
      </div>

      {/* Фильтр по уроку */}
      {lessonTitles.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setLessonFilter('')}
            style={{
              padding: '4px 12px', borderRadius: 16, border: '1px solid #d1d5db', fontSize: 13,
              backgroundColor: lessonFilter === '' ? '#e0e7ff' : '#f9fafb',
              color: lessonFilter === '' ? '#4338ca' : '#6b7280',
              fontWeight: lessonFilter === '' ? 700 : 400, cursor: 'pointer',
            }}>
            Все уроки
          </button>
          {lessonTitles.map(lt => (
            <button key={lt} onClick={() => setLessonFilter(lt)}
              style={{
                padding: '4px 12px', borderRadius: 16, border: '1px solid #d1d5db', fontSize: 13,
                backgroundColor: lessonFilter === lt ? '#e0e7ff' : '#f9fafb',
                color: lessonFilter === lt ? '#4338ca' : '#6b7280',
                fontWeight: lessonFilter === lt ? 700 : 400, cursor: 'pointer',
              }}>
              📚 {lt}
            </button>
          ))}
        </div>
      )}

      <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>{t.vocabulary.wordsCount(filtered.length)}</p>

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
            <VocabWord key={word.id} word={word} statusLabels={statusLabels} onStatusChange={updateStatus} />
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

function VocabWord({ word, statusLabels, onStatusChange }) {
  const [showImg, setShowImg]     = useState(false)
  const [imageUrl, setImageUrl]   = useState(word.image_url)
  const [refreshing, setRefreshing] = useState(false)
  const { user } = useAuthStore()

  const refreshImage = async (e) => {
    e.stopPropagation()
    setRefreshing(true)
    try {
      const res = await api.post(`/words/${word.id}/refresh-image`, {})
      setImageUrl(res.image_url)
    } catch {}
    setRefreshing(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', padding: '10px 10px',
      borderBottom: '1px solid #f3f4f6', gap: 10, borderRadius: 8,
      marginBottom: 3, backgroundColor: STATUS_BG[word.status] ?? '#fff',
    }}>
      {/* Миниатюра картинки */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {imageUrl ? (
          <div
            onClick={() => setShowImg(v => !v)}
            title="Показать/скрыть картинку"
            style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: '#f3f4f6', cursor: 'pointer' }}
          >
            {showImg
              ? <img src={imageUrl} alt={word.word_de} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🖼️</div>
            }
          </div>
        ) : (
          <div style={{ width: 40, height: 40 }} />
        )}
        {user?.role === 'owner' && (
          <button onClick={refreshImage} disabled={refreshing} title="Обновить картинку"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#9ca3af', padding: 0, lineHeight: 1 }}>
            {refreshing ? '⏳' : '🔄'}
          </button>
        )}
      </div>

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
        onChange={e => onStatusChange(word.id, e.target.value)}
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
  )
}
