import { useEffect, useState, useMemo } from 'react'
import { api } from '../api/client.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'
import { useAuthStore } from '../store/auth.js'
import { ru } from '../i18n/ru.js'
import { en } from '../i18n/en.js'
import { de } from '../i18n/de.js'
import { uk } from '../i18n/uk.js'
import { fr } from '../i18n/fr.js'
import { tr } from '../i18n/tr.js'
import { ar } from '../i18n/ar.js'
import { bg } from '../i18n/bg.js'
import { es } from '../i18n/es.js'
import { sq } from '../i18n/sq.js'

const ALL_I18N = { ru, en, de, uk, fr, tr, ar, bg, es, sq }

// Разворачиваем вложенный объект i18n в плоский список
function flattenI18n(obj, prefix = '') {
  const result = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      result.push({ key })
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      result.push(...flattenI18n(v, key))
    }
    // пропускаем функции (exercisesWaiting и т.п.)
  }
  return result
}

function getNestedValue(obj, keys) {
  let v = obj
  for (const k of keys) v = v?.[k]
  return typeof v === 'string' ? v : ''
}

const LANGS = [
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'de', label: 'DE', flag: '🇩🇪' },
  { code: 'uk', label: 'UK', flag: '🇺🇦' },
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'tr', label: 'TR', flag: '🇹🇷' },
  { code: 'ar', label: 'AR', flag: '🇸🇦' },
  { code: 'bg', label: 'BG', flag: '🇧🇬' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'sq', label: 'SQ', flag: '🇦🇱' },
]

// Интерфейсные переводы (из всех 10 локальных i18n файлов)
const I18N_FLAT = flattenI18n(ru).map(row => {
  const keys = row.key.split('.')
  const entry = { key: row.key }
  for (const [code, translations] of Object.entries(ALL_I18N)) {
    entry[code] = getNestedValue(translations, keys)
  }
  return entry
})

const GROUPS = [
  { id: 'words',     icon: '📖', label: 'Слова словаря',      desc: 'Немецкие слова с переводами на все языки' },
  { id: 'lessons',   icon: '📚', label: 'Заголовки уроков',   desc: 'Названия и описания уроков' },
  { id: 'phrasebook',icon: '💬', label: 'Разговорник',        desc: 'Ваши фразы (немецкий → русский)' },
  { id: 'interface', icon: '🗺️', label: 'Интерфейс',         desc: 'Кнопки, подсказки, тексты навигации' },
]

