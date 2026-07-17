import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useOnline, OfflineNotice } from '../components/OfflineGuard.jsx'
import { useI18nStore } from '../store/i18n.js'

// Локальные строки новых полей (10 языков) — чтобы не трогать общий i18n
const NSTR = {
  ru: { word: 'Урок', descLabel: 'Описание (необязательно)', descHint: 'Кратко: о чём урок, что тренируем…', book: '📘 Учебник', bookHint: 'Фото страниц учебника', tetrad: '✏️ Тетрадь / доска', tetradHint: 'Свои слова с доски или тетради', selected: (n) => `Выбрано: ${n}` },
  uk: { word: 'Урок', descLabel: 'Опис (необов\'язково)', descHint: 'Коротко: про що урок, що тренуємо…', book: '📘 Підручник', bookHint: 'Фото сторінок підручника', tetrad: '✏️ Зошит / дошка', tetradHint: 'Свої слова з дошки або зошита', selected: (n) => `Обрано: ${n}` },
  en: { word: 'Lesson', descLabel: 'Description (optional)', descHint: 'Briefly: what the lesson is about…', book: '📘 Textbook', bookHint: 'Photos of textbook pages', tetrad: '✏️ Notebook / board', tetradHint: 'Your own words from the board or notebook', selected: (n) => `Selected: ${n}` },
  de: { word: 'Lektion', descLabel: 'Beschreibung (optional)', descHint: 'Kurz: worum es geht…', book: '📘 Lehrbuch', bookHint: 'Fotos der Lehrbuchseiten', tetrad: '✏️ Heft / Tafel', tetradHint: 'Eigene Wörter von Tafel oder Heft', selected: (n) => `Ausgewählt: ${n}` },
  bg: { word: 'Урок', descLabel: 'Описание (по избор)', descHint: 'Накратко: за какво е урокът…', book: '📘 Учебник', bookHint: 'Снимки на страници', tetrad: '✏️ Тетрадка / дъска', tetradHint: 'Свои думи от дъската или тетрадката', selected: (n) => `Избрани: ${n}` },
  tr: { word: 'Ders', descLabel: 'Açıklama (isteğe bağlı)', descHint: 'Kısaca: ders ne hakkında…', book: '📘 Ders kitabı', bookHint: 'Ders kitabı sayfaları', tetrad: '✏️ Defter / tahta', tetradHint: 'Tahtadan veya defterden kendi kelimeleriniz', selected: (n) => `Seçildi: ${n}` },
  ar: { word: 'درس', descLabel: 'وصف (اختياري)', descHint: 'باختصار: عن ماذا الدرس…', book: '📘 الكتاب', bookHint: 'صور صفحات الكتاب', tetrad: '✏️ الدفتر / السبورة', tetradHint: 'كلماتك من السبورة أو الدفتر', selected: (n) => `المحدد: ${n}` },
  es: { word: 'Lección', descLabel: 'Descripción (opcional)', descHint: 'Breve: de qué trata la lección…', book: '📘 Libro', bookHint: 'Fotos de las páginas del libro', tetrad: '✏️ Cuaderno / pizarra', tetradHint: 'Tus palabras de la pizarra o el cuaderno', selected: (n) => `Seleccionadas: ${n}` },
  fr: { word: 'Leçon', descLabel: 'Description (facultatif)', descHint: 'Brièvement : de quoi parle la leçon…', book: '📘 Manuel', bookHint: 'Photos des pages du manuel', tetrad: '✏️ Cahier / tableau', tetradHint: 'Tes propres mots du tableau ou du cahier', selected: (n) => `Sélectionnées : ${n}` },
  sq: { word: 'Mësimi', descLabel: 'Përshkrimi (opsional)', descHint: 'Shkurt: për çfarë është mësimi…', book: '📘 Libri', bookHint: 'Foto të faqeve të librit', tetrad: '✏️ Fletore / dërrasë', tetradHint: 'Fjalët e tua nga dërrasa ose fletorja', selected: (n) => `Zgjedhur: ${n}` },
}

// Раздел требует сервер/ИИ: guard-обёртка отдельным компонентом, чтобы ранний
// return не менял список хуков основного компонента (Rules of Hooks)
export default function NewLesson() {
  const online = useOnline()
  if (!online) return <OfflineNotice />
  return <NewLessonInner />
}

