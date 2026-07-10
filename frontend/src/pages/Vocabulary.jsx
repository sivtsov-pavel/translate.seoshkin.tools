import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton, speak } from '../hooks/useSpeech.jsx'
import ProgressRing from '../components/ProgressRing.jsx'

const shortLesson = (title, noLesson) => title?.match(/Урок\s*\d+/)?.[0] || title || noLesson

function detectGrammar(word_de) {
  const w = (word_de || '').trim()
  if (/^der\s/i.test(w)) return 'der'
  if (/^die\s/i.test(w)) return 'die'
  if (/^das\s/i.test(w)) return 'das'
  if (w[0] >= 'A' && w[0] <= 'Z') return 'Nomen'
  if (/(?:en|eln|ern)$/.test(w)) return 'Verb'
  return 'Anderes'
}

const getGrammarLabels = (t) => ({
  'der': t.vocabulary.grammarDer,
  'die': t.vocabulary.grammarDie,
  'das': t.vocabulary.grammarDas,
  'Nomen': t.vocabulary.grammarNomen,
  'Verb': t.vocabulary.grammarVerb,
  'Anderes': t.vocabulary.grammarOther,
})

const STATUS_COLORS = { new: 'var(--ink-soft)', learning: '#B07D1B', known: 'var(--good)' }
const STATUS_BG     = {
  new:      'var(--surface)',
  learning: 'rgba(176,125,27,0.08)',
  known:    'rgba(78,154,110,0.08)',
}

export default function Vocabulary() {
  const location = useLocation()
  const [words, setWords]         = useState([])
  const [view, setView] = useState('words') // 'words' | 'alphabet'
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
    if (!sentences.length) { alert(t.vocabulary.noExamples); return }
    const title = lessonFilter || (statusFilter ? filterLabels[statusFilter] : t.vocabulary.title) + ' — примеры'
    setSending(true)
    try {
      await api.post('/phrase-sets', { title, content: sentences.join('\n') })
      alert(`${t.vocabulary.sendToReader}: "${title}" (${sentences.length})`)
    } catch (e) {
      alert(t.common.error + ': ' + e.message)
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

  const GRAMMAR_LABELS = getGrammarLabels(t)
  const lessonTitles = [...new Set(words.map(w => w.lesson_title || t.vocabulary.noLesson))]
  const q = search.toLowerCase().trim()
  const knownCount = words.filter(w => w.status === 'known').length
  const vocabPct   = words.length > 0 ? Math.round((knownCount / words.length) * 100) : 0

  const filtered = words.filter(w => {
    if (statusFilter && w.status !== statusFilter) return false
    if (lessonFilter && (w.lesson_title || t.vocabulary.noLesson) !== lessonFilter) return false
    if (grammarFilter && detectGrammar(w.word_de) !== grammarFilter) return false
    if (q) return w.word_de.toLowerCase().includes(q) || w.translation_ru.toLowerCase().includes(q)
    return true
  })
  const grammarCats = [...new Set(words.map(w => detectGrammar(w.word_de)))].sort()
  const grouped = filtered.reduce((acc, w) => {
    const key = w.lesson_title || t.vocabulary.noLesson
    if (!acc[key]) acc[key] = []
    acc[key].push(w)
    return acc
  }, {})

  if (loading) return <p style={{ padding: 20, color: 'var(--ink-soft)' }}>{t.vocabulary.loading}</p>

  return (
    <div style={{ paddingBottom: 12 }}>
      {words.length > 0 && view === 'words' && (
        <div className="hide-mobile">
          <ProgressRing pct={vocabPct} done={knownCount} total={words.length} label="Словарь" />
        </div>
      )}
      <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontFamily: 'Georgia,serif', fontSize: 24 }}>{t.vocabulary.title}</h1>
        {/* Переключатель вид */}
        <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
          {[{ id: 'words', label: '📚 Слова' }, { id: 'alphabet', label: '🔤 Алфавит' }].map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: view === tab.id ? 700 : 400, cursor: 'pointer',
                border: 'none', background: view === tab.id ? 'var(--accent)' : 'var(--surface-2)',
                color: view === tab.id ? 'var(--accent-ink)' : 'var(--ink)',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
        {view === 'words' && (
          <button onClick={sendToReader} disabled={sending}
            style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {sending ? '...' : '📖 В Читалку'}
          </button>
        )}
      </div>

      {view === 'alphabet' && <GermanAlphabet />}

      {view === 'words' && <div style={{ padding: '0 14px' }}>
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
              📚 {shortLesson(lt, t.vocabulary.noLesson)}
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
      </div>}
    </div>
  )
}

// ── Немецкий алфавит ─────────────────────────────────────────────────────────

