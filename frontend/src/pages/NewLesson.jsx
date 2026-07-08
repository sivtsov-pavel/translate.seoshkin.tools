import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

export default function NewLesson() {
  const [title, setTitle] = useState('')
  const [photos, setPhotos] = useState([])      // { file, preview }
  const [audios, setAudios] = useState([])      // { file }
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t } = useI18nStore()

  const addPhotos = useCallback((files) => {
    const newItems = files
      .filter(f => f.type.startsWith('image/'))
      .map(file => ({ file, preview: URL.createObjectURL(file) }))
    setPhotos(prev => [...prev, ...newItems])
  }, [])

  const removePhoto = (idx) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addAudio = useCallback((files) => {
    setAudios(files.slice(0, 1).map(file => ({ file })))
  }, [])

  const handleDrop = (e, type) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (type === 'photo') addPhotos(files)
    else addAudio(files)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      setStatus('creating')
      const lesson = await api.post('/lessons', {
        title: title || `${t.lessons.newLesson} ${new Date().toLocaleDateString()}`,
        date: new Date().toISOString().slice(0, 10),
      })

      setStatus('uploading')
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(p => fd.append('files', p.file))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }
      if (audios.length > 0) {
        const fd = new FormData()
        audios.forEach(a => fd.append('files', a.file))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }

      setStatus('processing')
      await api.post(`/lessons/${lesson.id}/process`, {})

      setStatus('done')
      photos.forEach(p => URL.revokeObjectURL(p.preview))
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const statusMsg = {
    creating:   t.lessons.processing.creating,
    uploading:  t.lessons.processing.uploading,
    processing: t.lessons.processing.processing,
    done:       t.lessons.processing.done,
  }
  const statusColor = { creating: '#4f46e5', uploading: '#4f46e5', processing: '#f59e0b', done: '#10b981' }

  const isProcessing = status !== 'idle' && status !== 'error'

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>{t.lessons.newLesson}</h1>
      <form onSubmit={handleSubmit}>

        {/* Тема урока */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
            {t.lessons.lessonTopic}
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t.lessons.topicPlaceholder}
            disabled={isProcessing}
            style={{ width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid #d1d5db', borderRadius: 8, boxSizing: 'border-box' }}
          />
        </div>

        {/* Зона загрузки фото */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{t.lessons.photos}</label>
          <DropZone
            onFiles={addPhotos}
            onDrop={e => handleDrop(e, 'photo')}
            accept="image/*"
            label={t.lessons.photoHint}
            disabled={isProcessing}
          />
        </div>

        {/* Превью загруженных фото */}
        {photos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {t.lessons.photosSelected(photos.length)}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: 8,
            }}>
              {photos.map((item, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', backgroundColor: '#f3f4f6' }}>
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* Кнопка удаления */}
                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 22, height: 22, borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1, padding: 0,
                      }}>
                      ×
                    </button>
                  )}
                  {/* Номер */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)', color: '#fff',
                    fontSize: 11, padding: '2px 4px', textAlign: 'center',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {idx + 1}. {item.file.name.replace(/\.[^.]+$/, '')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Аудио */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{t.lessons.audio}</label>
          <DropZone
            onFiles={addAudio}
            onDrop={e => handleDrop(e, 'audio')}
            accept="audio/*"
            multiple={false}
            label={t.lessons.audioHint}
            disabled={isProcessing}
          />
        </div>

        {/* Превью аудио */}
        {audios.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: 24 }}>🎵</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {audios[0].file.name}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {(audios[0].file.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
            {!isProcessing && (
              <button type="button" onClick={() => setAudios([])}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, padding: 4 }}>
                ×
              </button>
            )}
          </div>
        )}

        {/* Статус обработки */}
        {status !== 'idle' && status !== 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: 8, border: `1px solid ${statusColor[status]}30` }}>
            {status === 'processing' && <span style={{ fontSize: 20 }}>⏳</span>}
            {status === 'done'       && <span style={{ fontSize: 20 }}>✅</span>}
            <span style={{ color: statusColor[status], fontWeight: 600 }}>{statusMsg[status]}</span>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={photos.length === 0 || isProcessing}
          style={{
            width: '100%', padding: '14px 32px', fontSize: 16, fontWeight: 700,
            backgroundColor: photos.length === 0 || isProcessing ? '#e5e7eb' : '#4f46e5',
            color: photos.length === 0 || isProcessing ? '#9ca3af' : '#fff',
            border: 'none', borderRadius: 10, cursor: photos.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}>
          {isProcessing ? statusMsg[status] : t.lessons.processBtn}
        </button>
      </form>
    </div>
  )
}

// Компонент зоны drag-and-drop
function DropZone({ onFiles, onDrop, accept, multiple = true, label, disabled }) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      onDrop={e => { if (!disabled) { e.preventDefault(); setDragging(false); onDrop(e) } }}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => { if (!disabled) document.getElementById(`upload-${accept}`).click() }}
      style={{
        border: `2px dashed ${dragging ? '#4f46e5' : '#d1d5db'}`,
        borderRadius: 10, padding: '24px 16px', textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: dragging ? '#eef2ff' : disabled ? '#f9fafb' : '#fafafa',
        marginBottom: 8, transition: 'all 0.2s',
        opacity: disabled ? 0.6 : 1,
      }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{accept.startsWith('image') ? '📷' : '🎵'}</div>
      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{label}</p>
      <input
        id={`upload-${accept}`}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => onFiles(Array.from(e.target.files))}
        disabled={disabled}
      />
    </div>
  )
}
