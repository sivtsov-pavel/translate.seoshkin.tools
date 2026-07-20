import { useEffect, useState, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import CoursePlaceholder from '../components/CoursePlaceholder.jsx'

const STATUS_COLOR = { pending: 'var(--ink-soft)', processing: '#f59e0b', done: 'var(--good)', error: 'var(--red)' }
const STATUS_ICON  = { pending: '○', processing: '⏳', done: '✓', error: '✗' }

export default function CourseView() {
  const { id } = useParams()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [allLessons, setAllLessons] = useState([])
  const [attachId, setAttachId]   = useState('')
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef()
  const pdfInputRef = useRef()
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const c = t.courses

  const load = () => api.get(`/courses/${id}/lessons`).then(setData).finally(() => setLoading(false))
  const loadAllLessons = () => api.get('/lessons').then(ls => setAllLessons(ls.filter(l => !l.course_id || String(l.course_id) !== id)))

  useEffect(() => { load(); if (user?.role === 'owner') loadAllLessons() }, [id])

  const handleRename = async (e) => {
    e.preventDefault()
    if (!editTitle.trim()) return
    await api.patch(`/courses/${id}`, { title: editTitle })
    setData(d => ({ ...d, course: { ...d.course, title: editTitle } }))
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!window.confirm(c.deleteConfirm)) return
    await api.delete(`/courses/${id}`)
    navigate('/courses')
  }

  const handleCoverPick = () => coverInputRef.current?.click()

  // Массовая загрузка курса одним PDF → уроки (по N страниц на урок)
  const handlePdfPick = () => pdfInputRef.current?.click()
  const handlePdfUpload = async (file) => {
    if (!file) return
    const ans = window.prompt('Сколько страниц PDF на один урок? (1 = каждая страница отдельный урок; 4 = по 4 страницы)', '1')
    if (ans === null) return
    const perLesson = Math.min(Math.max(parseInt(ans) || 1, 1), 10)
    if (!window.confirm(`Загрузить курс из PDF по ${perLesson} стр. на урок? Каждый урок обработается ИИ (тратит токены OpenAI). Продолжить?`)) return
    setUploadingPdf(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await uploadFiles(`/courses/${id}/upload-pdf?pages_per_lesson=${perLesson}`, form)
      alert(`Создано уроков: ${res.lessons}. Обрабатываются в фоне — следи за индикатором ⏳ в правом верхнем углу.`)
      setTimeout(load, 3000)
    } catch (e) {
      alert('Ошибка: ' + e.message)
    } finally {
      setUploadingPdf(false)
    }
  }

  // Ученик: сохранить расписание дрип-выдачи (учебные дни + дата старта)
  const saveSchedule = async (weekdays, startDate) => {
    try {
      await api.put(`/courses/${id}/schedule`, { weekdays, start_date: startDate })
      await load()
    } catch (e) { alert('Ошибка: ' + e.message) }
  }

  // Ученик: «Сбросить достижения — начать заново» (удаляет весь прогресс по курсу → снова с 1-го урока)
  const [resetting, setResetting] = useState(false)
  const resetProgress = async () => {
    if (!window.confirm('Сбросить все достижения по этому курсу и начать заново с первого урока? Прогресс будет удалён.')) return
    setResetting(true)
    try {
      await api.post('/exercises/reset-all', { course_id: parseInt(id) })
      await load()
      alert('Готово! Прогресс сброшен — начинай с первого урока.')
    } catch (e) { alert('Ошибка: ' + e.message) }
    finally { setResetting(false) }
  }

  const handleCoverUpload = async (file) => {
    if (!file) return
    setUploadingCover(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const updated = await uploadFiles(`/courses/${id}/cover`, form)
      setData(d => ({ ...d, course: { ...d.course, cover_image_url: updated.cover_image_url } }))
    } catch (e) {
      alert('Ошибка загрузки: ' + e.message)
    } finally {
      setUploadingCover(false)
    }
  }

  const handleCoverRemove = async () => {
    await api.delete(`/courses/${id}/cover`)
    setData(d => ({ ...d, course: { ...d.course, cover_image_url: null } }))
  }

  if (loading) return <p>{c.loading}</p>
  if (!data)   return <p>{t.common.error}</p>

  const { course, lessons } = data

  return (
    <div style={{ paddingTop: 30 }}>
      <Link to="/courses" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }}>{c.back}</Link>

      <div style={{
        position: 'relative', width: 160, aspectRatio: '3/4', borderRadius: 14,
        overflow: 'hidden', margin: '16px 0', boxShadow: '0 4px 16px rgba(0,0,0,.15)',
        cursor: user?.role === 'owner' ? 'pointer' : 'default',
      }}
        onClick={user?.role === 'owner' ? handleCoverPick : undefined}>
        {course.cover_image_url ? (
          <img src={course.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <CoursePlaceholder title={course.title} />
        )}
        {uploadingCover && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13 }}>
            ⏳
          </div>
        )}
      </div>
      {user?.role === 'owner' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button type="button" onClick={handleCoverPick} disabled={uploadingCover} style={btnSecondary}>
            {course.cover_image_url ? '🖼 Сменить обложку' : '🖼 Загрузить обложку'}
          </button>
          {course.cover_image_url && (
            <button type="button" onClick={handleCoverRemove} style={btnSecondary}>Убрать обложку</button>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleCoverUpload(e.target.files[0])} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, margin: '16px 0 24px', flexWrap: 'wrap' }}>
        {editing ? (
          <form onSubmit={handleRename} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 240 }}>
            <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ flex: 1, fontSize: 18 }} />
            <button type="submit" style={btnPrimary}>{c.assign}</button>
            <button type="button" onClick={() => setEditing(false)} style={btnSecondary}>{t.common.cancel}</button>
          </form>
        ) : (
          <>
            <h1 style={{ margin: 0, flex: 1 }}>{course.title}</h1>
            {user?.role === 'owner' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setEditTitle(course.title); setEditing(true) }} style={btnSecondary}>{c.edit}</button>
                <button onClick={handleDelete} style={btnDanger}>{c.delete}</button>
              </div>
            )}
          </>
        )}
      </div>

      {course.description && (
        <p style={{ color: 'var(--ink-soft)', marginTop: -16, marginBottom: 20 }}>{course.description}</p>
      )}

      {user?.role === 'owner' && (
        <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to={`/lessons/new?course_id=${id}`} style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-block' }}>
            + {c.addLesson}
          </Link>
          {/* Массовая загрузка всего курса одним PDF (1 страница = 1 урок) */}
          <input ref={pdfInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handlePdfUpload(f) }} />
          <button onClick={handlePdfPick} disabled={uploadingPdf}
            title="Загрузить весь курс одним PDF — каждая страница станет отдельным уроком"
            style={{ ...btnSecondary, cursor: uploadingPdf ? 'default' : 'pointer', opacity: uploadingPdf ? 0.6 : 1 }}>
            {uploadingPdf ? '⏳ Загружаю…' : '📦 Загрузить курс (PDF)'}
          </button>
          {/* Удалить все уроки курса (для чистой перезаливки PDF) */}
          {lessons.length > 0 && (
            <button onClick={async () => {
              if (!window.confirm(`Удалить ВСЕ уроки курса (${lessons.length})? Слова и упражнения тоже удалятся. Сам курс останется.`)) return
              if (window.prompt('Для подтверждения введи: УДАЛИТЬ') !== 'УДАЛИТЬ') { alert('Отменено'); return }
              try { const r = await api.delete(`/courses/${id}/lessons`); alert(`Удалено уроков: ${r.deleted}`); load() }
              catch (e) { alert('Ошибка: ' + e.message) }
            }} style={{ ...btnSecondary, borderColor: 'var(--red, #d64545)', color: 'var(--red, #d64545)' }}>
              🗑 Удалить все уроки
            </button>
          )}
          {/* Повтор ошибочных уроков (напр. после пополнения OpenAI) */}
          {lessons.some(l => l.status === 'error') && (
            <button onClick={async () => {
              const n = lessons.filter(l => l.status === 'error').length
              if (!window.confirm(`Повторить обработку ${n} уроков с ошибкой? (нужна доступная квота OpenAI)`)) return
              try { const r = await api.post(`/courses/${id}/retry-failed`); alert(`Отправлено на повтор: ${r.retry}. Идёт в фоне.`); setTimeout(load, 3000) }
              catch (e) { alert('Ошибка: ' + e.message) }
            }} style={{ ...btnSecondary, borderColor: 'var(--red, #d64545)', color: 'var(--red, #d64545)' }}>
              🔁 Повторить ошибочные ({lessons.filter(l => l.status === 'error').length})
            </button>
          )}
          {allLessons.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select value={attachId} onChange={e => setAttachId(e.target.value)} style={{ fontSize: 14, maxWidth: 280 }}>
                <option value="">Прикрепить существующий урок...</option>
                {allLessons.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.title || `Урок от ${new Date(l.date).toLocaleDateString()}`}
                    {l.course_id ? ' (из другого курса)' : ''}
                  </option>
                ))}
              </select>
              <button disabled={!attachId}
                onClick={async () => {
                  await api.patch(`/lessons/${attachId}/course`, { course_id: parseInt(id), lesson_number: null })
                  setAttachId('')
                  await Promise.all([load(), loadAllLessons()])
                }}
                style={{ ...btnPrimary, opacity: attachId ? 1 : 0.4, cursor: attachId ? 'pointer' : 'default' }}>
                Прикрепить
              </button>
            </div>
          )}
        </div>
      )}

      {/* Ученик: расписание дрип-выдачи (учебные дни → уроки открываются по одному).
          Пока календарь не выбран (needs_schedule) — уроки закрыты, показываем как обязательный шаг. */}
      {user?.role !== 'owner' && lessons.some(l => l.status === 'done') && (
        <>
          <SchedulePicker key={id} schedule={data.schedule} onSave={saveSchedule} required={data.needs_schedule} />
          {/* «Начать заново» — сброс достижений по курсу (для перепрохождения) */}
          <div style={{ margin: '-8px 0 20px' }}>
            <button onClick={resetProgress} disabled={resetting}
              title="Удалить прогресс по курсу и начать с первого урока"
              style={{ fontSize: 12.5, padding: '7px 14px', background: 'var(--surface)', color: 'var(--red)', border: '1px solid rgba(179,56,44,0.4)', borderRadius: 9, cursor: resetting ? 'default' : 'pointer', fontWeight: 600, opacity: resetting ? 0.6 : 1 }}>
              {resetting ? '…' : '🔄 Сбросить достижения — начать заново'}
            </button>
          </div>
        </>
      )}

      {lessons.length === 0 ? (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
          {c.noLessons}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lessons.map(lesson => (
            <LessonRow key={lesson.id} lesson={lesson} c={c} courseId={id} isOwner={user?.role === 'owner'} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  )
}

// Ученик выбирает удобные дни недели + дату старта → уроки открываются по одному в каждый учебный день
const WEEKDAY_LABELS = [['1','Пн'],['2','Вт'],['3','Ср'],['4','Чт'],['5','Пт'],['6','Сб'],['7','Вс']]
function SchedulePicker({ schedule, onSave, required }) {
  const [days, setDays] = useState(() => new Set((schedule?.weekdays || [1,3,5]).map(String)))
  const [start, setStart] = useState(() => (schedule?.start_date ? String(schedule.start_date).slice(0,10) : new Date().toISOString().slice(0,10)))
  const [saving, setSaving] = useState(false)
  const toggle = (d) => setDays(s => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n })
  const submit = async () => {
    if (!days.size) { alert('Выбери хотя бы один день'); return }
    setSaving(true)
    await onSave([...days].map(Number).sort(), start)
    setSaving(false)
  }
  return (
    <div style={{ marginBottom: 20, padding: 16, background: required ? 'var(--accent-soft)' : 'var(--surface-2)', border: `${required ? 2 : 1}px solid ${required ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        {required ? '📅 Выбери календарь обучения' : '🗓️ Моё расписание'}
      </div>
      <div style={{ fontSize: 12.5, color: required ? 'var(--accent)' : 'var(--ink-soft)', marginBottom: 12, fontWeight: required ? 600 : 400 }}>
        {required
          ? 'Чтобы открыть уроки — выбери удобные дни недели. Уроки будут открываться по одному в каждый учебный день (и только после того, как пройдёшь предыдущий).'
          : 'Выбери удобные дни — в каждый такой день будет открываться новый урок, придёт напоминание.'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {WEEKDAY_LABELS.map(([d, lbl]) => (
          <button key={d} onClick={() => toggle(d)}
            style={{
              width: 44, height: 40, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${days.has(d) ? 'var(--accent)' : 'var(--line)'}`,
              background: days.has(d) ? 'var(--accent)' : 'var(--surface)',
              color: days.has(d) ? 'var(--accent-ink)' : 'var(--ink-soft)',
            }}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Старт:
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            style={{ marginLeft: 6, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }} />
        </label>
        <button onClick={submit} disabled={saving}
          style={{ padding: '8px 18px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          {saving ? '…' : (schedule ? 'Обновить' : 'Сохранить')}
        </button>
      </div>
    </div>
  )
}

function LessonRow({ lesson, c, courseId, isOwner, onUpdate }) {
  const navigate = useNavigate()
  const [editNum, setEditNum] = useState(String(lesson.lesson_number ?? ''))
  const [saving, setSaving]   = useState(false)
  const [regen, setRegen]     = useState(false)
  const status = lesson.status || 'pending'

  const saveNumber = async () => {
    setSaving(true)
    try {
      await api.patch(`/lessons/${lesson.id}/course`, { course_id: parseInt(courseId), lesson_number: editNum ? parseInt(editNum) : null })
      onUpdate()
    } finally {
      setSaving(false)
    }
  }

  const handleRegen = async () => {
    if (!window.confirm(`Пересоздать упражнения для «${lesson.title}»? Старые упражнения будут удалены.`)) return
    setRegen(true)
    try {
      await api.post(`/lessons/${lesson.id}/regenerate`, {})
      setTimeout(onUpdate, 3000)
    } finally {
      setRegen(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', flexWrap: 'wrap' }}>
      {isOwner ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{c.lessonNum}</span>
          <input type="number" value={editNum} onChange={e => setEditNum(e.target.value)} onBlur={saveNumber} min={1} style={{ width: 56, textAlign: 'center' }} />
        </div>
      ) : lesson.lesson_number ? (
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>#{lesson.lesson_number}</span>
      ) : null}

      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{lesson.title || '—'}</div>
        {lesson.date && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{new Date(lesson.date).toLocaleDateString()}</div>}
        {lesson.words_total > 0 && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {lesson.words_total} слов · {lesson.exercises_total ?? '?'} упр.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: STATUS_COLOR[status], fontSize: 14 }}>{STATUS_ICON[status]}</span>
          <span style={{ fontSize: 12, color: STATUS_COLOR[status], fontWeight: 600 }}>
            {lesson.status === 'processing' && lesson.progress ? lesson.progress : status}
          </span>
        </div>
        {isOwner && (
          <button
            onClick={handleRegen}
            disabled={regen || lesson.status === 'processing'}
            title="Пересоздать упражнения из существующих слов (без сканирования фото)"
            style={{ fontSize: 12, padding: '4px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
            {regen ? '⏳' : '⚙️ Упражнения'}
          </button>
        )}
        {/* Ученик/учитель: открыть готовый урок; для ученика с дрип-расписанием — замок до даты открытия */}
        {status === 'done' && lesson.words_total > 0 && (
          lesson.locked ? (
            <span style={{ fontSize: 12.5, padding: '6px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink-soft)', whiteSpace: 'nowrap', fontWeight: 600 }}
              title={lesson.lock_reason === 'no_schedule' ? 'Сначала выбери календарь обучения выше'
                : lesson.lock_reason === 'prev' ? 'Сначала пройди предыдущий урок' : 'Урок откроется по расписанию'}>
              {lesson.lock_reason === 'no_schedule'
                ? '🔒 выбери календарь'
                : lesson.lock_reason === 'prev'
                ? '🔒 пройди предыдущий'
                : `🔒 ${lesson.unlock_date ? new Date(lesson.unlock_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : 'позже'}`}
            </span>
          ) : (
            <button
              onClick={() => navigate(`/exercise-session?lesson_id=${lesson.id}`)}
              style={{ fontSize: 13, padding: '6px 14px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}>
              ✅ {isOwner ? 'Открыть' : 'Начать'}
            </button>
          )
        )}
      </div>
    </div>
  )
}

const btnPrimary   = { padding: '8px 16px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }
const btnSecondary = { padding: '7px 14px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
const btnDanger    = { padding: '7px 14px', background: 'var(--surface)', color: 'var(--red)', border: '1px solid rgba(179,56,44,0.4)', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
