import { useState, useRef, useEffect } from 'react'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

// Камера в читалке: сфоткал текст → gpt-4o vision разбирает немецкие слова →
// показывает какие уже в словаре (✓), какие новые (🆕) → сохранить выбранные в разговорник.
// renderTrigger(pick, busy) — необязательная кастомная кнопка запуска (для плавающей
// кнопки на дашборде). Если не передана — рисуется стандартная кнопка «📷 Слова с фото».
// mode: 'words' — просто разбор слов (Читалка); 'sentences' — абзац + перевод + разбор по словам (дашборд)
export default function CameraWords({ renderTrigger, mode = 'words' }) {
  const { lang } = useI18nStore()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [words, setWords] = useState(null)   // [{de, tr, inDict, _save}]
  const [sentences, setSentences] = useState(null) // [{original, translation, words:[{de,tr,inDict}]}]
  const [err, setErr] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [lessons, setLessons] = useState([])
  const [target, setTarget] = useState('')     // '' = новый набор, иначе lesson_id
  const [lessonMsg, setLessonMsg] = useState('')
  const [distMsg, setDistMsg] = useState('')
  const [distBusy, setDistBusy] = useState(false)

  useEffect(() => {
    if (isOwner) api.get('/lessons').then(d => setLessons((Array.isArray(d) ? d : d.lessons || []).filter(l => l.status === 'done' || l.words_count > 0))).catch(() => {})
  }, [isOwner])

  // Отмеченные слова: в режиме предложений собираем из разбора всех предложений (дедуп по de),
  // иначе — из плоского списка. Единый источник и для разговорника, и для урока.
  const collectChosen = () => {
    if (sentences) {
      const seen = new Set(); const out = []
      for (const s of sentences) for (const w of (s.words || [])) {
        if (!w._save) continue
        const k = String(w.de).toLowerCase()
        if (seen.has(k)) continue; seen.add(k); out.push(w)
      }
      return out
    }
    return (words || []).filter(w => w._save)
  }

  // 🎯 Авто-разложить отмеченные слова по тематическим наборам (алгоритм сам разнесёт)
  const distribute = async () => {
    const chosen = collectChosen()
    if (!chosen.length) { setDistMsg('Отметь слова галочками'); return }
    setDistBusy(true); setDistMsg('Раскладываю по темам…')
    try {
      // В режиме предложений — отправляем и сами предложения (с их словами), чтобы они
      // сохранились в наборы и пошли в упражнения (fill_blank / «составь предложение»).
      const payloadSentences = (sentences || []).map(s => ({
        text: s.original, translation: s.translation, words: (s.words || []).map(w => w.de),
      }))
      const res = await api.post('/reader/distribute', {
        words: chosen.map(w => ({ de: w.de, tr: w.tr })),
        sentences: payloadSentences,
      })
      const themes = (res.themes || []).join(', ')
      setDistMsg(`✓ Разложено: +${res.added} слов${themes ? ' → ' + themes : ''}${res.sentences ? `; предложений: ${res.sentences}` : ''}${res.duplicates ? `; дублей пропущено: ${res.duplicates}` : ''}. Картинки/упражнения дособерутся в фоне.`)
    } catch (e) { setDistMsg('Ошибка: ' + e.message) }
    finally { setDistBusy(false) }
  }

  const saveToLesson = async () => {
    const chosen = collectChosen()
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
    setBusy(true); setErr(''); setWords(null); setSentences(null); setSavedCount(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (mode === 'sentences') {
        const r = await uploadFiles(`/reader/camera-sentences?lang=${lang}`, fd)
        // Каждое слово разбора — сразу с галочкой сохранения (новые отмечены)
        const sents = (r.sentences || []).map(s => ({
          ...s, words: (s.words || []).map(w => ({ ...w, _save: !w.inDict })),
        }))
        setSentences(sents)
      } else {
        const r = await uploadFiles(`/reader/camera?lang=${lang}`, fd)
        setWords((r.words || []).map(w => ({ ...w, _save: !w.inDict })))
      }
    } catch (e) { setErr(e.message || 'Ошибка') }
    finally { setBusy(false) }
  }

  const closeModal = () => { setWords(null); setSentences(null) }

  const toggle = (i) => setWords(ws => ws.map((w, j) => j === i ? { ...w, _save: !w._save } : w))
  // Галочка слова внутри предложения (режим предложений)
  const toggleSentWord = (si, wi) => setSentences(ss => ss.map((s, i) => i !== si ? s
    : { ...s, words: s.words.map((w, j) => j !== wi ? w : { ...w, _save: !w._save }) }))

  const saveSelected = async () => {
    const chosen = collectChosen()
    let n = 0
    for (const w of chosen) {
      try { await api.post('/phrasebook', { de: w.de, ru: w.tr || '', source: 'camera' }); n++ } catch {}
    }
    setSavedCount(n)
    // Помечаем сохранённые как «в словаре» и снимаем галочки
    if (sentences) setSentences(ss => ss.map(s => ({ ...s, words: s.words.map(w => w._save ? { ...w, inDict: true, _save: false } : w) })))
    else setWords(ws => ws.map(w => w._save ? { ...w, inDict: true, _save: false } : w))
  }

  const newCount = sentences
    ? sentences.reduce((a, s) => a + s.words.filter(w => !w.inDict).length, 0)
    : (words ? words.filter(w => !w.inDict).length : 0)

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      {renderTrigger ? renderTrigger(pick, busy) : (
        <button onClick={pick} disabled={busy} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10,
          border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)',
          fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>📷 {busy ? 'Разбираю фото…' : 'Слова с фото'}</button>
      )}

      {/* Явный индикатор обработки фото — на весь экран, чтобы было видно, что идёт разбор */}
      {busy && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4500, background: 'rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, color: '#fff' }}>
          <div style={{ width: 54, height: 54, border: '5px solid rgba(255,255,255,.25)', borderTopColor: '#fff', borderRadius: '50%', animation: 'cwspin 0.8s linear infinite' }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>📷 Разбираю фото…</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>ИИ распознаёт слова, пара секунд</div>
          <style>{`@keyframes cwspin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {err && <div style={{ color: 'var(--red)', marginTop: 8, fontSize: 13 }}>{err}</div>}

      {(words || sentences) && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 520, maxHeight: '85vh', background: 'var(--surface)',
            borderRadius: '18px 18px 0 0', padding: 16, overflowY: 'auto',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom,0px))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, flex: 1 }}>📷 {sentences ? 'Разбор фото' : `Слова с фото (${words.length})`}</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
            </div>

            {/* Режим предложений: абзац → перевод → полный список слов (с галочками, он же сохраняется) */}
            {sentences && sentences.length > 0 && sentences.map((s, si) => (
              <div key={si} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', marginBottom: 10, background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'flex-start', gap: 6 }} dir="ltr">
                  <span style={{ flex: 1 }}>{s.original}</span>
                  <SpeakButton text={s.original} size={16} />
                </div>
                {s.translation && <div style={{ fontSize: 14, color: 'var(--ink-soft)', fontStyle: 'italic', marginTop: 4 }}>{s.translation}</div>}
                {s.words && s.words.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
                    {s.words.map((w, wi) => (
                      <div key={wi} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 2px', borderTop: '1px solid var(--line)' }}>
                        <input type="checkbox" checked={!!w._save} disabled={w.inDict} onChange={() => toggleSentWord(si, wi)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                        <b dir="ltr" style={{ fontSize: 14 }}>{w.de}</b>
                        <SpeakButton text={w.de} size={14} />
                        {w.inDict
                          ? <span style={{ fontSize: 10, color: 'var(--good, #16a34a)', fontWeight: 700 }}>✓</span>
                          : <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>🆕</span>}
                        <span style={{ fontSize: 13, color: 'var(--ink-soft)', marginLeft: 'auto', textAlign: 'right' }}>{w.tr}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sentences && sentences.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Предложений не распознано. Попробуй чётче фото.</p>}

            {/* Режим слов: плоский список */}
            {!sentences && words && words.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Немецких слов не распознано. Попробуй чётче фото.</p>}
            {savedCount > 0 && <div style={{ color: 'var(--good, #16a34a)', marginBottom: 8 }}>✓ Сохранено в разговорник: {savedCount}</div>}
            {!sentences && words && words.map((w, i) => (
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

            {/* Учитель: 🎯 авто-разложить по темам (алгоритм сам разнесёт по наборам, без свалки) */}
            {isOwner && ((words?.length || 0) > 0 || (sentences?.length || 0) > 0) && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <button onClick={distribute} disabled={distBusy} style={{
                  width: '100%', padding: '12px', borderRadius: 10, border: 'none', marginBottom: 6,
                  background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15,
                  cursor: distBusy ? 'default' : 'pointer', opacity: distBusy ? 0.6 : 1,
                }}>🎯 {distBusy ? 'Раскладываю…' : 'Разложить по темам (авто)'}</button>
                {distMsg && <div style={{ fontSize: 12.5, color: distMsg.startsWith('✓') ? 'var(--good, #16a34a)' : 'var(--ink-soft)', marginBottom: 10 }}>{distMsg}</div>}
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>Или вручную в конкретный урок (группу):</div>
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
