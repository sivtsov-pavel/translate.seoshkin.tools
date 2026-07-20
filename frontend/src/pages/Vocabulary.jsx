import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { isOnline, getOfflineWords } from '../offline/store.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton, speak } from '../hooks/useSpeech.jsx'
import { cardUrl, shareLink } from '../utils/share.js'

// Название изучаемого языка — для плейсхолдера поиска (какой словарь)
const TARGET_LANG_NAME = { de: 'немецкий', es: 'испанский', fr: 'французский', it: 'итальянский', en: 'английский', pt: 'португальский' }

const shortLesson = (title, noLesson) => title?.match(/Урок\s*\d+/)?.[0] || title || noLesson

// Мобильный брейкпоинт (≤640px) — адаптация только для мобилки, на ПК всё как было
function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = e => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

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

const SELECT_STYLE = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13,
  cursor: 'pointer', minWidth: 0, maxWidth: '100%',
}

export default function Vocabulary() {
  const location = useLocation()
  const [words, setWords]       = useState([])
  const [view, setView]         = useState('words')
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(location.search).get('status') || '')
  const [courseFilter, setCourseFilter] = useState(() => localStorage.getItem('vocab_course') || '')
  const [lessonFilter, setLessonFilter] = useState('')
  const [scanFilter, setScanFilter] = useState('') // media_id скана внутри урока
  const [letterFilter, setLetterFilter] = useState('') // первая буква слова
  const [grammarFilter, setGrammarFilter] = useState('')
  const [noImageFilter, setNoImageFilter] = useState(false) // админ: только слова без картинки
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [creatingSet, setCreatingSet] = useState(false)
  // Учитель: чекбоксы — вручную выбрать слова для набора (не по фильтру)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const clearSelection = () => setSelectedIds(new Set())
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => {
    const s = new URLSearchParams(location.search).get('status') || ''
    setStatusFilter(s)
    setGrammarFilter('')
  }, [location.search])

  useEffect(() => {
    setLoading(true)
    // Без сети — словарь из локальной базы (офлайн-ядро)
    const load = isOnline() ? api.get('/words').catch(() => getOfflineWords()) : getOfflineWords()
    load.then(ws => setWords(ws || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const updateStatus = async (wordId, status) => {
    const updated = await api.patch(`/words/${wordId}`, { status })
    setWords(ws => ws.map(w => w.id === updated.id ? { ...w, status: updated.status } : w))
  }

  const sendToReader = async () => {
    const sentences = filtered.map(w => w.example_sentence).filter(Boolean)
    if (!sentences.length) { alert(t.vocabulary.noExamples); return }
    const title = lessonFilter || (statusFilter ? filterLabels[statusFilter] : t.vocabulary.title) + ' — примеры'
    setSending(true)
    try {
      await api.post('/phrase-sets', { title, content: sentences.join('\n') })
      alert(`${t.vocabulary.sendToReader}: "${title}" (${sentences.length})`)
    } catch (e) { alert(t.common.error + ': ' + e.message) }
    setSending(false)
  }

  const filterLabels = { '': t.vocabulary.all, new: t.vocabulary.new, learning: t.vocabulary.learning, known: t.vocabulary.known }
  const statusLabels = { new: t.vocabulary.statusNew, learning: t.vocabulary.statusLearning, known: t.vocabulary.statusKnown }
  const GRAMMAR_LABELS = getGrammarLabels(t)

  const courseTitles = [...new Set(words.map(w => w.course_title).filter(Boolean))].sort()
  const lessonTitles = [...new Set(
    words
      .filter(w => !courseFilter || w.course_title === courseFilter)
      .map(w => w.lesson_title || t.vocabulary.noLesson)
  )]
  const grammarCats  = [...new Set(words.map(w => detectGrammar(w.word_de)))].sort()

  const q = search.toLowerCase().trim()
  const knownCount = words.filter(w => w.status === 'known').length
  const vocabPct   = words.length > 0 ? Math.round((knownCount / words.length) * 100) : 0

  // Запоминаем выбранный курс между визитами
  useEffect(() => { localStorage.setItem('vocab_course', courseFilter) }, [courseFilter])
  // При смене урока/курса сбрасываем выбранный скан
  useEffect(() => { setScanFilter('') }, [lessonFilter, courseFilter])

  // Сканы (страницы учебника) внутри выбранного урока — фильтр «слова именно с этой страницы».
  // Показываем, только когда выбран урок и у слов есть привязка к ≥2 разным сканам.
  const scanIds = lessonFilter
    ? [...new Set(words
        .filter(w => (!courseFilter || w.course_title === courseFilter) &&
                     (w.lesson_title || t.vocabulary.noLesson) === lessonFilter)
        .map(w => w.media_id).filter(Boolean))].sort((a, b) => a - b)
    : []
  const scanNo = Object.fromEntries(scanIds.map((id, i) => [id, i + 1]))

  // Первая буква слова (без артикля) — для фильтра по алфавиту
  const firstLetter = w => (w.word_de || '').replace(/^(der|die|das|ein|eine)\s+/i, '').trim().charAt(0).toUpperCase()
  const letters = [...new Set(words
    .filter(w => (!courseFilter || w.course_title === courseFilter) &&
                 (!lessonFilter || (w.lesson_title || t.vocabulary.noLesson) === lessonFilter))
    .map(firstLetter).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))

  // Счётчики по статусам (для чипов)
  const statusCounts = {
    '':       words.length,
    new:      words.filter(w => w.status === 'new').length,
    learning: words.filter(w => w.status === 'learning').length,
    known:    knownCount,
  }
  // Счётчики по частям речи в текущем разрезе курс/урок (пустые скроем)
  const posBase = words.filter(w =>
    (!courseFilter || w.course_title === courseFilter) &&
    (!lessonFilter || (w.lesson_title || t.vocabulary.noLesson) === lessonFilter)
  )
  const posCounts = grammarCats.reduce((acc, c) => {
    acc[c] = posBase.filter(w => detectGrammar(w.word_de) === c).length
    return acc
  }, {})
  const visiblePos = grammarCats.filter(c => posCounts[c] > 0)

  const filtered = words.filter(w => {
    if (noImageFilter && w.image_url) return false
    if (statusFilter  && w.status !== statusFilter) return false
    if (courseFilter  && w.course_title !== courseFilter) return false
    if (lessonFilter  && (w.lesson_title || t.vocabulary.noLesson) !== lessonFilter) return false
    if (grammarFilter && detectGrammar(w.word_de) !== grammarFilter) return false
    if (scanFilter && w.media_id !== scanFilter) return false
    if (letterFilter && firstLetter(w) !== letterFilter) return false
    if (q) return w.word_de.toLowerCase().includes(q) || w.translation_ru.toLowerCase().includes(q)
    return true
  })

  const grouped = filtered.reduce((acc, w) => {
    const key = w.lesson_title || t.vocabulary.noLesson
    if (!acc[key]) acc[key] = []
    acc[key].push(w)
    return acc
  }, {})

  // «Свои упражнения»: собрать набор из ВЫБРАННЫХ галочками слов, а если ничего не выбрано —
  // из всех отфильтрованных (старое поведение).
  const createSet = async () => {
    const ids = selectedIds.size ? [...selectedIds] : filtered.map(w => w.id)
    if (!ids.length) { alert('Выберите слова галочками или задайте фильтр'); return }
    const hint = selectedIds.size ? 'Мой набор' : (lessonFilter || (statusFilter ? filterLabels[statusFilter] : 'Мой набор'))
    const title = window.prompt(`Свой набор упражнений из ${ids.length} слов. Название:`, `✏️ ${hint}`.trim())
    if (title === null) return
    setCreatingSet(true)
    try {
      const res = await api.post('/lessons/custom', { title: title || undefined, word_ids: ids })
      const poll = setInterval(async () => {
        try {
          const st = await api.get(`/lessons/${res.lessonId}/status`)
          if (st.status !== 'processing') {
            clearInterval(poll); setCreatingSet(false); clearSelection()
            if (st.status === 'done') navigate(`/exercise-session?lesson_id=${res.lessonId}`)
            else alert('Не удалось собрать набор: ' + (st.progress || ''))
          }
        } catch {}
      }, 2500)
    } catch (e) { setCreatingSet(false); alert('Ошибка: ' + e.message) }
  }

  // Админ: сколько слов вообще без картинки (для круглой кнопки-фильтра)
  const noImageCount = words.filter(w => !w.image_url).length

  // Счётчик активных фильтров для бейджа
  const activeFilters = [statusFilter, courseFilter, lessonFilter, grammarFilter, scanFilter, letterFilter, noImageFilter].filter(Boolean).length
  // «Продвинутые» фильтры (курс/урок/часть речи) — на мобиле прячутся за шестерёнку
  const advancedCount  = [courseFilter, lessonFilter, grammarFilter].filter(Boolean).length
  const advancedActive = advancedCount > 0

  const resetFilters = () => { setStatusFilter(''); setCourseFilter(''); setLessonFilter(''); setGrammarFilter(''); setScanFilter(''); setLetterFilter(''); setNoImageFilter(false) }

  // Стиль чипа-фильтра («капелька»)
  const chipStyle = (active, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
    whiteSpace: 'nowrap', lineHeight: 1.2,
    border: `1.5px solid ${active ? (color || 'var(--accent)') : 'var(--line)'}`,
    background: active ? (color ? color + '22' : 'var(--accent-soft)') : 'var(--surface-2)',
    color: active ? (color || 'var(--accent)') : 'var(--ink)',
    fontWeight: active ? 700 : 500,
  })
  const FILTER_LABEL = { fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', minWidth: 52, flexShrink: 0 }
  const chipCount = (n) => <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{n}</span>

  if (loading) return <p style={{ padding: 20, color: 'var(--ink-soft)' }}>{t.vocabulary.loading}</p>

  return (
    <div style={{ paddingTop: 8, paddingBottom: 40 }}>
      {/* Заголовок + вкладки */}
      <div style={{ padding: '0 14px 8px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, flex: '0 0 auto' }}>{t.vocabulary.title}</h1>
        <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', flex: '0 0 auto' }}>
          {[
            { id: 'words',    emoji: '📚', label: 'Слова', count: words.length },
            { id: 'alphabet', emoji: '🔤', label: 'Алфавит' },
            { id: 'numbers',  emoji: '🔢', label: 'Цифры' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', fontSize: 13, fontWeight: view === tab.id ? 700 : 500, cursor: 'pointer',
                border: 'none', background: view === tab.id ? 'var(--accent)' : 'var(--surface-2)',
                color: view === tab.id ? 'var(--accent-ink)' : 'var(--ink)',
                whiteSpace: 'nowrap',
              }}>
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {tab.count != null && (
                <span style={{ fontSize: 11, opacity: 0.75 }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
        {view === 'words' && (
          <button onClick={sendToReader} disabled={sending}
            style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--accent)', fontWeight: 600, fontSize: 13, cursor: 'pointer', flex: '0 0 auto' }}>
            {sending ? '...' : '📖'}
          </button>
        )}
        {view === 'words' && user?.role === 'owner' && (
          <button onClick={createSet} disabled={creatingSet}
            title={selectedIds.size ? `Собрать набор из ${selectedIds.size} выбранных слов` : 'Собрать набор из отфильтрованных слов (или отметь галочками нужные)'}
            style={{ padding: '7px 12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
            {creatingSet ? '⏳ Собираю...' : (selectedIds.size ? `✏️ Набор (${selectedIds.size})` : '✏️ Набор')}
          </button>
        )}
        {view === 'words' && user?.role === 'owner' && selectedIds.size > 0 && (
          <button onClick={clearSelection} title="Снять выделение со всех слов"
            style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13, cursor: 'pointer', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
            ✕ Очистить
          </button>
        )}
        {/* Админ: круглая кнопка-тумблер «показать слова без картинки» + счётчик */}
        {view === 'words' && user?.role === 'owner' && noImageCount > 0 && (
          <button onClick={() => setNoImageFilter(v => !v)}
            title={`Слова без картинки: ${noImageCount}`}
            style={{
              position: 'relative', width: 36, height: 36, borderRadius: '50%', flex: '0 0 auto',
              border: `1.5px solid ${noImageFilter ? 'var(--accent)' : 'var(--line)'}`,
              background: noImageFilter ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: noImageFilter ? 'var(--accent)' : 'var(--ink-soft)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <i className="bi bi-image" style={{ fontSize: 15, lineHeight: 1 }} />
            {/* Диагональная черта — «картинка перечёркнута» */}
            <span style={{
              position: 'absolute', left: 6, right: 6, top: '50%', height: 2, borderRadius: 2,
              background: 'currentColor', transform: 'rotate(-45deg)', pointerEvents: 'none',
            }} />
            {/* Бейдж-счётчик слов без картинки */}
            <span style={{
              position: 'absolute', top: -6, right: -8, minWidth: 16, height: 16, padding: '0 4px',
              borderRadius: 999, background: noImageFilter ? 'var(--accent)' : 'var(--ink-soft)',
              color: 'var(--surface)', fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              boxSizing: 'border-box',
            }}>
              {noImageCount}
            </span>
          </button>
        )}
      </div>

      {/* Прогресс-полоска */}
      {words.length > 0 && view === 'words' && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
            <span>{t.vocabulary.title}</span>
            <span>{knownCount} / {words.length} · {vocabPct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vocabPct}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {view === 'alphabet' && <GermanAlphabet />}
      {view === 'numbers' && <GermanNumbers />}

      {view === 'words' && <div style={{ padding: '0 14px' }}>

        {/* Поиск + шестерёнка фильтров (шестерёнка только на мобиле) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Поиск: слово (${TARGET_LANG_NAME[localStorage.getItem('target_lang') || 'de'] || 'изучаемый язык'}) или перевод…`}
              style={{ width: '100%', paddingRight: 34, boxSizing: 'border-box' }}
            />
            {search
              ? <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--ink-soft)' }}>✕</button>
              : <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--ink-soft)' }}>🔍</span>
            }
          </div>
          {isMobile && (
            <button onClick={() => setFiltersOpen(v => !v)} title="Фильтры: курс, урок, часть речи"
              style={{
                padding: '0 13px', borderRadius: 8, flexShrink: 0,
                border: `1.5px solid ${filtersOpen || advancedActive ? 'var(--accent)' : 'var(--line)'}`,
                background: filtersOpen ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: filtersOpen || advancedActive ? 'var(--accent)' : 'var(--ink)',
                fontSize: 16, cursor: 'pointer',
              }}>
              ⚙️{advancedActive ? ` ${advancedCount}` : ''}
            </button>
          )}
        </div>

        {/* Статус — чипы, всегда под рукой (пустые скрыты) */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <span style={FILTER_LABEL}>Статус</span>
          <button style={chipStyle(statusFilter === '')} onClick={() => setStatusFilter('')}>
            {t.vocabulary.all} <span style={{ opacity: 0.6 }}>({words.length})</span>
          </button>
          {statusCounts.new > 0 && (
            <button style={chipStyle(statusFilter === 'new', STATUS_COLORS.new)} onClick={() => setStatusFilter(statusFilter === 'new' ? '' : 'new')}>
              {t.vocabulary.new} <span style={{ opacity: 0.6 }}>({statusCounts.new})</span>
            </button>
          )}
          {statusCounts.learning > 0 && (
            <button style={chipStyle(statusFilter === 'learning', STATUS_COLORS.learning)} onClick={() => setStatusFilter(statusFilter === 'learning' ? '' : 'learning')}>
              {t.vocabulary.learning} <span style={{ opacity: 0.6 }}>({statusCounts.learning})</span>
            </button>
          )}
          {statusCounts.known > 0 && (
            <button style={chipStyle(statusFilter === 'known', STATUS_COLORS.known)} onClick={() => setStatusFilter(statusFilter === 'known' ? '' : 'known')}>
              {t.vocabulary.known} <span style={{ opacity: 0.6 }}>({statusCounts.known})</span>
            </button>
          )}
        </div>

        {/* Курс + урок — на ПК всегда, на мобиле по шестерёнке */}
        {(!isMobile || filtersOpen) && (courseTitles.length > 0 || lessonTitles.length > 1) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={FILTER_LABEL}>Курс</span>
            {courseTitles.length > 0 && (
              <select value={courseFilter} onChange={e => { setCourseFilter(e.target.value); setLessonFilter('') }} style={SELECT_STYLE}>
                <option value="">Все курсы</option>
                {courseTitles.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            )}
            {lessonTitles.length > 1 && (
              <select value={lessonFilter} onChange={e => setLessonFilter(e.target.value)} style={SELECT_STYLE}>
                <option value="">Все уроки</option>
                {lessonTitles.map(lt => <option key={lt} value={lt}>{lt || t.vocabulary.noLesson}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Сканы (страницы учебника) выбранного урока — «слова именно с этой страницы» */}
        {(!isMobile || filtersOpen) && scanIds.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={FILTER_LABEL}>Скан</span>
            <button style={chipStyle(scanFilter === '')} onClick={() => setScanFilter('')}>
              {t.vocabulary.all}
            </button>
            {scanIds.map(id => (
              <button key={id} style={chipStyle(scanFilter === id)} onClick={() => setScanFilter(scanFilter === id ? '' : id)}>
                📄 Скан {scanNo[id]}
              </button>
            ))}
          </div>
        )}

        {/* Буквы (алфавит) — фильтр слов по первой букве */}
        {(!isMobile || filtersOpen) && letters.length > 1 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={FILTER_LABEL}>Буква</span>
            <button style={chipStyle(letterFilter === '')} onClick={() => setLetterFilter('')}>
              {t.vocabulary.all}
            </button>
            {letters.map(l => (
              <button key={l} style={chipStyle(letterFilter === l)} onClick={() => setLetterFilter(letterFilter === l ? '' : l)}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Часть речи — на ПК всегда, на мобиле по шестерёнке */}
        {(!isMobile || filtersOpen) && visiblePos.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <span style={FILTER_LABEL}>Речь</span>
            <button style={chipStyle(grammarFilter === '')} onClick={() => setGrammarFilter('')}>
              {t.vocabulary.all}
            </button>
            {visiblePos.map(cat => (
              <button key={cat} style={chipStyle(grammarFilter === cat)} onClick={() => setGrammarFilter(grammarFilter === cat ? '' : cat)}>
                {GRAMMAR_LABELS[cat] || cat} {chipCount(posCounts[cat])}
              </button>
            ))}
          </div>
        )}

        <p style={{ color: 'var(--ink-soft)', marginBottom: 12, fontSize: 13 }}>
          {t.vocabulary.wordsCount(filtered.length)}
          {activeFilters > 0 && <span> · <button onClick={resetFilters} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0 }}>сбросить фильтры</button></span>}
        </p>

        {Object.entries(grouped).map(([lessonTitle, lessonWords]) => (
          <div key={lessonTitle} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: `2px solid var(--line)` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📚 {lessonTitle}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{lessonWords.length} сл.</span>
            </div>
            {lessonWords.map(word => (
              <VocabWord key={word.id} word={word} statusLabels={statusLabels} onStatusChange={updateStatus}
                selected={selectedIds.has(word.id)} onToggleSelect={() => toggleSelect(word.id)} />
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
  { letter: 'A', name: 'a',  ipa: '[aː]',         ru: 'аа',        word: 'Apfel',     wordRu: 'яблоко',     vowel: true },
  { letter: 'B', name: 'be', ipa: '[beː]',         ru: 'бэ',        word: 'Brief',     wordRu: 'письмо' },
  { letter: 'C', name: 'ce', ipa: '[tseː]',        ru: 'цэ',        word: 'Computer',  wordRu: 'компьютер' },
  { letter: 'D', name: 'de', ipa: '[deː]',         ru: 'дэ',        word: 'Deutsch',   wordRu: 'немецкий' },
  { letter: 'E', name: 'e',  ipa: '[eː]',          ru: 'э',         word: 'Essen',     wordRu: 'еда',        vowel: true },
  { letter: 'F', name: 'ef', ipa: '[ɛf]',          ru: 'эф',        word: 'Fisch',     wordRu: 'рыба' },
  { letter: 'G', name: 'ge', ipa: '[ɡeː]',         ru: 'гэ',        word: 'Garten',    wordRu: 'сад' },
  { letter: 'H', name: 'ha', ipa: '[haː]',         ru: 'хаа',       word: 'Haus',      wordRu: 'дом' },
  { letter: 'I', name: 'i',  ipa: '[iː]',          ru: 'ии',        word: 'Insel',     wordRu: 'остров',     vowel: true },
  { letter: 'J', name: 'jot',ipa: '[jɔt]',         ru: 'йот',       word: 'Jahr',      wordRu: 'год' },
  { letter: 'K', name: 'ka', ipa: '[kaː]',         ru: 'каа',       word: 'Kind',      wordRu: 'ребёнок' },
  { letter: 'L', name: 'el', ipa: '[ɛl]',          ru: 'эль',       word: 'Licht',     wordRu: 'свет' },
  { letter: 'M', name: 'em', ipa: '[ɛm]',          ru: 'эм',        word: 'Mutter',    wordRu: 'мать' },
  { letter: 'N', name: 'en', ipa: '[ɛn]',          ru: 'эн',        word: 'Nacht',     wordRu: 'ночь' },
  { letter: 'O', name: 'o',  ipa: '[oː]',          ru: 'оо',        word: 'Ohr',       wordRu: 'ухо',        vowel: true },
  { letter: 'P', name: 'pe', ipa: '[peː]',         ru: 'пэ',        word: 'Pause',     wordRu: 'пауза' },
  { letter: 'Q', name: 'qu', ipa: '[kuː]',         ru: 'куу',       word: 'Quelle',    wordRu: 'источник' },
  { letter: 'R', name: 'er', ipa: '[ɛʁ]',          ru: 'эр',        word: 'Rot',       wordRu: 'красный' },
  { letter: 'S', name: 'es', ipa: '[ɛs]',          ru: 'эс',        word: 'Sonne',     wordRu: 'солнце' },
  { letter: 'T', name: 'te', ipa: '[teː]',         ru: 'тэ',        word: 'Tisch',     wordRu: 'стол' },
  { letter: 'U', name: 'u',  ipa: '[uː]',          ru: 'уу',        word: 'Uhr',       wordRu: 'часы',       vowel: true },
  { letter: 'V', name: 'vau',ipa: '[faʊ̯]',         ru: 'фау',       word: 'Vogel',     wordRu: 'птица' },
  { letter: 'W', name: 'we', ipa: '[veː]',         ru: 'вэ',        word: 'Wasser',    wordRu: 'вода' },
  { letter: 'X', name: 'ix', ipa: '[ɪks]',         ru: 'икс',       word: 'Xylophon',  wordRu: 'ксилофон' },
  { letter: 'Y', name: 'ypsilon', ipa: '[ˈʏpsilɔn]', ru: 'юпсилон', word: 'Yoga',    wordRu: 'йога',       vowel: true },
  { letter: 'Z', name: 'zet',ipa: '[tsɛt]',        ru: 'цэт',       word: 'Zeit',      wordRu: 'время' },
  { letter: 'Ä', name: 'ä',  ipa: '[ɛː]',          ru: 'э (умлаут)',word: 'Äpfel',     wordRu: 'яблоки',     umlaut: true, vowel: true },
  { letter: 'Ö', name: 'ö',  ipa: '[øː]',          ru: 'о (умлаут)',word: 'Öl',        wordRu: 'масло',      umlaut: true, vowel: true },
  { letter: 'Ü', name: 'ü',  ipa: '[yː]',          ru: 'у (умлаут)',word: 'Über',      wordRu: 'над/через',  umlaut: true, vowel: true },
  { letter: 'ß', name: 'Eszett', ipa: '[ɛsˈtsɛt]',ru: 'эс-цэт',   word: 'Straße',    wordRu: 'улица',      umlaut: true },
]

const PRONUNCIATION_RULES = [
  ['ch', 'после а, о, у, au — [х] (Bach), иначе — мягкий [хь] (ich)'],
  ['sch', '[ш] — Schule, Schüler'],
  ['ei', '[ай] — mein, Stein, drei'],
  ['ie', '[ии] — lieben, Bier, viel'],
  ['eu/äu', '[ой] — neu, Häuser'],
  ['sp/st', '[шп]/[шт] в начале — Sport, Stadt'],
  ['tion', '[цьон] — Nation, Situation'],
  ['pf', '[пф] — Pferd, Apfel'],
  ['v', 'чаще [ф] — Vogel, viel'],
  ['w', 'всегда [в] — Wasser'],
  ['z', 'всегда [ц] — Zeit, Zug'],
  ['ß', '[с] острая — Straße, Fuß'],
]

function GermanAlphabet() {
  const [active, setActive] = useState(null)

  const playLetter = (item, e) => {
    e.stopPropagation()
    speak(item.name || item.letter, 'de-DE')
  }

  const playWord = (item, e) => {
    e.stopPropagation()
    speak(item.word, 'de-DE')
  }

  return (
    <div style={{ padding: '0 14px 24px' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 18px', lineHeight: 1.6 }}>
        Немецкий алфавит — 26 букв + умлауты <b>Ä Ö Ü</b> и лигатура <b>ß</b>.
        Нажми 🔊 чтобы услышать название буквы, нажми на слово — услышишь пример.
      </p>

      {/* Основные буквы */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
        Алфавит A–Z
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
        {DE_ALPHABET.filter(l => !l.umlaut).map(item => (
          <LetterCard key={item.letter} item={item} active={active === item.letter}
            onSelect={() => setActive(active === item.letter ? null : item.letter)}
            onPlayLetter={e => playLetter(item, e)}
            onPlayWord={e => playWord(item, e)}
          />
        ))}
      </div>

      {/* Умлауты */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
        Умлауты и ß
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 24 }}>
        {DE_ALPHABET.filter(l => l.umlaut).map(item => (
          <LetterCard key={item.letter} item={item} active={active === item.letter}
            onSelect={() => setActive(active === item.letter ? null : item.letter)}
            onPlayLetter={e => playLetter(item, e)}
            onPlayWord={e => playWord(item, e)}
          />
        ))}
      </div>

      {/* Правила произношения */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--ink)' }}>
          💡 Особенности немецкого произношения
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px 16px' }}>
          {PRONUNCIATION_RULES.map(([rule, hint]) => (
            <div key={rule} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', fontSize: 14,
                background: 'var(--accent-soft)', padding: '1px 7px', borderRadius: 6,
                flexShrink: 0, lineHeight: '22px',
              }}>{rule}</span>
              <span style={{ color: 'var(--ink-soft)', fontSize: 12, lineHeight: 1.55 }}>{hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LetterCard({ item, active, onSelect, onPlayLetter, onPlayWord }) {
  return (
    <div onClick={onSelect}
      style={{
        border: `2px solid ${active ? 'var(--accent)' : item.umlaut ? '#6B5B2E44' : 'var(--line)'}`,
        borderRadius: 14,
        background: active ? 'var(--accent-soft)' : item.vowel ? 'rgba(201,165,74,0.05)' : 'var(--surface)',
        cursor: 'pointer',
        padding: '14px 10px 10px',
        textAlign: 'center',
        transition: 'border-color .15s, background .15s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        userSelect: 'none',
      }}>
      {/* Буква крупная */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          fontSize: 40, fontWeight: 900, lineHeight: 1,
          color: active ? 'var(--accent)' : item.umlaut ? 'var(--accent)' : 'var(--ink)',
          fontFamily: 'Georgia, serif',
        }}>
          {item.letter}
        </span>
        <span style={{ fontSize: 24, color: 'var(--ink-soft)', fontFamily: 'Georgia, serif' }}>
          {item.letter.toLowerCase()}
        </span>
      </div>

      {/* Название буквы */}
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginTop: 2 }}>
        «{item.ru}»
      </div>

      {/* IPA */}
      <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace' }}>
        {item.ipa}
      </div>

      {/* Кнопка озвучки названия буквы */}
      <button onClick={onPlayLetter}
        style={{
          marginTop: 6, padding: '4px 12px', fontSize: 12, borderRadius: 20,
          border: '1px solid var(--accent)', background: 'transparent',
          color: 'var(--accent)', cursor: 'pointer', fontWeight: 600,
        }}>
        🔊 {item.name}
      </button>

      {/* Пример слова — всегда видно */}
      <div style={{
        marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8, width: '100%',
      }}>
        <button onClick={onPlayWord}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            width: '100%', textAlign: 'center',
          }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.word}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{item.wordRu}</div>
        </button>
      </div>
    </div>
  )
}

// ── Немецкие цифры 1–100 ──────────────────────────────────────────────────────

const DE_NUMBERS = [
  [1,'eins','один'],[2,'zwei','два'],[3,'drei','три'],[4,'vier','четыре'],
  [5,'fünf','пять'],[6,'sechs','шесть'],[7,'sieben','семь'],[8,'acht','восемь'],
  [9,'neun','девять'],[10,'zehn','десять'],[11,'elf','одиннадцать'],[12,'zwölf','двенадцать'],
  [13,'dreizehn','тринадцать'],[14,'vierzehn','четырнадцать'],[15,'fünfzehn','пятнадцать'],
  [16,'sechzehn','шестнадцать'],[17,'siebzehn','семнадцать'],[18,'achtzehn','восемнадцать'],
  [19,'neunzehn','девятнадцать'],[20,'zwanzig','двадцать'],
  [21,'einundzwanzig','двадцать один'],[22,'zweiundzwanzig','двадцать два'],
  [23,'dreiundzwanzig','двадцать три'],[24,'vierundzwanzig','двадцать четыре'],
  [25,'fünfundzwanzig','двадцать пять'],[26,'sechsundzwanzig','двадцать шесть'],
  [27,'siebenundzwanzig','двадцать семь'],[28,'achtundzwanzig','двадцать восемь'],
  [29,'neunundzwanzig','двадцать девять'],[30,'dreißig','тридцать'],
  [31,'einunddreißig','тридцать один'],[32,'zweiunddreißig','тридцать два'],
  [33,'dreiunddreißig','тридцать три'],[34,'vierunddreißig','тридцать четыре'],
  [35,'fünfunddreißig','тридцать пять'],[36,'sechsunddreißig','тридцать шесть'],
  [37,'siebenunddreißig','тридцать семь'],[38,'achtunddreißig','тридцать восемь'],
  [39,'neununddreißig','тридцать девять'],[40,'vierzig','сорок'],
  [41,'einundvierzig','сорок один'],[42,'zweiundvierzig','сорок два'],
  [43,'dreiundvierzig','сорок три'],[44,'vierundvierzig','сорок четыре'],
  [45,'fünfundvierzig','сорок пять'],[46,'sechsundvierzig','сорок шесть'],
  [47,'siebenundvierzig','сорок семь'],[48,'achtundvierzig','сорок восемь'],
  [49,'neunundvierzig','сорок девять'],[50,'fünfzig','пятьдесят'],
  [51,'einundfünfzig','пятьдесят один'],[52,'zweiundFünfzig','пятьдесят два'],
  [55,'fünfundfünfzig','пятьдесят пять'],[60,'sechzig','шестьдесят'],
  [61,'einundsechzig','шестьдесят один'],[65,'fünfundsechzig','шестьдесят пять'],
  [70,'siebzig','семьдесят'],[71,'einundsiebzig','семьдесят один'],
  [75,'fünfundsiebzig','семьдесят пять'],[80,'achtzig','восемьдесят'],
  [81,'einundachtzig','восемьдесят один'],[85,'fünfundachtzig','восемьдесят пять'],
  [90,'neunzig','девяносто'],[91,'einundneunzig','девяносто один'],
  [95,'fünfundneunzig','девяносто пять'],[99,'neunundneunzig','девяносто девять'],
  [100,'hundert','сто'],
].map(([n, de, ru]) => ({ n, de, ru }))

// Десятки для группировки
const TENS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

function GermanNumbers() {
  const [active, setActive] = useState(null)

  const playNum = (num) => {
    speak(num.de, 'de-DE')
    setActive(num.n)
    setTimeout(() => setActive(null), 1200)
  }

  const groups = TENS.slice(0, -1).map((start, i) => ({
    label: start === 0 ? '1–10' : `${start + 1}–${TENS[i + 1]}`,
    items: DE_NUMBERS.filter(n => n.n > start && n.n <= TENS[i + 1]),
  })).filter(g => g.items.length)

  return (
    <div style={{ padding: '0 14px 24px' }}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 18px', lineHeight: 1.6 }}>
        Цифры и числа от 1 до 100. Нажми на карточку — услышишь произношение.
        <br />
        <b>Правило:</b> от 21 до 99 сначала единицы, потом «und», потом десятки: <b>ein-und-zwanzig</b> (21).
      </p>

      {groups.map(group => (
        <div key={group.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {group.label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {group.items.map(num => (
              <button key={num.n} onClick={() => playNum(num)}
                style={{
                  border: `2px solid ${active === num.n ? 'var(--accent)' : 'var(--line)'}`,
                  borderRadius: 12, background: active === num.n ? 'var(--accent-soft)' : 'var(--surface)',
                  cursor: 'pointer', padding: '10px 12px', textAlign: 'left',
                  transition: 'border-color .15s, background .15s',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 15, flexShrink: 0,
                }}>
                  {num.n}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', lineHeight: 1.2 }}>{num.de}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{num.ru}</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 16, opacity: 0.5 }}>🔊</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Правило образования составных чисел */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 14, padding: '14px 18px', marginTop: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>📐 Как образуются числа 21–99</div>
        <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7 }}>
          <b>Единицы + und + десятки</b>:
          <br />→ <b>vier</b>-und-<b>zwanzig</b> = 24 (четыре-и-двадцать)
          <br />→ <b>sieben</b>-und-<b>achtzig</b> = 87 (семь-и-восемьдесят)
          <br />→ <b>drei</b>-und-<b>dreißig</b> = 33 (три-и-тридцать)
        </div>
      </div>
    </div>
  )
}

function VocabWord({ word, statusLabels, onStatusChange, selected, onToggleSelect }) {
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
  const isMobile = useIsMobile()

  // Селект статуса — на мобиле рендерится под фото, на ПК справа (стиль передаётся)
  const StatusSelect = ({ style }) => (
    <select
      value={word.status}
      onChange={e => onStatusChange(word.id, e.target.value)}
      style={{
        borderRadius: 8, border: `1px solid ${STATUS_COLORS[word.status]}`,
        color: STATUS_COLORS[word.status], fontWeight: 700, cursor: 'pointer',
        background: 'var(--surface-2)', ...style,
      }}>
      <option value="new">{statusLabels.new}</option>
      <option value="learning">{statusLabels.learning}</option>
      <option value="known">{statusLabels.known}</option>
    </select>
  )

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
    } catch (err) {
      alert(err?.message || 'Не удалось загрузить картинку')
    }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px',
      borderBottom: '1px solid var(--line)', borderRadius: 10,
      marginBottom: 3, background: selected ? 'var(--accent-soft)' : (STATUS_BG[word.status] ?? 'var(--surface)'),
      outline: selected ? '2px solid var(--accent)' : 'none',
    }}>
      {/* Учитель: галочка «взять слово в набор» */}
      {user?.role === 'owner' && onToggleSelect && (
        <input type="checkbox" checked={!!selected} onChange={onToggleSelect}
          title="Выбрать слово для набора"
          style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent)' }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, width: 80 }}>
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
        {/* Статус под фото — ТОЛЬКО на мобиле (на ПК он справа) */}
        {isMobile && <StatusSelect style={{ width: '100%', padding: '3px 2px', fontSize: 11, textAlign: 'center' }} />}
        {user?.role === 'owner' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refreshImage} disabled={refreshing} title="Обновить картинку (Unsplash)"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-soft)', padding: 0, lineHeight: 1 }}>
              {refreshing ? '⏳' : '🔄'}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Заменить картинку своей (загрузить файл)"
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
          {word.source === 'extra' && (
            <span title="Из тетради / с доски (дополнительное)" style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>✏️</span>
          )}
          <SpeakButton text={word.word_de} appendText={translation} />
          <button onClick={() => shareLink({ title: word.word_de, text: `${word.word_de} — ${translation}`, url: cardUrl(word.id) })}
            title="Поделиться карточкой"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', padding: '0 2px', lineHeight: 1 }}>
            <i className="bi bi-share-fill" />
          </button>
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
        {/* Пример — во всю ширину правой колонки, под словом */}
        {word.example_sentence && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{word.example_sentence}</span>
              <SpeakButton text={word.example_sentence} size={13} />
            </div>
            {word.example_sentence_ru && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                {word.example_sentence_ru}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Статус справа — ТОЛЬКО на ПК (на мобиле он под фото) */}
      {!isMobile && <StatusSelect style={{ padding: '4px 8px', fontSize: 12, flexShrink: 0 }} />}
    </div>
  )
}
