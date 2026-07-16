import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

// 📚 Каталог учебников: подключить готовый учебник (без регенерации) или опубликовать свой курс.
export default function Catalog() {
  const { user } = useAuthStore()
  const [books, setBooks] = useState(null)
  const [courses, setCourses] = useState([])
  const [publishId, setPublishId] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)

  const load = () => api.get('/catalog').then(setBooks).catch(e => setErr(e.message))
  useEffect(() => {
    load()
    api.get('/courses').then(setCourses).catch(() => {})
  }, [])

  if (user?.role !== 'owner') return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔒</div><h2>Каталог — для учителя</h2>
    </div>
  )

  const publish = async () => {
    if (!publishId) return
    setBusy('publish'); setErr(''); setMsg('')
    try {
      const r = await api.post('/catalog/publish', { course_id: parseInt(publishId) })
      setMsg(`Курс опубликован в каталог: «${r.textbook.name}»`); setPublishId(''); load()
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }
  const adopt = async (b) => {
    if (!window.confirm(`Подключить учебник «${b.name}» (${b.lessons} уроков)? Уроки скопируются к тебе — бесплатно, без регенерации.`)) return
    setBusy(b.id); setErr(''); setMsg('')
    try {
      const r = await api.post(`/catalog/${b.id}/adopt`, {})
      setMsg(`Подключено: «${r.textbook}» — ${r.lessons} уроков скопировано в твою школу.`)
    } catch (e) { setErr(e.message) } finally { setBusy(null) }
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '18px 16px 60px' }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(201,165,74,0.16), rgba(124,92,255,0.12))', border: '1px solid var(--line)', borderRadius: 18, padding: '22px', marginBottom: 20 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>📚 Каталог учебников</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
          Не гоняй заново — подключи готовый учебник (слова, картинки, упражнения копируются бесплатно). Или поделись своим.
        </div>
      </div>

      {msg && <div style={{ background: 'rgba(59,122,87,.12)', border: '1px solid var(--good, #16a34a)', color: 'var(--good, #16a34a)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>{msg}</div>}
      {err && <div style={{ color: 'var(--red)', marginBottom: 12 }}>{err}</div>}

      {/* Опубликовать свой курс */}
      {courses.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 22, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Поделиться своим курсом:</span>
          <select value={publishId} onChange={e => setPublishId(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 14 }}>
            <option value="">— выбери курс —</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button onClick={publish} disabled={!publishId || busy === 'publish'} style={{
            padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, opacity: (!publishId || busy === 'publish') ? 0.6 : 1,
          }}>{busy === 'publish' ? 'Публикую…' : '📤 В каталог'}</button>
        </div>
      )}

      {/* Список учебников */}
      {!books && <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>}
      {books && books.length === 0 && (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 14, border: '1px dashed var(--line)' }}>
          В каталоге пока пусто. Опубликуй свой курс — он появится здесь для всех.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {books?.map(b => (
          <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 130, background: b.cover_url ? `center/cover no-repeat url(${b.cover_url})` : 'linear-gradient(135deg, rgba(124,92,255,0.2), rgba(59,122,87,0.18))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
              {!b.cover_url && '📖'}
            </div>
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                {[b.publisher, b.level, b.target_lang?.toUpperCase()].filter(Boolean).join(' · ')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
                {b.lessons} уроков · {b.words} слов
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => adopt(b)} disabled={busy === b.id} style={{
                marginTop: 12, padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, opacity: busy === b.id ? 0.6 : 1,
              }}>{busy === b.id ? 'Подключаю…' : '➕ Подключить'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
