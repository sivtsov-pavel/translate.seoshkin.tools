import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { useAdminOpStore } from '../store/adminOp.js'

// Колонка слов (учебник / тетрадь): textarea + чипы-слова, тап по чипу перекидывает в другой список
function WordCol({ title, text, setText, onMove, moveHint }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return (
    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>
        {title} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {lines.length}</span>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder={"der Hund — собака\ndie Katze — кошка"} rows={4}
        style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13 }} />
      {lines.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {lines.map((line, i) => (
            <button key={i} type="button" onClick={() => onMove(line)} title={moveHint}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line} ⇄
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EditForm({ lesson, onSave, onCancel }) {
  const [title, setTitle]       = useState(lesson.title || '')
  const [desc, setDesc]         = useState(lesson.description || '')
  const [bookText, setBookText]   = useState(lesson.text_content || '')
  const [extraText, setExtraText] = useState(lesson.text_content_extra || '')
  const [saving, setSaving]     = useState(false)

  // Перекинуть строку-слово между списками
  const moveLine = (line, from) => {
    const rm = (t) => t.split('\n').filter(l => l.trim() !== line.trim()).join('\n')
    const add = (t) => (t.trim() ? t.replace(/\n+$/, '') + '\n' : '') + line
    if (from === 'book') { setBookText(rm); setExtraText(add) }
    else { setExtraText(rm); setBookText(add) }
  }
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()
  const camRef = useRef()
  const sourceRef = useRef('textbook')  // какой источник грузим: учебник / тетрадь

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.patch(`/lessons/${lesson.id}`, {
        title: title.trim() || null,
        description: desc.trim() || null,
        text_content: bookText.trim(),
        text_content_extra: extraText.trim(),
      })
      onSave(updated)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const pickFiles = (source) => { sourceRef.current = source; fileRef.current?.click() }
  // Открыть камеру напрямую (сфотографировать сейчас), а не выбрать существующий файл
  const pickCamera = (source) => { sourceRef.current = source; camRef.current?.click() }

  const uploadMedia = async (files) => {
    if (!files.length) return
    setUploading(true)
    try {
      const form = new FormData()
      for (const f of files) form.append('file', f)
      await uploadFiles(`/lessons/${lesson.id}/media?source=${sourceRef.current}`, form)
      alert(`Загружено (${sourceRef.current === 'extra' ? 'тетрадь/доска' : 'учебник'}): ${files.length} файл(ов)`)
    } catch (e) {
      alert('Ошибка загрузки: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--line)' }}>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Название урока</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Lektion 1" style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Описание</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Тема урока, особенности группы..." rows={2}
          style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>
          Слова урока
          <span style={{ fontWeight: 400, marginLeft: 6, opacity: 0.7 }}>— Claude разберёт и создаст упражнения. Тапни слово-чип, чтобы перекинуть в другой список.</span>
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <WordCol title="📘 Из учебника" text={bookText} setText={setBookText} onMove={line => moveLine(line, 'book')} moveHint="Перекинуть в тетрадь" />
          <WordCol title="✏️ Из тетради/доски" text={extraText} setText={setExtraText} onMove={line => moveLine(line, 'extra')} moveHint="Перекинуть в учебник" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '7px 18px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {saving ? '...' : '✓ Сохранить'}
        </button>
        <button onClick={() => pickFiles('textbook')} disabled={uploading}
          title="Слова из учебника (базовые)"
          style={{ padding: '7px 14px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          {uploading ? '⏳...' : '📁 Из учебника'}
        </button>
        <button type="button" onClick={() => pickCamera('textbook')} disabled={uploading}
          title="Сфотографировать страницу учебника"
          style={{ padding: '7px 10px', background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          📷
        </button>
        <button onClick={() => pickFiles('extra')} disabled={uploading}
          title="Тетрадь, доска, дополнительные слова"
          style={{ padding: '7px 14px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          {uploading ? '⏳...' : '📁 Из тетради/доски'}
        </button>
        <button type="button" onClick={() => pickCamera('extra')} disabled={uploading}
          title="Сфотографировать тетрадь/доску"
          style={{ padding: '7px 10px', background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          📷
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*,application/pdf" style={{ display: 'none' }}
          onChange={e => uploadMedia([...e.target.files])} />
        {/* Отдельный инпут с capture — открывает камеру устройства напрямую, а не пикер файлов */}
        <input ref={camRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
          onChange={e => uploadMedia([...e.target.files])} />
        <button onClick={onCancel}
          style={{ padding: '7px 12px', background: 'none', color: 'var(--ink-soft)', border: 'none', cursor: 'pointer', fontSize: 13 }}>
          Отмена
        </button>
      </div>
    </div>
  )
}

export default function LessonList() {
  const [lessons, setLessons]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [deleting, setDeleting]       = useState(null)
  const [addingLetters, setAddingLetters] = useState(null)
  const [addingDictation, setAddingDictation] = useState(null)
  const [addingSpeech, setAddingSpeech]       = useState(null)
  const [regenId, setRegenId]         = useState(null)
  const [processing, setProcessing]   = useState(null)
  const [editingId, setEditingId]     = useState(null)
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const adminOp = useAdminOpStore()
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/lessons').then(setLessons).finally(() => setLoading(false))
  }, [])

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

  // «Обработать всё» для готового урока: докидывает переводы, картинки, переводы упражнений
  const handleEnrich = async (id) => {
    setProcessing(id)
    setLessons(prev => prev.map(l => l.id === id ? { ...l, status: 'processing', progress: 'Дополняю недостающее...' } : l))
    try {
      await api.post(`/lessons/${id}/enrich`, {})
      const poll = setInterval(async () => {
        const updated = await api.get(`/lessons/${id}`)
        setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l))
        if (updated.status !== 'processing') { clearInterval(poll); setProcessing(null) }
      }, 3000)
    } catch (e) { alert('Ошибка: ' + e.message); setProcessing(null) }
  }

  // «Перераспределить» — разбить урок на тематические под-уроки (14 → 14.1, 14.2…)
  const handleRedistribute = async (id) => {
    if (!window.confirm('Разбить урок на тематические под-уроки (14.1, 14.2…) по темам слов? Исходный урок останется. Создаст новые уроки и упражнения.')) return
    setProcessing(id)
    setLessons(prev => prev.map(l => l.id === id ? { ...l, status: 'processing', progress: 'Разбиваю на темы...' } : l))
    try {
      await api.post(`/lessons/${id}/redistribute`, {})
      const poll = setInterval(async () => {
        const updated = await api.get(`/lessons/${id}`)
        setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l))
        if (updated.status !== 'processing') { clearInterval(poll); setProcessing(null); api.get('/lessons').then(setLessons).catch(() => {}) }
      }, 3000)
    } catch (e) { alert('Ошибка: ' + e.message); setProcessing(null) }
  }

  // «Нарисовать недостающие картинки» — детсадовские ИИ-иллюстрации (тратит OpenAI)
  const handleDrawImages = async (id) => {
    if (!window.confirm('Нарисовать детские картинки для слов без фото? Это использует генерацию OpenAI (платно).')) return
    setProcessing(id)
    setLessons(prev => prev.map(l => l.id === id ? { ...l, status: 'processing', progress: 'Рисую картинки...' } : l))
    try {
      await api.post(`/lessons/${id}/draw-images`, {})
      const poll = setInterval(async () => {
        const updated = await api.get(`/lessons/${id}`)
        setLessons(prev => prev.map(l => l.id === id ? { ...l, ...updated } : l))
        if (updated.status !== 'processing') { clearInterval(poll); setProcessing(null) }
      }, 4000)
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

  const handleAddSpeech = async (id) => {
    setAddingSpeech(id)
    try {
      const res = await api.post(`/lessons/${id}/add-speech`, {})
      alert(`Добавлено ${res.added} упражнений "Произношение"!`)
    } catch (e) {
      if (e.message && e.message.includes('уже добавлен')) {
        alert('✓ Упражнения на произношение уже добавлены в этот урок')
      } else {
        alert('Ошибка: ' + e.message)
      }
    } finally { setAddingSpeech(null) }
  }

  const handleRegen = async (lesson) => {
    if (!window.confirm(`Пересоздать упражнения для «${lesson.title}»?\nСтарые упражнения и прогресс удалятся.`)) return
    setRegenId(lesson.id)
    setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, status: 'processing', progress: 'Генерирую упражнения...' } : l))
    try {
      await api.post(`/lessons/${lesson.id}/regenerate`, {})
      const poll = setInterval(async () => {
        const updated = await api.get(`/lessons/${lesson.id}`)
        setLessons(prev => prev.map(l => l.id === lesson.id ? { ...l, ...updated } : l))
        if (updated.status !== 'processing') { clearInterval(poll); setRegenId(null) }
      }, 3000)
    } catch (e) { alert('Ошибка: ' + e.message); setRegenId(null) }
  }

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

  // Суммарная статистика по всем урокам
  const totalWords    = lessons.reduce((s, l) => s + (l.words_total || 0), 0)
  const doneWords     = lessons.reduce((s, l) => s + (l.status === 'done' ? (l.words_total || 0) : 0), 0)
  const donePct       = totalWords > 0 ? Math.round(doneWords / totalWords * 100) : 0
  const doneLessons   = lessons.filter(l => l.status === 'done').length

  return (
    <div style={{ paddingBottom: 20 }}>
      <h1 style={{ margin: '0 0 16px', fontFamily: 'Georgia,serif', fontSize: 22 }}>
        {t.lessons.title}
        {user?.role === 'owner' && <span style={{ fontSize: 14, color: 'var(--ink-soft)', fontFamily: 'inherit', fontWeight: 400, marginLeft: 12 }}>вид учителя</span>}
      </h1>

      {/* Прогресс-бар словаря */}
      {totalWords > 0 && (
        <div style={{ marginBottom: 20, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{doneWords} / {totalWords} слов</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{donePct}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${donePct}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            {doneLessons} из {lessons.length} уроков готовы
          </div>
        </div>
      )}

      {/* Статус admin-операции */}
      {user?.role === 'owner' && adminOp.status === 'running' && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
          ⏳ {adminOp.name} {adminOp.total > 0 ? `${adminOp.done}/${adminOp.total}` : '...'}
        </div>
      )}

      {lessons.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>{t.lessons.empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lessons.map(lesson => {
            const status = lesson.status || 'pending'
            const isEditing = editingId === lesson.id
            const dateStr = lesson.date ? new Date(lesson.date).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

            return (
              <div key={lesson.id} style={{
                border: '1px solid var(--line)', borderRadius: 12,
                padding: '14px 16px', background: 'var(--surface)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  {/* Левая часть: название + мета */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>
                      {lesson.title || `${t.lessons.newLesson} #${lesson.id}`}
                    </div>
                    {lesson.description && (
                      <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', marginBottom: 4 }}>
                        {lesson.description}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {dateStr && <span>{dateStr}</span>}
                      {lesson.media_count > 0 && <span>{lesson.media_count} файл{lesson.media_count === 1 ? '' : lesson.media_count < 5 ? 'а' : 'ов'}</span>}
                      {lesson.words_total > 0 && <span>{lesson.words_total} слов</span>}
                    </div>

                    {/* Прогресс обработки */}
                    {lesson.progress && status === 'processing' && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--accent-soft)', borderRadius: 8, border: '1px solid var(--accent)', fontSize: 12, color: 'var(--accent)' }}>
                        ⏳ {lesson.progress}
                      </div>
                    )}
                    {lesson.progress && status === 'error' && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(179,56,44,0.08)', borderRadius: 8, border: '1px solid var(--red)', fontSize: 12, color: 'var(--red)' }}>
                        ✗ {lesson.progress}
                      </div>
                    )}
                  </div>

                  {/* Правая часть: статус + кнопки */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    {/* Статус-бейдж */}
                    <StatusBadge status={status} />

                    {/* Действия */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {user?.role !== 'owner' && status === 'done' && (
                        <button onClick={() => navigate(`/exercise-session?lesson_id=${lesson.id}`)}
                          style={actionBtn('var(--accent)', 'var(--accent-ink)')}>
                          ▶ Начать
                        </button>
                      )}

                      {/* Тренер по этому уроку — тренируется на словах урока */}
                      {status === 'done' && lesson.words_total > 0 && (
                        <button onClick={() => navigate(`/ai-trainer?lesson_id=${lesson.id}&lesson_title=${encodeURIComponent(lesson.title || '')}`)}
                          title="Поговорить с AI-тренером по словам этого урока"
                          style={actionBtn('var(--surface-2)', 'var(--accent)', true)}>
                          🗣️
                        </button>
                      )}

                      {user?.role === 'owner' && (
                        <>
                          {(status === 'pending' || status === 'error') && (
                            <button onClick={() => handleProcess(lesson.id)} disabled={processing === lesson.id}
                              style={actionBtn('var(--accent)', 'var(--accent-ink)')}>
                              {processing === lesson.id ? '⏳' : '▶ Обработать'}
                            </button>
                          )}
                          {status === 'done' && (
                            <button onClick={() => handleEnrich(lesson.id)} disabled={processing === lesson.id}
                              title="Дополнить недостающее: переводы, картинки, переводы упражнений на все языки"
                              style={actionBtn('var(--accent)', 'var(--accent-ink)')}>
                              {processing === lesson.id ? '⏳' : '✨ Обработать всё'}
                            </button>
                          )}
                          {status === 'done' && (
                            <button onClick={() => handleDrawImages(lesson.id)} disabled={processing === lesson.id}
                              title="Нарисовать детские ИИ-картинки для слов без фото (платно)"
                              style={actionBtn('var(--surface-2)', 'var(--ink-soft)', true)}>
                              {processing === lesson.id ? '⏳' : '🎨'}
                            </button>
                          )}
                          {status === 'done' && (
                            <button onClick={() => handleRedistribute(lesson.id)} disabled={processing === lesson.id}
                              title="Разбить урок на тематические под-уроки (14.1, 14.2…). Исходный останется."
                              style={actionBtn('var(--surface-2)', 'var(--ink-soft)', true)}>
                              {processing === lesson.id ? '⏳' : '🧩 Перераспределить'}
                            </button>
                          )}
                          <button onClick={() => setEditingId(isEditing ? null : lesson.id)}
                            style={actionBtn(isEditing ? 'var(--accent)' : 'var(--surface-2)', isEditing ? 'var(--accent-ink)' : 'var(--ink-soft)', true)}>
                            ✏️
                          </button>
                          {lesson.words_total > 0 && (
                            <button onClick={() => handleRegen(lesson)} disabled={regenId === lesson.id || status === 'processing'}
                              title="Пересоздать упражнения"
                              style={actionBtn('var(--surface-2)', 'var(--ink-soft)', true)}>
                              {regenId === lesson.id ? '⏳' : '⚙️'}
                            </button>
                          )}
                          {status === 'done' && (
                            <>
                              <button onClick={() => handleAddLetterFill(lesson.id)} disabled={addingLetters === lesson.id}
                                title="Добавить «Добавь букву»"
                                style={actionBtn('var(--surface-2)', 'var(--ink-soft)', true)}>
                                {addingLetters === lesson.id ? '⏳' : '🔤'}
                              </button>
                              <button onClick={() => handleAddDictation(lesson.id)} disabled={addingDictation === lesson.id}
                                title="Добавить диктант"
                                style={actionBtn('var(--surface-2)', 'var(--ink-soft)', true)}>
                                {addingDictation === lesson.id ? '⏳' : '🎙️'}
                              </button>
                            </>
                          )}
                          <button onClick={() => handleDelete(lesson.id)} disabled={deleting === lesson.id}
                            style={actionBtn('transparent', 'var(--red)', true, 'var(--red)')}>
                            {deleting === lesson.id ? '...' : '✕'}
                          </button>
                        </>
                      )}
                    </div>
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
  )
}

function StatusBadge({ status }) {
  const cfg = {
    done:       { label: '✓ готов',      bg: 'rgba(78,154,110,0.12)',    color: 'var(--good)' },
    processing: { label: '⏳ обработка', bg: 'rgba(201,165,74,0.12)',    color: 'var(--accent)' },
    pending:    { label: '○ ожидает',   bg: 'var(--surface-2)',          color: 'var(--ink-soft)' },
    error:      { label: '✗ ошибка',    bg: 'rgba(179,56,44,0.12)',      color: 'var(--red)' },
  }
  const { label, bg, color } = cfg[status] || cfg.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 20,
      background: bg, color, fontSize: 12, fontWeight: 700,
    }}>
      {label}
    </span>
  )
}

const actionBtn = (bg, color, icon = false, borderColor) => ({
  padding: icon ? '5px 8px' : '5px 12px',
  borderRadius: 8,
  border: `1px solid ${borderColor || 'var(--line)'}`,
  background: bg, color,
  fontSize: 13, fontWeight: icon ? 400 : 600,
  cursor: 'pointer',
})
