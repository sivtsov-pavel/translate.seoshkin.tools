import { useState, useRef, useEffect } from 'react'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

// Камера в читалке: сфоткал текст → gpt-4o vision разбирает немецкие слова →
// показывает какие уже в словаре (✓), какие новые (🆕) → сохранить выбранные в разговорник.
export default function CameraWords() {
  const { lang } = useI18nStore()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [words, setWords] = useState(null)   // [{de, tr, inDict, _save}]
  const [err, setErr] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [lessons, setLessons] = useState([])
  const [target, setTarget] = useState('')     // '' = новый набор, иначе lesson_id
  const [lessonMsg, setLessonMsg] = useState('')

  useEffect(() => {
    if (isOwner) api.get('/lessons').then(d => setLessons((Array.isArray(d) ? d : d.lessons || []).filter(l => l.status === 'done' || l.words_count > 0))).catch(() => {})
  }, [isOwner])

  const saveToLesson = async () => {
    const chosen = words.filter(w => w._save)
    if (!chosen.length) { setLessonMsg('Отметь слова галочками'); return }
    setLessonMsg('Сохраняю в урок…')
    try {
      const res = await api.post('/reader/save-to-lesson', {
        lesson_id: target || undefined,
        title: target ? undefined : '📷 Слова с фото',
        words: chosen.map(w => ({ de: w.de, tr: w.tr })),
      })
      setLessonMsg(`✓ Отправлено в урок (упражнения создаются в фоне). Урок #${res.lesson_id}`)
    } catch (e) { setLessonMsg('Ошибка: ' + e.message) }
  }

  const pick = () => fileRef.current?.click()

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr(''); setWords(null); setSavedCount(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await uploadFiles(`/reader/camera?lang=${lang}`, fd)
      // новые слова по умолчанию отмечены на сохранение
      setWords((r.words || []).map(w => ({ ...w, _save: !w.inDict })))
    } catch (e) { setErr(e.message || 'Ошибка') }
    finally { setBusy(false) }
  }

  const toggle = (i) => setWords(ws => ws.map((w, j) => j === i ? { ...w, _save: !w._save } : w))

  const saveSelected = async () => {
    const chosen = words.filter(w => w._save)
    let n = 0
    for (const w of chosen) {
      try { await api.post('/phrasebook', { de: w.de, ru: w.tr || '', source: 'camera' }); n++ } catch {}
    }
    setSavedCount(n)
    setWords(ws => ws.map(w => w._save ? { ...w, inDict: true, _save: false } : w))
  }

  const newCount = words ? words.filter(w => !w.inDict).length : 0

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button onClick={pick} disabled={busy} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10,
        border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)',
        fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
      }}>📷 {busy ? 'Разбираю фото…' : 'Слова с фото'}</button>

      {err && <div style={{ color: 'var(--red)', marginTop: 8, fontSize: 13 }}>{err}</div>}

      {words && (
        <div onClick={() => setWords(null)} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 520, maxHeight: '85vh', background: 'var(--surface)',
            borderRadius: '18px 18px 0 0', padding: 16, overflowY: 'auto',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom,0px))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, flex: 1 }}>📷 Слова с фото ({words.length})</h3>
              <button onClick={() => setWords(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
            </div>
            {words.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Немецких слов не распознано. Попробуй чётче фото.</p>}
            {savedCount > 0 && <div style={{ color: 'var(--good, #16a34a)', marginBottom: 8 }}>✓ Сохранено в разговорник: {savedCount}</div>}
            {words.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--line)' }}>
                <input type="checkbox" checked={!!w._save} disabled={w.inDict} onChange={() => toggle(i)} style={{ width: 18, height: 18, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }} dir="ltr">
                    {w.de} <SpeakButton text={w.de} size={16} />
                    {w.inDict
                      ? <span style={{ fontSize: 10, color: 'var(--good, #16a34a)', fontWeight: 700 }}>✓ в словаре</span>
                      : <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>🆕 новое</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{w.tr}</div>
                </div>
              </div>
            ))}
            {newCount > 0 && (
              <button onClick={saveSelected} style={{
                marginTop: 14, width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}>＋ Сохранить отмеченные в разговорник</button>
            )}

            {/* Учитель: сохранить отмеченные слова в УРОК (группу) — создаст упражнения */}
            {isOwner && words.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>Или добавить в урок (группу):</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={target} onChange={e => setTarget(e.target.value)}
                    style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }}>
                    <option value="">➕ Новый набор «📷 Слова с фото»</option>
                    {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                  <button onClick={saveToLesson} style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
                    В урок
                  </button>
                </div>
                {lessonMsg && <div style={{ fontSize: 12, color: lessonMsg.startsWith('✓') ? 'var(--good, #16a34a)' : 'var(--ink-soft)', marginTop: 6 }}>{lessonMsg}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
