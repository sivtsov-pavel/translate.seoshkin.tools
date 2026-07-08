import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

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

export default function LessonList() {
  const [lessons, setLessons]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [deleting, setDeleting]         = useState(null)
  const [fetchingImages, setFetchingImages]       = useState(false)
  const [translatingSentences, setTranslatingSentences] = useState(false)
  const [enriching, setEnriching]                       = useState(false)
  const [addingLetters, setAddingLetters]         = useState(null)
  const [addingDictation, setAddingDictation]     = useState(null)
  const [processing, setProcessing]               = useState(null)
  const [editingId, setEditingId]       = useState(null)
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleFetchImages = async () => {
    setFetchingImages(true)
    try {
      const res = await api.post('/admin/fetch-images', {})
      alert(`Готово! Загружено: ${res.updated} картинок, не найдено: ${res.failed}`)
    } catch (e) { alert('Ошибка: ' + e.message) } finally { setFetchingImages(false) }
  }

  const handleEnrichWords = async () => {
    setEnriching(true)
    try {
      const res = await api.post('/admin/enrich-words', {})
      alert(`Дополнено слов: ${res.updated} из ${res.total}`)
    } catch (e) { alert('Ошибка: ' + e.message) } finally { setEnriching(false) }
  }

  const handleTranslateSentences = async () => {
    setTranslatingSentences(true)
    try {
      const res = await api.post('/admin/translate-sentences', {})
      alert(`Переведено предложений: ${res.updated}`)
    } catch (e) { alert('Ошибка: ' + e.message) } finally { setTranslatingSentences(false) }
  }

  const handleProcess = async (id) => {
    setProcessing(id)
    setLessons(prev => prev.map(l => l.id === id ? { ...l, status: 'processing', progress: 'Запускаем...' } : l))
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
    if (!window.confirm('Удалить урок? Все слова и упражнения этого урока будут удалены.')) return
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8, padding: '0 0 8px' }}>
        <h1 style={{ margin: 0 }}>{t.lessons.title}</h1>
        {user?.role === 'owner' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleFetchImages} disabled={fetchingImages} style={adminBtn('var(--accent)')}>
              {fetchingImages ? '⏳ Загружаю картинки...' : '🖼️ Загрузить картинки'}
            </button>
            <button onClick={handleTranslateSentences} disabled={translatingSentences} style={adminBtn('var(--good)')}>
              {translatingSentences ? '⏳ Перевожу...' : '🌐 Перевести предложения'}
            </button>
            <button onClick={handleEnrichWords} disabled={enriching} style={adminBtn('#d97706')}>
              {enriching ? '⏳ Дополняю...' : '🤖 Дополнить словарь'}
            </button>
          </div>
        )}
      </div>

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
                      {lesson.description && (
                        <span style={{ marginLeft: 8, color: 'var(--ink-soft)' }}>— {lesson.description}</span>
                      )}
                      {lesson.progress && status !== 'done' && (
                        <span style={{ marginLeft: 8, color: STATUS_COLORS[status] }}>{lesson.progress}</span>
                      )}
                    </div>
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

const adminBtn = (color) => ({
  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--surface)', color, fontWeight: 600, fontSize: 13, cursor: 'pointer',
})
