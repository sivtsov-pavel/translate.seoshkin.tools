import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

export default function NewLesson() {
  const [title, setTitle]   = useState('')
  const [photos, setPhotos] = useState([])   // { file, preview }
  const [audios, setAudios] = useState([])   // { file }
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState('')
  const [error, setError]   = useState('')
  const navigate  = useNavigate()
  const { t }     = useI18nStore()
  const pollRef   = useRef(null)

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

  const startPolling = (lessonId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/lessons/${lessonId}/status`)
        if (res.progress) setProgress(res.progress)

        if (res.status === 'done') {
          clearInterval(pollRef.current)
          setStatus('done')
          photos.forEach(p => URL.revokeObjectURL(p.preview))
          setTimeout(() => navigate('/'), 2500)
        } else if (res.status === 'error') {
          clearInterval(pollRef.current)
          setError(res.progress || 'Ошибка обработки')
          setStatus('error')
        }
      } catch {
        // сеть временно недоступна — продолжаем polling
      }
    }, 3000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      setStatus('creating')
      setProgress('')
      const lesson = await api.post('/lessons', {
        title: title || `${t.lessons.newLesson} ${new Date().toLocaleDateString()}`,
        date: new Date().toISOString().slice(0, 10),
      })

      setStatus('uploading')
      setProgress(`0 / ${photos.length + audios.length} файлов`)

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
      setProgress('Запускаем...')

      // Запускаем обработку — сервер отвечает сразу, не ждём завершения
      await api.post(`/lessons/${lesson.id}/process`, {})

      // Дальше опрашиваем статус каждые 3 секунды
      startPolling(lesson.id)
    } catch (err) {
      setError(err.message)
      setStatus('error')
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }

  const isProcessing = status !== 'idle' && status !== 'error'

  const statusLabel = {
    creating:   '⏳ Создаём урок...',
    uploading:  '⏳ Загружаем файлы...',
    processing: `⏳ Claude обрабатывает...`,
    done:       '✅ Готово!',
  }[status] || ''

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>{t.lessons.newLesson}</h1>
      <form onSubmit={handleSubmit}>

        {/* Тема урока */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t.lessons.lessonTopic}</label>
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
          <DropZone onFiles={addPhotos} onDrop={e => handleDrop(e, 'photo')} accept="image/*" label={t.lessons.photoHint} disabled={isProcessing} />
        </div>

        {/* Превью фото */}
        {photos.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              {t.lessons.photosSelected(photos.length)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
              {photos.map((item, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', backgroundColor: '#f3f4f6' }}>
                  <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {!isProcessing && (
                    <button type="button" onClick={() => removePhoto(idx)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, padding: '2px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          <DropZone onFiles={addAudio} onDrop={e => handleDrop(e, 'audio')} accept="audio/*" multiple={false} label={t.lessons.audioHint} disabled={isProcessing} />
        </div>

        {audios.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: 24 }}>🎵</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audios[0].file.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{(audios[0].file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            {!isProcessing && (
              <button type="button" onClick={() => setAudios([])} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, padding: 4 }}>×</button>
            )}
          </div>
        )}

        {/* Статус + прогресс */}
        {status !== 'idle' && status !== 'error' && (
          <div style={{ marginBottom: 16, padding: '14px 18px', backgroundColor: '#f9fafb', borderRadius: 10, border: `1px solid ${status === 'done' ? '#10b981' : '#4f46e5'}30` }}>
            <div style={{ fontWeight: 600, color: status === 'done' ? '#10b981' : '#4f46e5', marginBottom: progress ? 6 : 0 }}>
              {statusLabel}
            </div>
            {progress && status === 'processing' && (
              <div style={{ fontSize: 14, color: '#6b7280' }}>{progress}</div>
            )}
            {/* Анимированная полоска во время обработки */}
            {status === 'processing' && (
              <div style={{ marginTop: 10, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', backgroundColor: '#4f46e5', borderRadius: 2, animation: 'pulse-bar 2s ease-in-out infinite', width: '40%' }} />
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', color: '#dc2626' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={photos.length === 0 || isProcessing} style={{ width: '100%', padding: '14px 32px', fontSize: 16, fontWeight: 700, backgroundColor: photos.length === 0 || isProcessing ? '#e5e7eb' : '#4f46e5', color: photos.length === 0 || isProcessing ? '#9ca3af' : '#fff', border: 'none', borderRadius: 10, cursor: photos.length === 0 || isProcessing ? 'not-allowed' : 'pointer' }}>
          {isProcessing ? statusLabel : t.lessons.processBtn}
        </button>
      </form>

      <style>{`
        @keyframes pulse-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  )
}

function DropZone({ onFiles, onDrop, accept, multiple = true, label, disabled }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDrop={e => { if (!disabled) { e.preventDefault(); setDragging(false); onDrop(e) } }}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => { if (!disabled) document.getElementById(`upload-${accept}`).click() }}
      style={{ border: `2px dashed ${dragging ? '#4f46e5' : '#d1d5db'}`, borderRadius: 10, padding: '24px 16px', textAlign: 'center', cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor: dragging ? '#eef2ff' : disabled ? '#f9fafb' : '#fafafa', marginBottom: 8, transition: 'all 0.2s', opacity: disabled ? 0.6 : 1 }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{accept.startsWith('image') ? '📷' : '🎵'}</div>
      <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>{label}</p>
      <input id={`upload-${accept}`} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }} onChange={e => onFiles(Array.from(e.target.files))} disabled={disabled} />
    </div>
  )
}