function hl(text, q) {
  if (!q || !text) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: 'rgba(201,165,74,.45)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}

export default function Translations() {
  const { user } = useAuthStore()
  const [words, setWords]         = useState([])
  const [lessons, setLessons]     = useState([])
  const [phrases, setPhrases]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [activeGroup, setActiveGroup] = useState('words')
  const [visibleLangs, setVisibleLangs] = useState(['ru', 'en'])

  useEffect(() => {
    Promise.all([
      api.get('/words').catch(() => []),
      api.get('/lessons').catch(() => []),
      api.get('/phrasebook').catch(() => []),
    ]).then(([w, l, p]) => {
      setWords(w)
      setLessons(l)
      setPhrases(p)
      setLoading(false)
    })
  }, [])

  const q = search.trim().toLowerCase()

  const filteredWords = useMemo(() => {
    if (!q) return words
    return words.filter(w => {
      if (w.word_de?.toLowerCase().includes(q)) return true
      if (w.translation_ru?.toLowerCase().includes(q)) return true
      if (w.translations && typeof w.translations === 'object')
        return Object.values(w.translations).some(v => v?.toLowerCase().includes(q))
      return false
    })
  }, [words, q])

  const filteredLessons = useMemo(() => {
    if (!q) return lessons
    return lessons.filter(l => {
      if (l.title?.toLowerCase().includes(q)) return true
      if (l.description?.toLowerCase().includes(q)) return true
      if (l.title_translations && typeof l.title_translations === 'object')
        return Object.values(l.title_translations).some(v => v?.toLowerCase().includes(q))
      return false
    })
  }, [lessons, q])

  const filteredPhrases = useMemo(() => {
    if (!q) return phrases
    return phrases.filter(p => p.de?.toLowerCase().includes(q) || p.ru?.toLowerCase().includes(q))
  }, [phrases, q])

  const filteredInterface = useMemo(() => {
    if (!q) return I18N_FLAT
    return I18N_FLAT.filter(r =>
      r.key.toLowerCase().includes(q) || r.ru?.toLowerCase().includes(q) ||
      r.en?.toLowerCase().includes(q) || r.de?.toLowerCase().includes(q)
    )
  }, [q])

  const counts = {
    words:      filteredWords.length,
    lessons:    filteredLessons.length,
    phrasebook: filteredPhrases.length,
    interface:  filteredInterface.length,
  }

  const toggleLang = (code) =>
    setVisibleLangs(prev =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter(l => l !== code) : prev) : [...prev, code]
    )

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>Загрузка…</div>

  return (
    <div style={{ padding: '20px 14px 80px' }}>

      {/* Заголовок */}
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px' }}>🌍 Переводы</h1>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
        Всё переведённое на сайте — слова, уроки, фразы, интерфейс
      </div>

      {/* Поиск */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <i className="bi bi-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: 14, pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по всем переводам…"
          autoFocus
          style={{ width: '100%', padding: '10px 36px', borderRadius: 10, fontSize: 15 }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18 }}>
            ×
          </button>
        )}
      </div>

      {/* Выбор языков */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
        {LANGS.map(l => (
          <button key={l.code} onClick={() => toggleLang(l.code)}
            style={{
              padding: '4px 10px', borderRadius: 20, border: '1px solid var(--line)',
              background: visibleLangs.includes(l.code) ? 'var(--accent)' : 'var(--surface-2)',
              color: visibleLangs.includes(l.code) ? 'var(--accent-ink)' : 'var(--ink-soft)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
            {l.flag} {l.label}
          </button>
        ))}
      </div>

      {/* Группы */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {GROUPS.map(g => (
          <button key={g.id} onClick={() => setActiveGroup(g.id)}
            style={{
              padding: '7px 14px', borderRadius: 10, border: '1px solid var(--line)',
              background: activeGroup === g.id ? 'var(--accent)' : 'var(--surface)',
              color: activeGroup === g.id ? 'var(--accent-ink)' : 'var(--ink)',
              cursor: 'pointer', fontSize: 13, fontWeight: activeGroup === g.id ? 700 : 400,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {g.icon} {g.label}
            <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>({counts[g.id]})</span>
          </button>
        ))}
      </div>

      {/* Описание группы */}
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        {GROUPS.find(g => g.id === activeGroup)?.desc}
      </div>

      {/* Контент */}
      {activeGroup === 'words' && (
        <WordsTable words={filteredWords} visibleLangs={visibleLangs} q={q} />
      )}
      {activeGroup === 'lessons' && (
        <LessonsTable lessons={filteredLessons} visibleLangs={visibleLangs} q={q}
          isOwner={user?.role === 'owner'}
          onUpdate={updated => setLessons(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))}
        />
      )}
      {activeGroup === 'phrasebook' && (
        <PhrasesTable phrases={filteredPhrases} q={q} />
      )}
      {activeGroup === 'interface' && (
        <InterfaceTable rows={filteredInterface} visibleLangs={visibleLangs} q={q} />
      )}
    </div>
  )
}

// ── Таблицы ─────────────────────────────────────────────────────────────────

function ColHeader({ langs }) {
  const map = Object.fromEntries(LANGS.map(l => [l.code, l]))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${langs.length}, 1fr)`, gap: 0, marginBottom: 2 }}>
      <div style={thH}>Оригинал</div>
      {langs.map(c => <div key={c} style={thH}>{map[c]?.flag} {map[c]?.label || c.toUpperCase()}</div>)}
    </div>
  )
}

const thH = { padding: '5px 12px', fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.08em' }

function WordsTable({ words, visibleLangs, q }) {
  if (!words.length) return <Empty q={q} />
  return (
    <div>
      <ColHeader langs={visibleLangs} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {words.map(w => {
          const tr = w.translations || {}
          const getV = (code) => code === 'ru' ? (w.translation_ru || tr.ru || '') : (tr[code] || '')
          return (
            <div key={w.id} style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${visibleLangs.length}, 1fr)`, gap: 0, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden', fontSize: 13 }}>
              <div style={{ padding: '9px 12px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 6, borderRight: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hl(w.word_de, q)}</span>
                <SpeakButton text={w.word_de} size={12} />
              </div>
              {visibleLangs.map((code, i) => (
                <div key={code} style={{ padding: '9px 12px', borderRight: i < visibleLangs.length - 1 ? '1px solid var(--line)' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', dir: code === 'ar' ? 'rtl' : undefined }}>
                  {getV(code) ? hl(getV(code), q) : <span style={{ opacity: 0.3 }}>—</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ALL_LANGS = ['ru', 'en', 'de', 'uk', 'fr', 'tr', 'ar', 'bg', 'es', 'sq']

function LessonsTable({ lessons, visibleLangs, q, isOwner, onUpdate }) {
  const [editingId, setEditingId] = useState(null)
  const [editTrans, setEditTrans] = useState({})
  const [saving, setSaving]       = useState(false)

  if (!lessons.length) return <Empty q={q} />

  const startEdit = (lesson) => {
    setEditingId(lesson.id)
    setEditTrans(lesson.title_translations || {})
  }

  const cancelEdit = () => { setEditingId(null); setEditTrans({}) }

  const saveEdit = async (lessonId) => {
    setSaving(true)
    try {
      const body = Object.fromEntries(Object.entries(editTrans).filter(([, v]) => v && v.trim()))
      const updated = await api.patch(`/lessons/${lessonId}`, { title_translations: body })
      onUpdate(updated)
      cancelEdit()
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lessons.map(lesson => {
        const trans = lesson.title_translations || {}
        const isEditing = editingId === lesson.id
        const filled = ALL_LANGS.filter(c => trans[c]).length
        return (
          <div key={lesson.id} style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', overflow: 'hidden' }}>
            {/* Заголовок урока */}
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{hl(lesson.title, q)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{filled}/{ALL_LANGS.length}</span>
                {isOwner && !isEditing && (
                  <button onClick={() => startEdit(lesson)}
                    title="Редактировать переводы"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '2px 6px', borderRadius: 6, fontSize: 13 }}>
                    <i className="bi bi-pencil-fill" />
                  </button>
                )}
              </div>
            </div>

            {lesson.description && (
              <div style={{ padding: '6px 14px', fontSize: 12, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>
                {hl(lesson.description, q)}
              </div>
            )}

            {/* Режим просмотра */}
            {!isEditing && (
              <div style={{ padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_LANGS.filter(c => visibleLangs.includes(c)).map(code => {
                  const v = trans[code]
                  if (!v) return null
                  const lang = LANGS.find(x => x.code === code)
                  return (
                    <span key={code} style={{ fontSize: 12, background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px', color: 'var(--ink)' }}>
                      <span style={{ opacity: 0.5, marginRight: 4 }}>{lang?.flag}</span>
                      {hl(v, q)}
                    </span>
                  )
                })}
                {ALL_LANGS.filter(c => visibleLangs.includes(c)).every(c => !trans[c]) && (
                  <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>Переводы не добавлены</span>
                )}
              </div>
            )}

            {/* Режим редактирования (только owner) */}
            {isEditing && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px 12px', marginBottom: 10 }}>
                  {LANGS.map(({ code, flag, label }) => (
                    <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, width: 32, flexShrink: 0, color: 'var(--ink-soft)' }}>{flag} {label}</span>
                      <input
                        value={editTrans[code] || ''}
                        onChange={e => setEditTrans(prev => ({ ...prev, [code]: e.target.value }))}
                        style={{ flex: 1, fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', boxSizing: 'border-box' }}
                        dir={code === 'ar' ? 'rtl' : 'ltr'}
                        placeholder={code === 'de' ? 'оригинал (нем.)' : ''}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => saveEdit(lesson.id)} disabled={saving}
                    style={{ padding: '6px 16px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {saving ? '...' : '✓ Сохранить'}
                  </button>
                  <button onClick={cancelEdit}
                    style={{ padding: '6px 12px', background: 'none', color: 'var(--ink-soft)', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PhrasesTable({ phrases, q }) {
  if (!phrases.length) return <Empty q={q} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {phrases.map(p => (
        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden', fontSize: 13 }}>
          <div style={{ padding: '9px 12px', background: 'var(--surface-2)', borderRight: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, flex: 1 }}>{hl(p.de, q)}</span>
            <SpeakButton text={p.de} size={12} />
          </div>
          <div style={{ padding: '9px 12px', color: 'var(--accent)' }}>{hl(p.ru, q)}</div>
        </div>
      ))}
    </div>
  )
}

function InterfaceTable({ rows, visibleLangs, q }) {
  if (!rows.length) return <Empty q={q} />
  return (
    <div>
      <ColHeader langs={visibleLangs} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(row => (
          <div key={row.key} style={{ display: 'grid', gridTemplateColumns: `180px repeat(${visibleLangs.length}, 1fr)`, gap: 0, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden', fontSize: 12 }}>
            <div style={{ padding: '7px 10px', background: 'var(--surface-2)', borderRight: '1px solid var(--line)', fontFamily: 'monospace', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hl(row.key, q)}
            </div>
            {visibleLangs.map((code, i) => (
              <div key={code} style={{ padding: '7px 10px', borderRight: i < visibleLangs.length - 1 ? '1px solid var(--line)' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', dir: code === 'ar' ? 'rtl' : undefined }}>
                {hl(row[code] || '', q) || <span style={{ opacity: 0.3 }}>—</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Empty({ q }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)', fontSize: 14 }}>
      {q ? `Ничего не найдено по «${q}»` : 'Нет данных'}
    </div>
  )
}