const DE_ALPHABET = [
  { letter: 'A', ipa: '[aː]',         ru: 'аа',        word: 'Apfel',      wordRu: 'яблоко' },
  { letter: 'B', ipa: '[beː]',        ru: 'бэ',        word: 'Brief',      wordRu: 'письмо' },
  { letter: 'C', ipa: '[tseː]',       ru: 'цэ',        word: 'Computer',   wordRu: 'компьютер' },
  { letter: 'D', ipa: '[deː]',        ru: 'дэ',        word: 'Deutsch',    wordRu: 'немецкий' },
  { letter: 'E', ipa: '[eː]',         ru: 'э',         word: 'Essen',      wordRu: 'еда' },
  { letter: 'F', ipa: '[ɛf]',         ru: 'эф',        word: 'Fisch',      wordRu: 'рыба' },
  { letter: 'G', ipa: '[ɡeː]',        ru: 'гэ',        word: 'Garten',     wordRu: 'сад' },
  { letter: 'H', ipa: '[haː]',        ru: 'хаа',       word: 'Haus',       wordRu: 'дом' },
  { letter: 'I', ipa: '[iː]',         ru: 'ии',        word: 'Insel',      wordRu: 'остров' },
  { letter: 'J', ipa: '[jɔt]',        ru: 'йот',       word: 'Jahr',       wordRu: 'год' },
  { letter: 'K', ipa: '[kaː]',        ru: 'каа',       word: 'Kind',       wordRu: 'ребёнок' },
  { letter: 'L', ipa: '[ɛl]',         ru: 'эль',       word: 'Licht',      wordRu: 'свет' },
  { letter: 'M', ipa: '[ɛm]',         ru: 'эм',        word: 'Mutter',     wordRu: 'мать' },
  { letter: 'N', ipa: '[ɛn]',         ru: 'эн',        word: 'Nacht',      wordRu: 'ночь' },
  { letter: 'O', ipa: '[oː]',         ru: 'оо',        word: 'Ohr',        wordRu: 'ухо' },
  { letter: 'P', ipa: '[peː]',        ru: 'пэ',        word: 'Pause',      wordRu: 'пауза' },
  { letter: 'Q', ipa: '[kuː]',        ru: 'куу',       word: 'Quelle',     wordRu: 'источник' },
  { letter: 'R', ipa: '[ɛʁ]',         ru: 'эр',        word: 'Rot',        wordRu: 'красный' },
  { letter: 'S', ipa: '[ɛs]',         ru: 'эс',        word: 'Sonne',      wordRu: 'солнце' },
  { letter: 'T', ipa: '[teː]',        ru: 'тэ',        word: 'Tisch',      wordRu: 'стол' },
  { letter: 'U', ipa: '[uː]',         ru: 'уу',        word: 'Uhr',        wordRu: 'часы' },
  { letter: 'V', ipa: '[faʊ̯]',        ru: 'фау',       word: 'Vogel',      wordRu: 'птица' },
  { letter: 'W', ipa: '[veː]',        ru: 'вэ',        word: 'Wasser',     wordRu: 'вода' },
  { letter: 'X', ipa: '[ɪks]',        ru: 'икс',       word: 'Xylophon',   wordRu: 'ксилофон' },
  { letter: 'Y', ipa: '[ˈʏpsilɔn]',   ru: 'юпсилон',   word: 'Yoga',       wordRu: 'йога' },
  { letter: 'Z', ipa: '[tsɛt]',       ru: 'цэт',       word: 'Zeit',       wordRu: 'время' },
  { letter: 'Ä', ipa: '[ɛː]',         ru: 'э-умлаут',  word: 'Äpfel',      wordRu: 'яблоки', umlaut: true },
  { letter: 'Ö', ipa: '[øː]',         ru: 'о-умлаут',  word: 'Öl',         wordRu: 'масло',  umlaut: true },
  { letter: 'Ü', ipa: '[yː]',         ru: 'у-умлаут',  word: 'Über',       wordRu: 'над/через', umlaut: true },
  { letter: 'ß', ipa: '[ɛsˈtsɛt]',    ru: 'эс-цэт',    word: 'Straße',     wordRu: 'улица',  umlaut: true },
]

