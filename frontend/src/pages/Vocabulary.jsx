import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import ProgressRing from '../components/ProgressRing.jsx'

const shortLesson = (title) => title?.match(/Урок\s*\d+/)?.[0] || title || 'Без урока'

function detectGrammar(word_de) {
  const w = (word_de || '').trim()
  if (/^der\s/i.test(w)) return 'der'
  if (/^die\s/i.test(w)) return 'die'
  if (/^das\s/i.test(w)) return 'das'
  if (w[0] >= 'A' && w[0] <= 'Z') return 'Nomen'
  if (/(?:en|eln|ern)$/.test(w)) return 'Verb'
  return 'Anderes'
}

const GRAMMAR_LABELS = {
  'der': 'der (муж.)',
  'die': 'die (жен.)',
  'das': 'das (ср.)',
  'Nomen': 'Существ.',
  'Verb': 'Глаголы',
  'Anderes': 'Прочие',
}

const STATUS_COLORS = { new: 'var(--ink-soft)', learning: '#B07D1B', known: 'var(--good)' }
const STATUS_BG     = {
  new:      'var(--surface)',
  learning: 'rgba(176,125,27,0.08)',
  known:    'rgba(78,154,110,0.08)',
}

export default function Vocabulary() {
  const location = useLocation()
  const [words, setWords]         = useState([])
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(location.search).get('status') || '')
  const [lessonFilter, setLessonFilter] = useState('')
  const [grammarFilter, setGrammarFilter] = useState('')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [sending, setSending]     = useState(false)
  const { t } = useI18nStore()

  useEffect(() => {
    const s = new URLSearchParams(location.search).get('status') || ''
    setStatusFilter(s)
    setGrammarFilter('')
  }, [location.search])

  const sendToReader = async () => {
    const sentences = filtered.map(w => w.example_sentence).filter(Boolean)
    if (!sentences.length) { alert('Нет примеров предложений у отфильтрованных слов'); return }
    const title = lessonFilter || (statusFilter ? filterLabels[statusFilter] : 'Словарь') + ' — примеры'
    setSending(true)
    try {
      await api.post('/phrase-sets', { title, content: sentences.join('\n') })
      alert(`Набор "${title}" сохранён в Читалке (${sentences.length} предложений)`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    }
    setSending(false)
  }

  useEffect(() => {
    setLoading(true)
    api.get('/words').then(setWords).finally(() => setLoading(false))
  }, [])

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

  const lessonTitles = [...new Set(words.map(w => w.lesson_title || 'Без урока'))]
  const q = search.toLowerCase().trim()
  const knownCount = words.filter(w => w.status === 'known').length
  const vocabPct   = words.length > 0 ? Math.round((knownCount / words.length) * 100) : 0

  const filtered = words.filter(w => {
    if (statusFilter && w.status !== statusFilter) return false
    if (lessonFilter && (w.lesson_title || 'Без урока') !== lessonFilter) return false
    if (grammarFilter && detectGrammar(w.word_de) !== grammarFilter) return false
    if (q) return w.word_de.toLowerCase().includes(q) || w.translation_ru.toLowerCase().includes(q)
    return true
  })
  const grammarCats = [...new Set(words.map(w => detectGrammar(w.word_de)))].sort()
  const grouped = filtered.reduce((acc, w) => {
    const key = w.lesson_title || 'Без урока'
    if (!acc[key]) acc[key] = []
    acc[key].push(w)
    return acc
  }, {})

  if (loading) return <p style={{ padding: 20, color: 'var(--ink-soft)' }}>{t.vocabulary.loading}</p>

  return (
    <div style={{ paddingBottom: 12 }}>
      {words.length > 0 && (
        <div className="hide-mobile">
          <ProgressRing pct={vocabPct} done={knownCount} total={words.length} label="Словарь" />
        </div>
      )}
      <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: 'Georgia,serif', fontSize: 24 }}>{t.vocabulary.title}</h1>
        <button onClick={sendToReader} disabled={sending}
          style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {sending ? '...' : '📖 В Читалку'}
        </button>
      </div>

      <div style={{ padding: '0 14px' }}>
      {/* Поиск */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по немецкому или переводу..."
          style={{ width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
        />
        {search
          ? <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)' }}>✕</button>
          : <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--ink-soft)' }}>🔍</span>
        }
      </div>

      {/* Фильтр по статусу */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {['', 'new', 'learning', 'known'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 16px', borderRadius: 20,
              border: `1px solid ${statusFilter === s ? 'var(--accent)' : 'var(--line)'}`,
              background: statusFilter === s ? 'var(--accent)' : 'var(--surface-2)',
              color: statusFilter === s ? 'var(--accent-ink)' : 'var(--ink)',
              cursor: 'pointer', fontSize: 14, fontWeight: statusFilter === s ? 600 : 400,
            }}>
            {filterLabels[s]}
          </button>
        ))}
      </div>

      {/* Фильтр по грамматике */}
      {grammarCats.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
          <button onClick={() => setGrammarFilter('')} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 13, flexShrink: 0,
            border: `1px solid ${grammarFilter === '' ? 'var(--accent)' : 'var(--line)'}`,
            background: grammarFilter === '' ? 'var(--accent-soft)' : 'var(--surface-2)',
            color: grammarFilter === '' ? 'var(--accent)' : 'var(--ink-soft)',
            fontWeight: grammarFilter === '' ? 700 : 400, cursor: 'pointer',
          }}>Все части речи</button>
          {grammarCats.map(cat => (
            <button key={cat} onClick={() => setGrammarFilter(cat)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 13, flexShrink: 0,
              border: `1px solid ${grammarFilter === cat ? 'var(--accent)' : 'var(--line)'}`,
              background: grammarFilter === cat ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: grammarFilter === cat ? 'var(--accent)' : 'var(--ink-soft)',
              fontWeight: grammarFilter === cat ? 700 : 400, cursor: 'pointer',
            }}>{GRAMMAR_LABELS[cat] || cat}</button>
          ))}
        </div>
      )}

      {/* Фильтр по уроку */}
      {lessonTitles.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setLessonFilter('')}
            style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 13,
              border: `1px solid ${lessonFilter === '' ? 'var(--accent)' : 'var(--line)'}`,
              background: lessonFilter === '' ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: lessonFilter === '' ? 'var(--accent)' : 'var(--ink-soft)',
              fontWeight: lessonFilter === '' ? 700 : 400, cursor: 'pointer',
            }}>
            Все уроки
          </button>
          {lessonTitles.map(lt => (
            <button key={lt} onClick={() => setLessonFilter(lt)}
              style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 13,
                border: `1px solid ${lessonFilter === lt ? 'var(--accent)' : 'var(--line)'}`,
                background: lessonFilter === lt ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: lessonFilter === lt ? 'var(--accent)' : 'var(--ink-soft)',
                fontWeight: lessonFilter === lt ? 700 : 400, cursor: 'pointer',
              }}>
              📚 {shortLesson(lt)}
            </button>
          ))}
        </div>
      )}

      <p style={{ color: 'var(--ink-soft)', marginBottom: 16, fontSize: 14 }}>{t.vocabulary.wordsCount(filtered.length)}</p>

      {Object.entries(grouped).map(([lessonTitle, lessonWords]) => (
        <div key={lessonTitle} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid var(--line)` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📚 {lessonTitle}
            </span>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{lessonWords.length} сл.</span>
          </div>

          {lessonWords.map(word => (
            <VocabWord key={word.id} word={word} statusLabels={statusLabels} onStatusChange={updateStatus} />
          ))}
        </div>
      ))}

      {words.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--ink-soft)' }}>
          <p style={{ fontSize: 40 }}>📚</p>
          <p>Слова появятся после обработки урока</p>
        </div>
      )}
      </div>
    </div>
  )
}

function VocabWord({ word, statusLabels, onStatusChange }) {
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
      display: 'flex', alignItems: 'flex-start', padding: '10px',
      borderBottom: '1px solid var(--line)', gap: 10, borderRadius: 10,
      marginBottom: 3, background: STATUS_BG[word.status] ?? 'var(--surface)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {imageUrl ? (
          <div style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0 }}>
            <img src={imageUrl} alt={word.word_de} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ width: 80, flexShrink: 0 }} />
        )}
        {user?.role === 'owner' && (
          <button onClick={refreshImage} disabled={refreshing} title="Обновить картинку"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: 0, lineHeight: 1 }}>
            {refreshing ? '⏳' : '🔄'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>{word.word_de}</span>
          <SpeakButton text={word.word_de} appendText={word.translation_ru} />
          <span style={{ color: 'var(--ink-soft)' }}>—</span>
          <span style={{ color: 'var(--ink)', fontSize: 15 }}>{word.translation_ru}</span>
        </div>
        {word.example_sentence && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{word.example_sentence}</span>
              <SpeakButton text={word.example_sentence} size={13} />
            </div>
            {word.example_sentence_ru && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, paddingLeft: 2 }}>
                {word.example_sentence_ru}
              </div>
            )}
          </div>
        )}
      </div>

      <select
        value={word.status}
        onChange={e => onStatusChange(word.id, e.target.value)}
        style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 12,
          border: `1px solid ${STATUS_COLORS[word.status]}`,
          color: STATUS_COLORS[word.status], fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
          background: 'var(--surface-2)',
        }}>
        <option value="new">{statusLabels.new}</option>
        <option value="learning">{statusLabels.learning}</option>
        <option value="known">{statusLabels.known}</option>
      </select>
    </div>
  )
}
