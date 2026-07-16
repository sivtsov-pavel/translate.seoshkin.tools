import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

// 🏫 Панель школы (мультиарендность SaaS). Учитель/школа-админ: классы, коды-приглашения,
// состав. Ученик присоединяется по коду/ссылке (JoinClass). Бэкенд: /api/classes*.

const AVATAR_COLORS = ['#7C5CFF', '#3B7A57', '#E0576F', '#C9A54A', '#2E86AB', '#B07D1B']
function avatarFor(name, id) {
  const c = AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length]
  const letter = (name || '?').trim().charAt(0).toUpperCase()
  return { c, letter }
}

// Кнопка «скопировать» с фидбэком
function CopyBtn({ text, label = 'Копировать', style }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600) } catch {}
  }
  return (
    <button onClick={copy} style={{
      padding: '7px 12px', borderRadius: 9, border: '1px solid var(--line)', cursor: 'pointer',
      background: done ? 'var(--good, #16a34a)' : 'var(--surface-2)', color: done ? '#fff' : 'var(--ink)',
      fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background .15s', ...style,
    }}>{done ? '✓ Скопировано' : label}</button>
  )
}

// QR-код ссылки-приглашения — генерируется полностью на клиенте (без внешних
// сервисов/CDN), чтобы не нарушать CSP. Перегенерируется при смене ссылки.
function InviteQr({ text }) {
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(text, { width: 180, margin: 1 })
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [text])

  if (!dataUrl) return null
  return (
    <img src={dataUrl} alt="QR-код приглашения" width={180} height={180}
      style={{ borderRadius: 12, border: '1px solid var(--line)', background: '#fff', padding: 8 }} />
  )
}

export default function School() {
  const { user } = useAuthStore()
  const [classes, setClasses] = useState(null)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api.get('/classes').then(setClasses).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  if (user?.role !== 'owner') return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔒</div><h2>Раздел для учителя</h2>
      <p style={{ color: 'var(--ink-soft)' }}>Панель школы доступна учителю. Ученик присоединяется к классу по коду.</p>
    </div>
  )

  const openClass = async (id) => { setSelected('loading'); try { setSelected(await api.get(`/classes/${id}`)) } catch (e) { setErr(e.message); setSelected(null) } }
  const createClass = async () => {
    setBusy(true); setErr('')
    try {
      const c = await api.post('/classes', { name: newName.trim() || 'Новый класс' })
      setNewName(''); setCreating(false); await load(); openClass(c.id)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const removeStudent = async (uid) => {
    if (!window.confirm('Убрать ученика из класса?')) return
    try { await api.delete(`/classes/${selected.id}/members/${uid}`); openClass(selected.id); load() } catch (e) { alert(e.message) }
  }

  const joinLink = (code) => `${window.location.origin}/join/${code}`

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '18px 16px 60px' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(59,122,87,0.14))',
        border: '1px solid var(--line)', borderRadius: 18, padding: '22px 22px', marginBottom: 22,
      }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>🏫 Моя школа</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
          Классы, коды-приглашения и ученики. Раздай код — и ученики сами войдут в класс.
        </div>
      </div>

      {err && <div style={{ color: 'var(--red)', marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 20, alignItems: 'start' }} className="school-grid">
        <style>{`@media (max-width: 720px){ .school-grid{ grid-template-columns: 1fr !important; } }`}</style>

        {/* Список классов */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Классы {classes ? `(${classes.length})` : ''}</h3>
            <button onClick={() => setCreating(v => !v)} style={{
              padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13,
            }}>{creating ? '✕' : '+ Класс'}</button>
          </div>

          {creating && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createClass()}
                placeholder="Название класса (напр. 6-А, вторник)"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }} />
              <button onClick={createClass} disabled={busy} style={{
                padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13,
              }}>{busy ? '…' : 'Создать'}</button>
            </div>
          )}

          {!classes && <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>}
          {classes && classes.length === 0 && !creating && (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 14, border: '1px dashed var(--line)' }}>
              Пока нет классов. Создай первый — ученики войдут по коду.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {classes?.map(c => {
              const active = selected && selected !== 'loading' && selected.id === c.id
              return (
                <div key={c.id} onClick={() => openClass(c.id)} style={{
                  cursor: 'pointer', borderRadius: 14, padding: '14px 16px',
                  background: active ? 'linear-gradient(135deg, rgba(124,92,255,0.14), rgba(59,122,87,0.10))' : 'var(--surface)',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                  display: 'flex', alignItems: 'center', gap: 12, transition: 'border-color .15s',
                }}>
                  <div style={{ fontSize: 26 }}>👥</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                      {c.students} {c.students === 1 ? 'ученик' : c.students < 5 ? 'ученика' : 'учеников'} · код <b style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{c.invite_code}</b>
                    </div>
                  </div>
                  <span style={{ color: 'var(--ink-soft)', fontSize: 18 }}>→</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Детали класса */}
        <div>
          {!selected && (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 16, border: '1px dashed var(--line)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👈</div>
              Выбери класс слева, чтобы увидеть код-приглашение и состав.
            </div>
          )}
          {selected === 'loading' && <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>}
          {selected && selected !== 'loading' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 800, fontSize: 20 }}>{selected.name}</div>
              </div>

              {/* Код-приглашение — крупно */}
              <div style={{ padding: '18px 20px', background: 'linear-gradient(135deg, rgba(201,165,74,0.12), rgba(124,92,255,0.10))' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 6 }}>КОД-ПРИГЛАШЕНИЕ</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{
                    fontFamily: 'monospace', fontSize: 26, fontWeight: 800, letterSpacing: '3px',
                    padding: '8px 16px', borderRadius: 10, background: 'var(--surface)', border: '2px dashed var(--accent)', color: 'var(--accent)',
                  }}>{selected.invite_code}</div>
                  <CopyBtn text={selected.invite_code} label="Код" />
                  <CopyBtn text={joinLink(selected.invite_code)} label="🔗 Ссылка-приглашение" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
                  Дай ученикам код или ссылку — они войдут в класс сами.
                </div>
                <div style={{ marginTop: 12 }}>
                  <InviteQr text={joinLink(selected.invite_code)} />
                </div>
              </div>

              {/* Состав */}
              <div style={{ padding: '14px 20px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 10 }}>
                  Состав ({selected.members?.length || 0})
                </div>
                {(!selected.members || selected.members.length === 0) && (
                  <div style={{ color: 'var(--ink-soft)', fontSize: 14, padding: '10px 0' }}>Пока никого — поделись кодом.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.members?.map(m => {
                    const a = avatarFor(m.name, m.id)
                    const isTeacher = m.role === 'teacher'
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: a.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{a.letter}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{isTeacher ? '👨‍🏫 Учитель' : '🎓 Ученик'}</div>
                        </div>
                        {!isTeacher && (
                          <button onClick={() => removeStudent(m.id)} title="Убрать из класса"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 16 }}>✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
