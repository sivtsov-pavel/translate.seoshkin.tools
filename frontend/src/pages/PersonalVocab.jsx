import { useEffect, useRef, useState } from 'react'
import { api, uploadFiles } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

// 📔 Личный словарь ученика: грузишь фото тетради → система берёт только НОВЫЕ слова
// (которых нет в уроках) → твой личный запас. Картинки — из общего банка, бесплатно.
const STATUS = {
  new:      { label: 'Новое', color: 'var(--ink-soft)' },
  learning: { label: 'Учу',   color: '#B07D1B' },
  known:    { label: 'Знаю',  color: 'var(--good, #16a34a)' },
}

export default function PersonalVocab() {
  const { lang } = useI18nStore()
  const [words, setWords] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()
  const camRef = useRef()

  const load = () => api.get('/personal-words').then(setWords).catch(() => setWords([]))
  useEffect(() => { load() }, [])

  const upload = async (files) => {
    if (!files?.length) return
    setUploading(true); setMsg('')
    try {
      const fd = new FormData(); fd.append('file', files[0])
      const r = await uploadFiles(`/personal-words/from-photo?lang=${lang}`, fd)
      setMsg(r.added.length ? `➕ Добавлено новых слов: ${r.added.length}${r.skipped ? ` · уже было: ${r.skipped}` : ''}` : `Новых слов не нашлось${r.skipped ? ` (${r.skipped} уже есть)` : ''}`)
      load()
    } catch (e) { alert(e.message) } finally { setUploading(false) }
  }
  const cycleStatus = async (w) => {
    const next = w.status === 'new' ? 'learning' : w.status === 'learning' ? 'known' : 'new'
    setWords(ws => ws.map(x => x.id === w.id ? { ...x, status: next } : x))
    try { await api.patch(`/personal-words/${w.id}`, { status: next }) } catch {}
  }
  const remove = async (id) => {
    if (!window.confirm('Убрать слово из личного словаря?')) return
    setWords(ws => ws.filter(x => x.id !== id))
    try { await api.delete(`/personal-words/${id}`) } catch {}
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '18px 16px 60px' }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(59,122,87,0.16), rgba(124,92,255,0.12))', border: '1px solid var(--line)', borderRadius: 18, padding: '22px', marginBottom: 18 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>📔 Мой словарь</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
          Сфотографируй тетрадь — я добавлю только НОВЫЕ слова (которых нет в уроках). Это твой личный запас.
        </div>
      </div>

      {/* Загрузка */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={() => camRef.current?.click()} disabled={uploading} style={btn('accent')}>
          {uploading ? '⏳ Разбираю…' : '📷 Сфотографировать тетрадь'}
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={btn('ghost')}>📁 Из файлов</button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => upload(e.target.files)} />
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => upload(e.target.files)} />
      </div>
      {msg && <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>{msg}</div>}

      {/* Список */}
      {!words && <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>}
      {words && words.length === 0 && (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 14, border: '1px dashed var(--line)' }}>
          Пока пусто. Сфотографируй тетрадь — новые слова появятся здесь.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {words?.map(w => {
          const st = STATUS[w.status] || STATUS.new
          return (
            <div key={w.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              {w.image_url
                ? <img src={w.image_url} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface-2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📝</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.word}</span>
                  <SpeakButton text={w.word} size={14} />
                </div>
                {w.translation && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{w.translation}</div>}
                <button onClick={() => cycleStatus(w)} style={{
                  marginTop: 5, padding: '2px 10px', borderRadius: 999, border: `1px solid ${st.color}`,
                  background: 'transparent', color: st.color, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>{st.label}</button>
              </div>
              <button onClick={() => remove(w.id)} title="Убрать" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 15 }}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const btn = (variant) => ({
  padding: '10px 18px', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  ...(variant === 'accent'
    ? { background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }
    : { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)' }),
})
