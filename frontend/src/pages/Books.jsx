import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'

// Раздел «📚 Книги» (для учителя): загрузка PDF/TXT + обложка. Ученики читают книги в Читалке.
export default function Books() {
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [books, setBooks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle]     = useState('')
  const [file, setFile]       = useState(null)
  const [cover, setCover]     = useState(null)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')

  // Список — из /reader/books (виден всем: свои книги + книги школы). Загрузка/удаление — только учителю.
  const load = () => api.get('/reader/books').then(setBooks).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const isOwner = user?.role === 'owner'

  const submit = async (e) => {
    e.preventDefault()
    if (!file) { setErr(t.reader.pickBookFile); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('file', file)
      if (cover) fd.append('cover', cover)
      await uploadFiles('/books', fd)
      setTitle(''); setFile(null); setCover(null); setFormOpen(false)
      setLoading(true); load()
    } catch (e) {
      setErr(e.message || t.reader.uploadFailedShort)
    } finally { setBusy(false) }
  }

  const remove = async (b) => {
    if (!window.confirm(t.reader.deleteBookConfirm(b.title))) return
    await api.delete(`/books/${b.id}`).catch(() => {})
    setBooks(prev => prev.filter(x => x.id !== b.id))
  }

  if (loading) return <p style={{ paddingTop: 30 }}>Загрузка…</p>

  return (
    <div style={{ paddingTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>📚 Книги</h1>
        {isOwner && (
          <button onClick={() => setFormOpen(v => !v)} style={btnPrimary}>
            {formOpen ? t.common.cancel : t.reader.addBookBtn}
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 24px' }}>
        {t.reader.booksIntro1}<Link to="/reader" style={{ color: 'var(--accent)' }}>{t.nav.reader}</Link>{t.reader.booksIntro2}
      </p>

      {formOpen && isOwner && (
        <form onSubmit={submit} style={{ marginBottom: 24, padding: '20px 24px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--line)' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Название (необязательно — возьмём из имени файла)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t.reader.bookTitlePlaceholder} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Файл книги — PDF или TXT *</label>
            <input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'block' }} />
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{t.reader.pdfTextLayerHint}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Обложка (необязательно)</label>
            <input type="file" accept="image/*" onChange={e => setCover(e.target.files?.[0] || null)} style={{ display: 'block' }} />
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <button type="submit" disabled={busy || !file} style={{ ...btnPrimary, opacity: (busy || !file) ? 0.6 : 1 }}>
            {busy ? t.reader.uploadingBook : t.reader.uploadBookBtn}
          </button>
        </form>
      )}

      {books.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
          {t.reader.noBooksYet} {isOwner ? t.reader.noBooksOwner : t.reader.noBooksStudent}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {books.map(b => (
            <div key={b.id} style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', marginBottom: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {b.cover_image_url
                  ? <img src={b.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <span style={{ fontSize: 44 }}>📖</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{b.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
                {b.source_type?.toUpperCase()} · {Math.max(1, Math.round((b.char_count || 0) / 1000))}k символов
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button onClick={() => navigate(`/reader?book=${b.id}`)} style={{ ...btnPrimary, flex: 1, fontSize: 13, padding: '8px 12px' }}>{t.reader.readBtn}</button>
                {isOwner && (
                  <button onClick={() => remove(b)} title={t.reader.deleteBookTitle}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const btnPrimary = { padding: '8px 18px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }
const lbl = { display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 14 }
