import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

// name — ключ в t.settings.avatar* (не текст напрямую, локализуется функцией PRESET_AVATARS(t))
const PRESET_AVATARS = (t) => [
  { emoji: '🦈', name: t.settings.avatarShark },
  { emoji: '👽', name: t.settings.avatarAlien },
  { emoji: '🤠', name: t.settings.avatarDunno },
  { emoji: '👧', name: t.settings.avatarGirl },
  { emoji: '👦', name: t.settings.avatarBoy },
  { emoji: '🐼', name: t.settings.avatarPanda },
  { emoji: '🦊', name: t.settings.avatarFox },
  { emoji: '🐸', name: t.settings.avatarFrog },
  { emoji: '🦁', name: t.settings.avatarLion },
  { emoji: '🤖', name: t.settings.avatarRobot },
  { emoji: '🧙', name: t.settings.avatarWizard },
  { emoji: '🚀', name: t.settings.avatarRocket },
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
  const [genPwd, setGenPwd] = useState('')       // сгенерированный пароль (показываем открыто, чтобы скопировать)
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
      setBuildMsg(e?.message || t.settings.buildSetFailedMsg)
      setBuilding(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const data = await api.put('/profile', form)
      login(token, { ...user, ...data })
      setMsg({ ok: true, text: t.settings.profileSavedMsg })
    } catch {
      setMsg({ ok: false, text: t.settings.profileSaveErrMsg })
    } finally {
      setSaving(false)
    }
  }

  // Генерация надёжного пароля: 16 символов, гарантированно есть строчная/заглавная/цифра/символ.
  const generatePassword = () => {
    const lower = 'abcdefghijkmnpqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const digits = '23456789', symbols = '!@#$%&*?-_+'
    const all = lower + upper + digits + symbols
    const rnd = (set) => set[Math.floor(Math.random() * set.length)]
    let chars = [rnd(lower), rnd(upper), rnd(digits), rnd(symbols)]
    for (let i = chars.length; i < 16; i++) chars.push(rnd(all))
    // перемешиваем (Фишер-Йейтс), чтобы обязательные символы не стояли в начале
    for (let i = chars.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [chars[i], chars[j]] = [chars[j], chars[i]] }
    const p = chars.join('')
    setPwd(prev => ({ ...prev, next: p, confirm: p }))
    setGenPwd(p)
    setPwdMsg(null)
  }

  const changePassword = async () => {
    if (pwd.next !== pwd.confirm) { setPwdMsg({ ok: false, text: t.settings.pwdMismatch }); return }
    if (pwd.next.length < 6) { setPwdMsg({ ok: false, text: t.settings.pwdTooShort }); return }
    setSaving(true)
    setPwdMsg(null)
    try {
      await api.put('/profile', { password: pwd.next })
      setPwd({ current: '', next: '', confirm: '' })
      setPwdMsg({ ok: true, text: t.settings.pwdChangedMsg })
    } catch {
      setPwdMsg({ ok: false, text: t.settings.pwdErrorMsg })
    } finally {
      setSaving(false)
    }
  }

  const displayName = form.full_name || user?.email?.split('@')[0] || '?'
  const avatarChar  = form.avatar || displayName[0]?.toUpperCase() || '?'
  const isEmoji     = /\p{Emoji}/u.test(form.avatar || '')

  return (
    <div>
      {/* Аватар */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>{t.settings.avatarTitle}</h2>
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
            title={t.settings.firstLetterTitle}
            style={{
              width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontWeight: 700,
              background: !form.avatar ? 'var(--accent)' : 'var(--surface-2)',
              color: !form.avatar ? 'var(--accent-ink)' : 'var(--ink)',
              border: `2px solid ${!form.avatar ? 'var(--accent)' : 'var(--line)'}`,
            }}>
            {displayName[0]?.toUpperCase()}
          </button>
          {PRESET_AVATARS(t).map(a => (
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
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>{t.settings.personalDataTitle}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t.settings.nameLabel} value={form.full_name}  onChange={v => setForm(f => ({ ...f, full_name: v }))}  placeholder={t.settings.namePlaceholder} />
          <Field label={t.settings.professionLabel} value={form.profession} onChange={v => setForm(f => ({ ...f, profession: v }))} placeholder={t.settings.professionPlaceholder} />
          <Field label={t.settings.phoneLabel}   value={form.phone}      onChange={v => setForm(f => ({ ...f, phone: v }))}      placeholder="+49 151 23456789" />
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
          {saving ? t.settings.savingBtn : (t.nav.save || t.settings.profileSavedMsg)}
        </button>
      </section>

      {/* Мои сложные слова */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>{t.settings.hardWordsTitle}</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
          {t.settings.hardWordsDesc}
        </div>

        {!hard && <div style={{ color: 'var(--ink-soft)' }}>{t.common.loading}</div>}

        {hard && hard.words.length === 0 && (
          <div style={{ padding: '18px 16px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--line)' }}>
            {t.settings.noHardWords}
          </div>
        )}

        {hard && hard.words.length > 0 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {hard.words.map((w, i) => (
                <div key={i} title={t.settings.wrongOutOf(w.wrong, w.attempts)} style={{
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
              {building ? t.settings.buildingBtn : hard.set ? t.settings.rebuildSetBtn : t.settings.buildSetBtn}
            </button>
            {building && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-soft)' }}>
                {t.settings.generatingHint(hard.words.length)}
              </div>
            )}
          </>
        )}
      </section>

      {/* Смена пароля */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>{t.settings.changePasswordTitle}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label={t.settings.newPasswordLabel}    value={pwd.next}    onChange={v => { setPwd(p => ({ ...p, next: v })); setGenPwd('') }}    type="password" placeholder={t.settings.minCharsPlaceholder} />
          <Field label={t.settings.confirmPasswordLabel} value={pwd.confirm} onChange={v => { setPwd(p => ({ ...p, confirm: v })); setGenPwd('') }} type="password" placeholder={t.settings.repeatPasswordPlaceholder} />
        </div>
        {/* Генератор надёжного пароля */}
        <button type="button" onClick={generatePassword}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', background: 'rgba(62,127,193,0.10)', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          🎲 {t.settings.generatePasswordBtn || 'Сгенерировать надёжный пароль'}
        </button>
        {genPwd && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px dashed var(--gold)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>
              {t.settings.generatedPasswordHint || 'Скопируй и сохрани — увидеть его снова будет нельзя:'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--ink)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{genPwd}</code>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(genPwd); setPwdMsg({ ok: true, text: t.settings.passwordCopied || 'Пароль скопирован' }) }}
                style={{ padding: '6px 12px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                📋 {t.settings.copyBtn || 'Скопировать'}
              </button>
            </div>
          </div>
        )}
        {pwdMsg && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: pwdMsg.ok ? 'rgba(78,154,110,0.12)' : 'rgba(179,56,44,0.12)', color: pwdMsg.ok ? 'var(--good)' : 'var(--red)' }}>
            {pwdMsg.text}
          </div>
        )}
        <button onClick={changePassword} disabled={saving || !pwd.next}
          style={{ marginTop: 16, padding: '12px 28px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, opacity: pwd.next ? 1 : 0.5 }}>
          {t.settings.changePasswordBtn}
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
