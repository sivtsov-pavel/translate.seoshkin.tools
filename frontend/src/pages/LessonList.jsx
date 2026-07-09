import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { useAdminOpStore } from '../store/adminOp.js'

const STATUS_COLORS = { pending: 'var(--ink-soft)', processing: '#f59e0b', done: 'var(--good)', error: 'var(--red)' }
const STATUS_ICONS  = { pending: '○', processing: '⏳', done: '✓', error: '✗' }

function EditForm({ lesson, onSave, onCancel }) {
  const [title, setTitle]       = useState(lesson.title || '')
  const [desc, setDesc]         = useState(lesson.description || '')
  const [textContent, setTextContent] = useState(lesson.text_content || '')
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.patch(`/lessons/${lesson.id}`, {
        title: title.trim() || null,
        description: desc.trim() || null,
        text_content: textContent.trim() || null,
      })
      onSave(updated)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const uploadMedia = async (files) => {
    if (!files.length) return
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of files) form.append('file', f)
      await uploadFiles(`/lessons/${lesson.id}/media`, form)
      alert(`Загружено: ${files.length} файл(ов)`)
    } catch (e) {
      alert('Ошибка загрузки: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Название урока</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Lektion 1" style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Описание / заметки для ассистента</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Тема урока, особенности группы, задачи..." rows={2}
          style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>
          Текст урока / слова
          <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--ink-soft)', opacity: 0.7 }}>— Claude разберёт и создаст упражнения</span>
        </label>
        <textarea
          value={textContent}
          onChange={e => setTextContent(e.target.value)}
          placeholder={"Вставь слова, предложения или текст урока:\n\nder Hund — собака\ndie Katze — кошка\nsprechen — говорить\n\nИли просто вставь текст на немецком — Claude сам извлечёт слова."}
          rows={6}
          style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '7px 18px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {saving ? '...' : '✓ Сохранить'}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ padding: '7px 14px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          {uploading ? '⏳ Загружаю...' : '📎 Добавить фото/аудио'}
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*" style={{ display: 'none' }}
          onChange={e => uploadMedia([...e.target.files])} />
        <button onClick={onCancel}
          style={{ padding: '7px 12px', background: 'var(--surface-2)', color: 'var(--ink-soft)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Отмена
        </button>
      </div>
    </div>
  )
}

const getOpNames = (t) => ({
  'fetch-images':              '🖼️ ' + t.courses.opFetchImages,
  'enrich-words':              '🤖 ' + t.courses.opEnrichWords,
  'translate-sentences':       '🌐 ' + t.courses.opTranslate,
  'translate-words-all-langs': '🌍 ' + t.courses.opTranslateAllLangs,
})

export default function LessonList() {
  const [lessons, setLessons]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [deleting, setDeleting]         = useState(null)
  const [addingLetters, setAddingLetters]         = useState(null)
  const [addingDictation, setAddingDictation]     = useState(null)
  const [processing, setProcessing]               = useState(null)
  const [editingId, setEditingId]       = useState(null)
  const { t } = useI18nStore()
  const OP_NAMES = getOpNames(t)
  const { user } = useAuthStore()
  const adminOp = useAdminOpStore()
  const navigate = useNavigate()



  const handleProcess = async (id) => {
    setProcessing(id)
    setLessons(prev => prev.map(l => l.id === id ? { ...l, status: 'processing', progress: t.common.starting } : l))
    try {
      await api.post(`/lessons/${id}/process`, {})
      const poll = setInterval(async () => {
        const updated = await api.get(`/lessons/${id}`)
        setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l))
        if (updated.status !== 'processing') { clearInterval(poll); setProcessing(null) }
      }, 3000)
    } catch (e) { alert('Ошибка: ' + e.message); setProcessing(null) }
  }

  const handleAddLetterFill = async (id) => {
    setAddingLetters(id)
    try {
      const res = await api.post(`/lessons/${id}/add-letter-fill`, {})
      alert(`Добавлено ${res.added} упражнений "Добавь букву"!`)
    } catch (e) { alert('Ошибка: ' + e.message) } finally { setAddingLetters(null) }
  }

  const handleAddDictation = async (id) => {
    setAddingDictation(id)
    try {
      const res = await api.post(`/lessons/${id}/add-dictation`, {})
      alert(`Добавлено ${res.added} упражнений "Диктант"!`)
    } catch (e) { alert(e.message) } finally { setAddingDictation(null) }
  }

  useEffect(() => {
    api.get('/lessons').then(setLessons).finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm(t.common.deleteLesson)) return
    setDeleting(id)
    try {
      await api.delete(`/lessons/${id}`)
      setLessons(prev => prev.filter(l => l.id !== id))
    } catch (e) { alert(e.message) } finally { setDeleting(null) }
  }

  const handleSaveEdit = (updated) => {
    setLessons(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
    setEditingId(null)
  }

  if (loading) return <p>{t.common.loading}</p>

  return (
    <div>
      <div style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 0 8px' }}>
        <h1 style={{ margin: 0 }}>{t.lessons.title}</h1>
      </div>

      {/* Прогресс admin-операции */}
      {user?.role === 'owner' && adminOp.status !== 'idle' && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'var(--surface-2)', border: `1px solid ${adminOp.status === 'error' ? 'var(--red)' : adminOp.status === 'done' ? 'var(--good)' : 'var(--accent)'}` }}>
          {adminOp.status === 'running' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{OP_NAMES[adminOp.name]}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {adminOp.total > 0
                    ? `${adminOp.done} / ${adminOp.total} ${t.courses.words}`
                    : t.common.starting}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: adminOp.total > 0 ? `${Math.round(adminOp.done / adminOp.total * 100)}%` : '8%',
                  background: 'var(--accent)',
                  borderRadius: 4,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              {adminOp.total > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 5 }}>
                  {Math.round(adminOp.done / adminOp.total * 100)}% · обновлено: {adminOp.updated} · ошибок: {adminOp.failed}
                </div>
              )}
            </>
          )}
          {adminOp.status === 'done' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--good)', fontWeight: 600, fontSize: 14 }}>
                ✓ {OP_NAMES[adminOp.name]} — обновлено: {adminOp.updated}
                {adminOp.failed > 0 ? `, не найдено: ${adminOp.failed}` : ''}
              </span>
              <button onClick={() => adminOp.reset()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
          )}
          {adminOp.status === 'error' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--red)', fontSize: 14 }}>✗ {t.common.error}: {adminOp.error}</span>
              <button onClick={() => adminOp.reset()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
          )}
        </div>
      )}

      {lessons.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>{t.lessons.empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lessons.map(lesson => {
            const status = lesson.status || 'pending'
            const dateStr = new Date(lesson.date).toLocaleDateString()
            const isEditing = editingId === lesson.id
            return (
              <div key={lesson.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '14px 18px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>
                      {lesson.title || `${t.lessons.newLesson} #${lesson.id}`}
                    </div>
                    <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 3 }}>
                      {dateStr} · {t.lessons.mediaCount(lesson.media_count)}
                      {lesson.words_total > 0 && (
                        <span style={{
                          marginLeft: 8,
                          color: lesson.words_with_images === lesson.words_total ? 'var(--good)' : 'var(--ink-soft)',
                          fontWeight: lesson.words_with_images > 0 ? 600 : 400,
                        }}>
                          🖼️ {lesson.words_with_images}/{lesson.words_total}
                        </span>
                      )}
                      {lesson.description && (
                        <span style={{ marginLeft: 8, color: 'var(--ink-soft)' }}>— {lesson.description}</span>
                      )}
                    </div>
                    {lesson.progress && status === 'processing' && (
                      <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--accent)', fontSize: 13, color: STATUS_COLORS.processing, wordBreak: 'break-word' }}>
                        ⏳ {lesson.progress}
                      </div>
                    )}
                    {lesson.progress && status === 'error' && (
                      <div style={{ marginTop: 6, padding: '8px 12px', background: 'rgba(179,56,44,0.08)', borderRadius: 8, border: '1px solid var(--red)', fontSize: 13, color: 'var(--red)', wordBreak: 'break-word' }}>
                        ✗ {lesson.progress}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: STATUS_COLORS[status], fontWeight: 600, fontSize: 13 }}>
                      {STATUS_ICONS[status]} {t.lessons.status[status]}
                    </span>

                    {user?.role !== 'owner' && status === 'done' && (
                      <button onClick={() => navigate(`/exercise-session?lesson_id=${lesson.id}`)}
                        style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        ▶ Начать
                      </button>
                    )}

                    {user?.role === 'owner' && (
                      <>
                        {(status === 'pending' || status === 'error') && (
                          <button onClick={() => handleProcess(lesson.id)} disabled={processing === lesson.id}
                            title="Обработать фото и текст — извлечь слова и создать упражнения"
                            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            {processing === lesson.id ? '⏳' : '▶ Обработать'}
                          </button>
                        )}
                        <button onClick={() => setEditingId(isEditing ? null : lesson.id)} title="Редактировать урок"
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--line)', background: isEditing ? 'var(--accent-soft)' : 'var(--surface)', color: isEditing ? 'var(--accent)' : 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>
                          ✏️
                        </button>
                        {status === 'done' && (
                          <>
                            <button onClick={() => handleAddLetterFill(lesson.id)} disabled={addingLetters === lesson.id}
                              title="Добавить упражнения «Добавь букву»"
                              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>
                              {addingLetters === lesson.id ? '⏳' : '🔤'}
                            </button>
                            <button onClick={() => handleAddDictation(lesson.id)} disabled={addingDictation === lesson.id}
                              title="Добавить диктант"
                              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>
                              {addingDictation === lesson.id ? '⏳' : '🎙️'}
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(lesson.id)} disabled={deleting === lesson.id}
                          style={{ padding: '4px 10px', fontSize: 13, color: 'var(--red)', background: 'var(--surface)', border: '1px solid rgba(179,56,44,0.4)', borderRadius: 6, cursor: 'pointer' }}>
                          {deleting === lesson.id ? '...' : '✕'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <EditForm lesson={lesson} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                )}
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}

const adminBtn = (color, active = false) => ({
  padding: '8px 16px', borderRadius: 8,
  border: `1px solid ${active ? color : 'var(--line)'}`,
  background: active ? 'var(--surface-2)' : 'var(--surface)',
  color, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: 1,
})
