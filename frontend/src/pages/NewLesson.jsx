import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import UploadZone from '../components/UploadZone.jsx'

export default function NewLesson() {
  const [title, setTitle] = useState('')
  const [photos, setPhotos] = useState([])
  const [audios, setAudios] = useState([])
  const [status, setStatus] = useState('idle') // idle | creating | uploading | processing | done | error
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { t } = useI18nStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      // 1. Создаём урок
      setStatus('creating')
      const lesson = await api.post('/lessons', {
        title: title || `${t.lessons.newLesson} ${new Date().toLocaleDateString()}`,
        date: new Date().toISOString().slice(0, 10),
      })

      // 2. Загружаем фото
      setStatus('uploading')
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(f => fd.append('files', f))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }

      // 3. Загружаем аудио
      if (audios.length > 0) {
        const fd = new FormData()
        audios.forEach(f => fd.append('files', f))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }

      // 4. Запускаем обработку через Claude
      setStatus('processing')
      await api.post(`/lessons/${lesson.id}/process`, {})

      setStatus('done')
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

  return (
    <div>
      <h1>{t.lessons.newLesson}</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            {t.lessons.lessonTopic}
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t.lessons.topicPlaceholder}
              style={{ display: 'block', width: '100%', padding: '10px 12px', fontSize: 16, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 6, boxSizing: 'border-box' }}
            />
          </label>
        </div>

        <h3 style={{ marginBottom: 8 }}>{t.lessons.photos}</h3>
        <UploadZone onFilesSelected={setPhotos} accept="image/*" label={t.lessons.photoHint} />
        {photos.length > 0 && (
          <p style={{ color: '#4f46e5', marginBottom: 12, fontWeight: 500 }}>{t.lessons.photosSelected(photos.length)}</p>
        )}

        <h3 style={{ marginBottom: 8 }}>{t.lessons.audio}</h3>
        <UploadZone onFilesSelected={setAudios} accept="audio/*" multiple={false} label={t.lessons.audioHint} />
        {audios.length > 0 && (
          <p style={{ color: '#4f46e5', marginBottom: 12, fontWeight: 500 }}>{t.lessons.audioSelected(audios[0].name)}</p>
        )}

        {status !== 'idle' && status !== 'error' && (
          <p style={{ color: status === 'done' ? '#10b981' : '#4f46e5', fontWeight: 600, marginBottom: 16 }}>
            {statusMsg[status]}
          </p>
        )}
        {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}

        <button
          type="submit"
          disabled={photos.length === 0 || status !== 'idle'}
          style={{
            padding: '14px 32px', fontSize: 16, fontWeight: 600,
            backgroundColor: photos.length === 0 || status !== 'idle' ? '#d1d5db' : '#4f46e5',
            color: '#fff', border: 'none', borderRadius: 8,
            cursor: photos.length === 0 || status !== 'idle' ? 'not-allowed' : 'pointer',
          }}>
          {t.lessons.processBtn}
        </button>
      </form>
    </div>
  )
}