function NewLessonInner() {
  const [title, setTitle]   = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState([])       // фото учебника (textbook)
  const [extraPhotos, setExtraPhotos] = useState([]) // фото тетради/доски (extra)
  const [audios, setAudios] = useState([])
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState('')
  const [error, setError]   = useState('')
  const [nextNumber, setNextNumber] = useState(null) // автономер следующего урока
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const courseId  = searchParams.get('course_id')
  const { t, lang } = useI18nStore()
  const N = NSTR[lang] || NSTR.en
  const pollRef   = useRef(null)

  // Автономер урока: считаем следующий по порядку (в курсе или в общем пуле)
  useEffect(() => {
    api.get('/lessons').then(all => {
      const list = (all || []).filter(l => courseId ? String(l.course_id) === String(courseId) : !l.course_id)
      const maxNum = list.reduce((m, l) => Math.max(m, l.lesson_number || 0), 0)
      setNextNumber(maxNum + 1)
    }).catch(() => setNextNumber(null))
  }, [courseId])

  const addPhotos = useCallback((files) => {
    const newItems = files.filter(f => f.type.startsWith('image/')).map(file => ({ file, preview: URL.createObjectURL(file) }))
    setPhotos(prev => [...prev, ...newItems])
  }, [])

  const removePhoto = (idx) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addExtraPhotos = useCallback((files) => {
    const newItems = files.filter(f => f.type.startsWith('image/')).map(file => ({ file, preview: URL.createObjectURL(file) }))
    setExtraPhotos(prev => [...prev, ...newItems])
  }, [])

  const removeExtraPhoto = (idx) => {
    setExtraPhotos(prev => {
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
    else if (type === 'extra') addExtraPhotos(files)
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
          extraPhotos.forEach(p => URL.revokeObjectURL(p.preview))
          setTimeout(() => navigate(courseId ? `/courses/${courseId}` : '/'), 2500)
        } else if (res.status === 'error') {
          clearInterval(pollRef.current)
          setError(res.progress || 'Ошибка обработки')
          setStatus('error')
        }
      } catch {}
    }, 3000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      setStatus('creating')
      setProgress('')
      // Автозаголовок: «Урок N» по порядку, если тема не задана
      const autoTitle = nextNumber ? `${N.word} ${nextNumber}` : `${t.lessons.newLesson} ${new Date().toLocaleDateString()}`
      const lesson = await api.post('/lessons', {
        title: title.trim() || autoTitle,
        description: description.trim() || null,
        date: new Date().toISOString().slice(0, 10),
        course_id: courseId ? parseInt(courseId) : null,
        lesson_number: nextNumber || null,
      })
      setStatus('uploading')
      const totalFiles = photos.length + extraPhotos.length + audios.length
      setProgress(`0 / ${totalFiles} файлов`)
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(p => fd.append('files', p.file))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)  // источник: учебник (по умолчанию)
      }
      if (extraPhotos.length > 0) {
        const fd = new FormData()
        extraPhotos.forEach(p => fd.append('files', p.file))
        await uploadFiles(`/lessons/${lesson.id}/media?source=extra`, fd)  // источник: тетрадь/доска
      }
      if (audios.length > 0) {
        const fd = new FormData()
        audios.forEach(a => fd.append('files', a.file))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }
      setStatus('processing')
      setProgress('Запускаем...')
      await api.post(`/lessons/${lesson.id}/process`, {})
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

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t.lessons.lessonTopic}</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder={nextNumber ? `${N.word} ${nextNumber}` : t.lessons.topicPlaceholder} disabled={isProcessing}
            style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{N.descLabel}</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={N.descHint} disabled={isProcessing}
            rows={2} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        {/* 📘 Учебник (source=textbook) */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{N.book}</label>
          <DropZone onFiles={addPhotos} onDrop={e => handleDrop(e, "photo")} accept="image/*,application/pdf" idKey="book" label={N.bookHint} disabled={isProcessing} />
        </div>
        <PhotoGrid items={photos} onRemove={removePhoto} disabled={isProcessing} label={N.selected(photos.length)} />

        {/* ✏️ Тетрадь / доска (source=extra) */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{N.tetrad}</label>
          <DropZone onFiles={addExtraPhotos} onDrop={e => handleDrop(e, "extra")} accept="image/*,application/pdf" idKey="tetrad" label={N.tetradHint} disabled={isProcessing} />
        </div>
        <PhotoGrid items={extraPhotos} onRemove={removeExtraPhoto} disabled={isProcessing} label={N.selected(extraPhotos.length)} />

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{t.lessons.audio}</label>
          <DropZone onFiles={addAudio} onDrop={e => handleDrop(e, 'audio')} accept="audio/*" idKey="audio" multiple={false} label={t.lessons.audioHint} disabled={isProcessing} />
        </div>

        {audios.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'rgba(78,154,110,0.1)', borderRadius: 8, border: '1px solid rgba(78,154,110,0.3)' }}>
            <span style={{ fontSize: 24 }}>🎵</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audios[0].file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{(audios[0].file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            {!isProcessing && (
              <button type="button" onClick={() => setAudios([])} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 20, padding: 4 }}>×</button>
            )}
          </div>
        )}

        {status !== 'idle' && status !== 'error' && (
          <div style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, border: `1px solid ${status === 'done' ? 'var(--good)' : 'var(--accent)'}40` }}>
            <div style={{ fontWeight: 600, color: status === 'done' ? 'var(--good)' : 'var(--accent)', marginBottom: progress ? 6 : 0 }}>
              {statusLabel}
            </div>
            {progress && status === 'processing' && (
              <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{progress}</div>
            )}
            {status === 'processing' && (
              <div style={{ marginTop: 10, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, animation: 'pulse-bar 2s ease-in-out infinite', width: '40%' }} />
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(179,56,44,0.1)', borderRadius: 8, border: '1px solid rgba(179,56,44,0.3)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={(photos.length === 0 && extraPhotos.length === 0) || isProcessing}
          style={{ width: '100%', padding: '14px 32px', fontSize: 16, fontWeight: 700,
            background: (photos.length === 0 && extraPhotos.length === 0) || isProcessing ? 'var(--surface-2)' : 'var(--accent)',
            color: (photos.length === 0 && extraPhotos.length === 0) || isProcessing ? 'var(--ink-soft)' : 'var(--accent-ink)',
            border: 'none', borderRadius: 12, cursor: (photos.length === 0 && extraPhotos.length === 0) || isProcessing ? 'not-allowed' : 'pointer' }}>
          {isProcessing ? statusLabel : t.lessons.processBtn}
        </button>
      </form>

      <style>{`@keyframes pulse-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  )
}

// Сетка превью загруженных фото с кнопкой удаления
function PhotoGrid({ items, onRemove, disabled, label }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: 'var(--surface-2)' }}>
            <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {!disabled && (
              <button type="button" onClick={() => onRemove(idx)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, padding: '2px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {idx + 1}. {item.file.name.replace(/\.[^.]+$/, '')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DropZone({ onFiles, onDrop, accept, idKey, multiple = true, label, disabled }) {
  const [dragging, setDragging] = useState(false)
  const inputId = `upload-${idKey || accept}`
  return (
    <div
      onDrop={e => { if (!disabled) { e.preventDefault(); setDragging(false); onDrop(e) } }}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => { if (!disabled) document.getElementById(inputId).click() }}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 12, padding: '24px 16px', textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragging ? 'var(--accent-soft)' : disabled ? 'var(--surface-2)' : 'var(--surface)',
        marginBottom: 8, transition: 'all 0.2s', opacity: disabled ? 0.6 : 1,
      }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{accept.startsWith('image') ? '📷' : '🎵'}</div>
      <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>{label}</p>
      {/* Для фото — кнопка прямой съёмки камерой (мимо телефона/ноута/Google Photos) */}
      {accept.startsWith('image') && (
        <button type="button" disabled={disabled}
          onClick={e => { e.stopPropagation(); if (!disabled) document.getElementById(inputId + '-cam').click() }}
          style={{ marginTop: 10, padding: '8px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          📷 Сфотографировать
        </button>
      )}
      <input id={inputId} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={e => onFiles(Array.from(e.target.files))} disabled={disabled} />
      {accept.startsWith('image') && (
        <input id={inputId + '-cam'} type="file" accept="image/*" capture="environment" multiple={multiple} style={{ display: 'none' }}
          onChange={e => onFiles(Array.from(e.target.files))} disabled={disabled} />
      )}
    </div>
  )
}