function GermanAlphabet() {
  const [active, setActive] = useState(null)

  return (
    <div style={{ padding: '0 14px 20px' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 16px' }}>
        Немецкий алфавит — 26 букв + умлауты Ä Ö Ü и лигатура ß.
        Нажми на карточку чтобы услышать произношение названия буквы.
      </p>

      {/* Основные буквы */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        Основные буквы (A–Z)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 20 }}>
        {DE_ALPHABET.filter(l => !l.umlaut).map(item => (
          <LetterCard key={item.letter} item={item} active={active === item.letter} onToggle={setActive} />
        ))}
      </div>

      {/* Умлауты */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        Умлауты и особые символы
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 20 }}>
        {DE_ALPHABET.filter(l => l.umlaut).map(item => (
          <LetterCard key={item.letter} item={item} active={active === item.letter} onToggle={setActive} />
        ))}
      </div>

      {/* Подсказка по звукам */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>💡 Особенности немецкого произношения</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, color: 'var(--ink)', lineHeight: 1.6 }}>
          {[
            ['ch', 'После а, о, у, au — [х] как в «лох», иначе — мягкий [хь]'],
            ['sch', '[ш] — Schule, Schüler'],
            ['ei', '[ай] — mein, Stein, drei'],
            ['ie', '[ии] — lieben, Bier, viel'],
            ['eu / äu', '[ой] — neu, Häuser'],
            ['ck', '[кк] — backen, Ecke'],
            ['pf', '[пф] — Pferd, Apfel'],
            ['qu', '[кв] — Quelle, quer'],
            ['sp / st (в начале)', '[шп] / [шт] — Sport, Stadt'],
            ['tion', '[цьон] — Nation, Situation'],
            ['v', 'Чаще [ф] — Vogel, viel, vier'],
            ['w', 'Всегда [в] — Wasser, Winter'],
            ['z', 'Всегда [ц] — Zeit, Zug'],
            ['ß', '[с] — острая с — Straße, Fuß'],
          ].map(([rule, hint]) => (
            <div key={rule} style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 60, fontFamily: 'monospace' }}>{rule}</span>
              <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LetterCard({ item, active, onToggle }) {
  const handleClick = () => {
    onToggle(active ? null : item.letter)
    speak(item.letter, 'de-DE')
  }

  return (
    <button onClick={handleClick}
      style={{
        border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 12,
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        cursor: 'pointer',
        padding: '10px 6px',
        textAlign: 'center',
        transition: 'border-color .15s, background .15s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}>
      {/* Буква */}
      <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: active ? 'var(--accent)' : 'var(--ink)', fontFamily: 'Georgia, serif' }}>
        {item.letter}
      </span>
      {/* Строчная */}
      <span style={{ fontSize: 16, color: 'var(--ink-soft)', lineHeight: 1 }}>
        {item.letter.toLowerCase()}
      </span>
      {/* IPA */}
      <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace', marginTop: 2 }}>
        {item.ipa}
      </span>
      {/* Как читается по-русски */}
      <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
        «{item.ru}»
      </span>
      {/* Пример слова */}
      {active && (
        <div style={{ marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6, width: '100%' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{item.word}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{item.wordRu}</div>
        </div>
      )}
    </button>
  )
}

function VocabWord({ word, statusLabels, onStatusChange }) {
  const [imageUrl, setImageUrl]         = useState(word.image_url)
  const [refreshing, setRefreshing]     = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [editing, setEditing]           = useState(false)
  const [editValue, setEditValue]       = useState(word.translation_ru)
  const [translation, setTranslation]   = useState(word.translation_ru)
  const [saving, setSaving]             = useState(false)
  const fileRef                         = useRef(null)
  const editRef                         = useRef(null)
  const { user } = useAuthStore()
  const { t } = useI18nStore()

  const startEdit = () => {
    setEditValue(translation)
    setEditing(true)
    setTimeout(() => editRef.current?.focus(), 0)
  }

  const saveTranslation = async () => {
    const val = editValue.trim()
    if (!val || val === translation) { setEditing(false); return }
    setSaving(true)
    try {
      await api.patch(`/words/${word.id}`, { translation_ru: val })
      setTranslation(val)
      setEditing(false)
    } catch (err) {
      alert(err?.message || t.common.error)
    }
    setSaving(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveTranslation()
    if (e.key === 'Escape') setEditing(false)
  }

  const refreshImage = async (e) => {
    e.stopPropagation()
    setRefreshing(true)
    try {
      const res = await api.post(`/words/${word.id}/refresh-image`, {})
      setImageUrl(res.image_url)
    } catch (err) {
      alert(err?.message || 'Не удалось найти картинку')
    }
    setRefreshing(false)
  }

  const uploadImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadFiles(`/words/${word.id}/upload-image`, fd)
      setImageUrl(res.image_url)
    } catch {}
    setUploading(false)
    e.target.value = ''
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
          <div style={{
            width: 80, height: 80, borderRadius: 10, flexShrink: 0,
            background: 'var(--surface-2)', border: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)',
            textAlign: 'center', padding: 4, boxSizing: 'border-box',
            lineHeight: 1.2,
          }}>
            {word.word_de.replace(/^(der|die|das|ein|eine)\s+/i, '')}
          </div>
        )}
        {user?.role === 'owner' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={refreshImage} disabled={refreshing} title="Обновить картинку (Unsplash)"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: 0, lineHeight: 1 }}>
              {refreshing ? '⏳' : '🔄'}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Загрузить свою картинку"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: 0, lineHeight: 1 }}>
              {uploading ? '⏳' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadImage} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>{word.word_de}</span>
          <SpeakButton text={word.word_de} appendText={translation} />
          <span style={{ color: 'var(--ink-soft)' }}>—</span>
          {editing ? (
            <>
              <input
                ref={editRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ fontSize: 15, padding: '2px 8px', borderRadius: 6, width: 160 }}
              />
              <button onClick={saveTranslation} disabled={saving}
                style={{ padding: '2px 10px', borderRadius: 6, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {saving ? '…' : t.common.save}
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--surface-2)', color: 'var(--ink-soft)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: 13 }}>
                {t.common.cancel}
              </button>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--ink)', fontSize: 15 }}>{translation}</span>
              {user?.role === 'owner' && (
                <button onClick={startEdit} title="Редактировать перевод"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', padding: '0 2px', lineHeight: 1 }}>
                  ✏️
                </button>
              )}
            </>
          )}
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
