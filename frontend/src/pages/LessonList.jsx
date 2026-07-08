import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

const STATUS_COLORS = { pending: '#9ca3af', processing: '#f59e0b', done: '#10b981', error: '#ef4444' }
const STATUS_ICONS  = { pending: '○', processing: '⏳', done: '✓', error: '✗' }

function EditForm({ lesson, onSave, onCancel }) {
  const [title, setTitle]       = useState(lesson.title || '')
  const [desc, setDesc]         = useState(lesson.description || '')
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.patch(`/lessons/${lesson.id}`, { title: title.trim() || null, description: desc.trim() || null })
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
    <div style={{ marginTop: 12, padding: '12px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e0e7ff' }}>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Название урока</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Например: Lektion 1"
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Описание / заметки для ассистента</label>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Тема урока, особенности группы, задачи..."
          rows={3}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '7px 18px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {saving ? '...' : '✓ Сохранить'}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ padding: '7px 14px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          {uploading ? '⏳ Загружаю...' : '📎 Добавить фото/аудио'}
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*" style={{ display: 'none' }}
          onChange={e => uploadMedia([...e.target.files])} />
        <button onClick={onCancel}
          style={{ padding: '7px 12px', backgroundColor: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
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
  const [editingId, setEditingId]       = useState(null)
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const handleFetchImages = async () => {
    setFetchingImages(true)
    try {
      const res = await api.post('/admin/fetch-images', {})
      alert(`Готово! Загружено: ${res.updated} картинок, не найдено: ${res.failed}`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setFetchingImages(false)
    }
  }

  const handleEnrichWords = async () => {
    setEnriching(true)
    try {
      const res = await api.post('/admin/enrich-words', {})
      alert(`Дополнено слов: ${res.updated} из ${res.total}`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setEnriching(false)
    }
  }

  const handleTranslateSentences = async () => {
    setTranslatingSentences(true)
    try {
      const res = await api.post('/admin/translate-sentences', {})
      alert(`Переведено предложений: ${res.updated}`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setTranslatingSentences(false)
    }
  }

  const handleAddLetterFill = async (id) => {
    setAddingLetters(id)
    try {
      const res = await api.post(`/lessons/${id}/add-letter-fill`, {})
      alert(`Добавлено ${res.added} упражнений "Добавь букву"!`)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setAddingLetters(null)
    }
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
    } catch (e) {
      alert(e.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleSaveEdit = (updated) => {
    setLessons(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
    setEditingId(null)
  }

  if (loading) return <p>{t.common.loading}</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>{t.lessons.title}</h1>
        {user?.role === 'owner' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleFetchImages}
              disabled={fetchingImages}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
                backgroundColor: fetchingImages ? '#f3f4f6' : '#fff',
                color: '#4f46e5', fontWeight: 600, fontSize: 13, cursor: fetchingImages ? 'not-allowed' : 'pointer',
              }}>
              {fetchingImages ? '⏳ Загружаю картинки...' : '🖼️ Загрузить картинки'}
            </button>
            <button
              onClick={handleTranslateSentences}
              disabled={translatingSentences}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
                backgroundColor: translatingSentences ? '#f3f4f6' : '#fff',
                color: '#059669', fontWeight: 600, fontSize: 13, cursor: translatingSentences ? 'not-allowed' : 'pointer',
              }}>
              {translatingSentences ? '⏳ Перевожу...' : '🌐 Перевести предложения'}
            </button>
            <button
              onClick={handleEnrichWords}
              disabled={enriching}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
                backgroundColor: enriching ? '#f3f4f6' : '#fff',
                color: '#d97706', fontWeight: 600, fontSize: 13, cursor: enriching ? 'not-allowed' : 'pointer',
              }}>
              {enriching ? '⏳ Дополняю...' : '🤖 Дополнить словарь'}
            </button>
          </div>
        )}
      </div>
      {lessons.length === 0 ? (
        <p style={{ color: '#6b7280' }}>{t.lessons.empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lessons.map(lesson => {
            const status = lesson.status || 'pending'
            const dateStr = new Date(lesson.date).toLocaleDateString()
            const isEditing = editingId === lesson.id
            return (
              <div key={lesson.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Короткий заголовок */}
                    <div style={{ fontWeight: 600, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lesson.title || `${t.lessons.newLesson} #${lesson.id}`}
                    </div>
                    {/* Дата + описание */}
                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>
                      {dateStr} · {t.lessons.mediaCount(lesson.media_count)}
                      {lesson.description && (
                        <span style={{ marginLeft: 8, color: '#9ca3af' }}>— {lesson.description}</span>
                      )}
                      {lesson.progress && status !== 'done' && (
                        <span style={{ marginLeft: 8, color: STATUS_COLORS[status] }}>{lesson.progress}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* Статус */}
                    <span style={{ color: STATUS_COLORS[status], fontWeight: 600, fontSize: 13 }}>
                      {STATUS_ICONS[status]} {t.lessons.status[status]}
                    </span>

                    {/* Кнопка старта для студентов */}
                    {user?.role !== 'owner' && status === 'done' && (
                      <button
                        onClick={() => navigate(`/exercise-session?lesson_id=${lesson.id}`)}
                        style={{ padding: '5px 14px', borderRadius: 6, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        ▶ Начать
                      </button>
                    )}

                    {user?.role === 'owner' && (
                      <>
                        {/* Редактировать */}
                        <button
                          onClick={() => setEditingId(isEditing ? null : lesson.id)}
                          title="Редактировать урок"
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', backgroundColor: isEditing ? '#eef2ff' : '#fff', color: isEditing ? '#4f46e5' : '#6b7280', fontSize: 13, cursor: 'pointer' }}>
                          ✏️
                        </button>

                        {/* Добавить letter_fill */}
                        {status === 'done' && (
                          <button
                            onClick={() => handleAddLetterFill(lesson.id)}
                            disabled={addingLetters === lesson.id}
                            title="Добавить упражнения «Добавь букву»"
                            style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>
                            {addingLetters === lesson.id ? '⏳' : '🔤'}
                          </button>
                        )}

                        {/* Удалить */}
                        <button
                          onClick={() => handleDelete(lesson.id)}
                          disabled={deleting === lesson.id}
                          style={{ padding: '4px 10px', fontSize: 13, color: '#dc2626', backgroundColor: '#fff', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' }}>
                          {deleting === lesson.id ? '...' : '✕'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Форма редактирования */}
                {isEditing && (
                  <EditForm
                    lesson={lesson}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
