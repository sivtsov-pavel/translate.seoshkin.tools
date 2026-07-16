import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

const PRESET_AVATARS = [
  { emoji: '🦈', name: 'Акула' },
  { emoji: '👽', name: 'Инопланетянин' },
  { emoji: '🤠', name: 'Незнайка' },
  { emoji: '👧', name: 'Девочка' },
  { emoji: '👦', name: 'Мальчик' },
  { emoji: '🐼', name: 'Панда' },
  { emoji: '🦊', name: 'Лиса' },
  { emoji: '🐸', name: 'Лягушка' },
  { emoji: '🦁', name: 'Лев' },
  { emoji: '🤖', name: 'Робот' },
  { emoji: '🧙', name: 'Волшебник' },
  { emoji: '🚀', name: 'Ракета' },
]

export default function Profile() {
  const { user, login, token } = useAuthStore()
  const { t } = useI18nStore()
  const navigate = useNavigate()
  const [form, setForm]   = useState({ full_name: '', phone: '', telegram: '', whatsapp: '', profession: '', avatar: '' })
  const [pwd, setPwd]     = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]     = useState(null)
  const [pwdMsg, setPwdMsg] = useState(null)
  // Мои сложные слова + личный набор для тренировки
  const [hard, setHard]   = useState(null)     // { words:[], set:{id,status} }
  const [building, setBuilding] = useState(false)
  const [buildMsg, setBuildMsg] = useState(null)

  useEffect(() => {
    api.get('/auth/me').then(data => {
      setForm({
        full_name:  data.full_name  || '',
        phone:      data.phone      || '',
        telegram:   data.telegram   || '',
        whatsapp:   data.whatsapp   || '',
        profession: data.profession || '',
        avatar:     data.avatar     || '',
      })
      // Обновляем user в store
      login(token, { ...user, ...data })
    })
    api.get('/analytics/my-hard-words').then(setHard).catch(() => setHard({ words: [], set: null }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Собрать набор упражнений из моих сложных слов
  const buildHardSet = async () => {
    setBuilding(true); setBuildMsg(null)
    try {
      const res = await api.post('/analytics/my-hard-words/make-set', {})
      navigate(`/exercise-session?lesson_id=${res.lessonId}`)
    } catch (e) {
      setBuildMsg(e?.message || 'Не удалось собрать набор')
      setBuilding(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const data = await api.put('/profile', form)
      login(token, { ...user, ...data })
      setMsg({ ok: true, text: 'Сохранено!' })
    } catch {
      setMsg({ ok: false, text: 'Ошибка при сохранении' })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    if (pwd.next !== pwd.confirm) { setPwdMsg({ ok: false, text: 'Пароли не совпадают' }); return }
    if (pwd.next.length < 6) { setPwdMsg({ ok: false, text: 'Минимум 6 символов' }); return }
    setSaving(true)
    setPwdMsg(null)
    try {
      await api.put('/profile', { password: pwd.next })
      setPwd({ current: '', next: '', confirm: '' })
      setPwdMsg({ ok: true, text: 'Пароль изменён!' })
    } catch {
      setPwdMsg({ ok: false, text: 'Ошибка' })
    } finally {
      setSaving(false)
    }
  }

  const displayName = form.full_name || user?.email?.split('@')[0] || '?'
  const avatarChar  = form.avatar || displayName[0]?.toUpperCase() || '?'
  const isEmoji     = /\p{Emoji}/u.test(form.avatar || '')

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>Мой профиль</h1>

      {/* Аватар */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Аватар</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: form.avatar ? 'var(--surface-2)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isEmoji ? 36 : 28, fontWeight: 700,
            color: isEmoji ? 'inherit' : 'var(--accent-ink)',
            border: '2px solid var(--line)',
          }}>
            {avatarChar}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{displayName}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {/* Буква по умолчанию */}
          <button
            onClick={() => setForm(f => ({ ...f, avatar: '' }))}
            title="Первая буква имени"
            style={{
              width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontWeight: 700,
              background: !form.avatar ? 'var(--accent)' : 'var(--surface-2)',
              color: !form.avatar ? 'var(--accent-ink)' : 'var(--ink)',
              border: `2px solid ${!form.avatar ? 'var(--accent)' : 'var(--line)'}`,
            }}>
            {displayName[0]?.toUpperCase()}
          </button>
          {PRESET_AVATARS.map(a => (
            <button
              key={a.emoji}
              onClick={() => setForm(f => ({ ...f, avatar: a.emoji }))}
              title={a.name}
              style={{
                width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 22,
                background: form.avatar === a.emoji ? 'var(--accent-soft)' : 'var(--surface-2)',
                border: `2px solid ${form.avatar === a.emoji ? 'var(--accent)' : 'var(--line)'}`,
              }}>
              {a.emoji}
            </button>
          ))}
        </div>
      </section>

      {/* Основные данные */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Личные данные</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Имя" value={form.full_name}  onChange={v => setForm(f => ({ ...f, full_name: v }))}  placeholder="Как тебя зовут?" />
          <Field label="Профессия" value={form.profession} onChange={v => setForm(f => ({ ...f, profession: v }))} placeholder="Студент, инженер, врач..." />
          <Field label="Телефон"   value={form.phone}      onChange={v => setForm(f => ({ ...f, phone: v }))}      placeholder="+49 151 23456789" />
          <Field label="Telegram"  value={form.telegram}   onChange={v => setForm(f => ({ ...f, telegram: v }))}   placeholder="@username" />
          <Field label="WhatsApp"  value={form.whatsapp}   onChange={v => setForm(f => ({ ...f, whatsapp: v }))}   placeholder="+49 151 23456789" />
        </div>
        {msg && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: msg.ok ? 'rgba(78,154,110,0.12)' : 'rgba(179,56,44,0.12)', color: msg.ok ? 'var(--good)' : 'var(--red)' }}>
            {msg.text}
          </div>
        )}
        <button onClick={save} disabled={saving}
          style={{ marginTop: 16, padding: '12px 28px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </section>

      {/* Мои сложные слова */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>🔥 Мои сложные слова</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
          Слова, в которых ты чаще всего ошибаешься в упражнениях. Собери из них набор и выучи как следует.
        </div>

        {!hard && <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>}

        {hard && hard.words.length === 0 && (
          <div style={{ padding: '18px 16px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
            Сложных слов пока нет — порешай побольше упражнений, и они появятся здесь.
          </div>
        )}

        {hard && hard.words.length > 0 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {hard.words.map((w, i) => (
                <div key={i} title={`${w.wrong} ошибок из ${w.attempts}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                  background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 999, fontSize: 13,
                }}>
                  <span style={{ fontWeight: 700 }}>{w.word_de}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>{w.translation_ru}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 11 }}>{w.wrong_pct}%</span>
                </div>
              ))}
            </div>

            {buildMsg && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: 'rgba(179,56,44,0.12)', color: 'var(--red)' }}>
                {buildMsg}
              </div>
            )}

            <button onClick={buildHardSet} disabled={building}
              style={{ padding: '12px 28px', background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: building ? 0.6 : 1 }}>
              {building ? 'Собираю набор…' : hard.set ? '🔄 Пересобрать и тренировать' : '✨ Собрать набор и тренировать'}
            </button>
            {building && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-soft)' }}>
                Генерирую упражнения из {hard.words.length} слов — это займёт до минуты…
              </div>
            )}
          </>
        )}
      </section>

      {/* Смена пароля */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Смена пароля</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Новый пароль"    value={pwd.next}    onChange={v => setPwd(p => ({ ...p, next: v }))}    type="password" placeholder="Минимум 6 символов" />
          <Field label="Повторить пароль" value={pwd.confirm} onChange={v => setPwd(p => ({ ...p, confirm: v }))} type="password" placeholder="Повторите пароль" />
        </div>
        {pwdMsg && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: pwdMsg.ok ? 'rgba(78,154,110,0.12)' : 'rgba(179,56,44,0.12)', color: pwdMsg.ok ? 'var(--good)' : 'var(--red)' }}>
            {pwdMsg.text}
          </div>
        )}
        <button onClick={changePassword} disabled={saving || !pwd.next}
          style={{ marginTop: 16, padding: '12px 28px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: pwd.next ? 1 : 0.5 }}>
          Изменить пароль
        </button>
      </section>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 4, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
    </div>
  )
}
