import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth.js'
import { api } from '../api/client.js'

// Супер-админ панель — только для пользователя id=1 (Administrator).
// Вкладки: Обзор (статистика), Монетизация (реклама/тарифы/фичи), Пользователи.

const card = {
  background: 'var(--surface)', border: '1px solid var(--line)',
  borderRadius: 14, padding: 18,
}
const input = {
  padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line)',
  background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 14, width: '100%', boxSizing: 'border-box',
}

// Управляемый переключатель
function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '8px 0' }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 26, borderRadius: 999, flexShrink: 0, position: 'relative',
          background: checked ? 'var(--accent)' : 'var(--line)', transition: 'background .18s',
        }}>
        <span style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3, width: 20, height: 20,
          borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }} />
      </span>
      <span>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{hint}</div>}
      </span>
    </label>
  )
}

function StatCard({ big, label, sub }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '20px 14px' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function Admin() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('overview')

  if (user?.id !== 1) {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🔒</div>
        <h2>Доступ только супер-админу</h2>
        <p style={{ color: 'var(--ink-soft)' }}>Эта панель доступна только администратору платформы.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '18px 16px 60px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>⚙️ Супер-админ</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Глобальные настройки платформы. Видны только тебе.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['overview', '📊 Обзор'],
          ['monetization', '💶 Монетизация'],
          ['languages', '🌍 Языки'],
          ['schools', '🏫 Школы'],
          ['users', '👥 Пользователи'],
        ].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line)',
            background: tab === k ? 'var(--accent)' : 'var(--surface)',
            color: tab === k ? 'var(--accent-ink)' : 'var(--ink)',
            fontWeight: tab === k ? 700 : 500, fontSize: 14, cursor: 'pointer',
          }}>{lbl}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'monetization' && <Monetization />}
      {tab === 'languages' && <Languages />}
      {tab === 'schools' && <Schools />}
      {tab === 'users' && <Users />}
    </div>
  )
}

function Overview() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get('/admin/overview').then(setData).catch(e => setErr(e.message)) }, [])
  if (err) return <div style={{ color: 'var(--red)' }}>{err}</div>
  if (!data) return <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>
  const { users, content, activity } = data
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', margin: '0 0 8px' }}>Пользователи</h3>
        <div style={grid}>
          <StatCard big={users.total} label="Всего" />
          <StatCard big={users.owners} label="Учителя" />
          <StatCard big={users.students} label="Ученики" />
          <StatCard big={activity.active_7d} label="Активны" sub="за 7 дней" />
          <StatCard big={activity.active_30d} label="Активны" sub="за 30 дней" />
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)', margin: '0 0 8px' }}>Контент</h3>
        <div style={grid}>
          <StatCard big={content.lessons} label="Уроки" />
          <StatCard big={content.courses} label="Курсы" />
          <StatCard big={content.words} label="Слова" />
          <StatCard big={content.exercises} label="Упражнения" />
          <StatCard big={content.tutors} label="Репетиторы" />
          <StatCard big={activity.attempts_24h} label="Ответов" sub="за 24 часа" />
        </div>
      </div>
    </div>
  )
}

function Monetization() {
  const [cfg, setCfg] = useState(null)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.get('/admin/platform-settings').then(setCfg).catch(e => setErr(e.message)) }, [])
  if (err) return <div style={{ color: 'var(--red)' }}>{err}</div>
  if (!cfg) return <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>

  // Хелпер: обновить вложенное поле config.section.key
  const set = (section, key, val) => {
    setCfg(c => ({ ...c, [section]: { ...c[section], [key]: val } }))
    setSaved(false)
  }
  const ads = cfg.ads || {}
  const mon = cfg.monetization || {}
  const price = cfg.pricing || {}
  const feat = cfg.features || {}

  const save = async () => {
    setSaving(true); setErr('')
    try { await api.put('/admin/platform-settings', { config: cfg }); setSaved(true) }
    catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Реклама */}
      <div style={card}>
        <h3 style={{ margin: '0 0 6px' }}>📢 Реклама</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
          Показывать баннеры бесплатным пользователям. На телефоне рекламу лучше не показывать — только планшет/десктоп.
        </p>
        <Toggle checked={!!ads.enabled} onChange={v => set('ads', 'enabled', v)} label="Реклама включена" />
        <div style={{ paddingLeft: 4, opacity: ads.enabled ? 1 : 0.4, pointerEvents: ads.enabled ? 'auto' : 'none' }}>
          <Toggle checked={!!ads.mobile}  onChange={v => set('ads', 'mobile', v)}  label="На телефоне" hint="≤ 640px" />
          <Toggle checked={!!ads.tablet}  onChange={v => set('ads', 'tablet', v)}  label="На планшете" hint="641–1023px" />
          <Toggle checked={!!ads.desktop} onChange={v => set('ads', 'desktop', v)} label="На десктопе" hint="≥ 1024px" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>AdSense client ID
              <input style={{ ...input, marginTop: 4 }} value={ads.adsense_client || ''} onChange={e => set('ads', 'adsense_client', e.target.value)} placeholder="ca-pub-…" />
            </label>
            <label style={{ fontSize: 13 }}>Slot ID
              <input style={{ ...input, marginTop: 4 }} value={ads.adsense_slot || ''} onChange={e => set('ads', 'adsense_slot', e.target.value)} placeholder="1234567890" />
            </label>
          </div>
        </div>
      </div>

      {/* Монетизация */}
      <div style={card}>
        <h3 style={{ margin: '0 0 6px' }}>💰 Монетизация</h3>
        <Toggle checked={!!mon.paid_enabled} onChange={v => set('monetization', 'paid_enabled', v)}
          label="Платная версия включена" hint="Тарифы доступны пользователям" />
        <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>
          Бесплатный дневной лимит упражнений
          <input type="number" min="0" style={{ ...input, marginTop: 4, maxWidth: 160 }}
            value={mon.free_daily_limit ?? 0}
            onChange={e => set('monetization', 'free_daily_limit', parseInt(e.target.value) || 0)} />
        </label>
        <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>
          Лимит сообщений AI-тренера в день (бесплатно, 0 = без лимита)
          <input type="number" min="0" style={{ ...input, marginTop: 4, maxWidth: 160 }}
            value={mon.trainer_daily_limit ?? 0}
            onChange={e => set('monetization', 'trainer_daily_limit', parseInt(e.target.value) || 0)} />
        </label>
      </div>

      {/* Тарифы */}
      <div style={card}>
        <h3 style={{ margin: '0 0 10px' }}>🏷️ Тарифы</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          <label style={{ fontSize: 13 }}>Валюта
            <input style={{ ...input, marginTop: 4 }} value={price.currency || 'EUR'} onChange={e => set('pricing', 'currency', e.target.value)} />
          </label>
          <label style={{ fontSize: 13 }}>Месяц
            <input type="number" step="0.01" style={{ ...input, marginTop: 4 }} value={price.monthly ?? 0} onChange={e => set('pricing', 'monthly', parseFloat(e.target.value) || 0)} />
          </label>
          <label style={{ fontSize: 13 }}>Год
            <input type="number" step="0.01" style={{ ...input, marginTop: 4 }} value={price.yearly ?? 0} onChange={e => set('pricing', 'yearly', parseFloat(e.target.value) || 0)} />
          </label>
          <label style={{ fontSize: 13 }}>Навсегда
            <input type="number" step="0.01" style={{ ...input, marginTop: 4 }} value={price.lifetime ?? 0} onChange={e => set('pricing', 'lifetime', parseFloat(e.target.value) || 0)} />
          </label>
        </div>
      </div>

      {/* Фичи */}
      <div style={card}>
        <h3 style={{ margin: '0 0 6px' }}>🧩 Функции</h3>
        <Toggle checked={feat.autoImages !== false} onChange={v => set('features', 'autoImages', v)}
          label="Авто-генерация картинок (наши рисунки)" hint="ВКЛ — урок сам рисует картинки (gpt-image-1, платно). ВЫКЛ — рисуешь вручную кнопкой на уроке." />
        <Toggle checked={!!feat.trainer_free} onChange={v => set('features', 'trainer_free', v)} label="AI-тренер бесплатно" />
        <Toggle checked={!!feat.avatar_video} onChange={v => set('features', 'avatar_video', v)} label="Видео-аватар (D-ID)" hint="Платные кредиты D-ID" />
        <Toggle checked={!!feat.catalog} onChange={v => set('features', 'catalog', v)} label="Каталог репетиторов" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}>
        <button onClick={save} disabled={saving} style={{
          padding: '11px 26px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
          background: 'var(--accent)', color: 'var(--accent-ink)', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
        {saved && <span style={{ color: 'var(--good, #16a34a)', fontWeight: 600 }}>✓ Сохранено</span>}
        {err && <span style={{ color: 'var(--red)' }}>{err}</span>}
      </div>
    </div>
  )
}

// Настройка активных РОДНЫХ локалей (языков интерфейса/перевода) для каждого
// ИЗУЧАЕМОГО языка. Напр. испанский → только ru+es (не тратим токены на перевод
// на все 10 языков). Пусто/не задано = все языки активны.
const TARGET_LANGS = [
  { code: 'de', flag: '🇩🇪', name: 'Немецкий' },
  { code: 'es', flag: '🇪🇸', name: 'Испанский' },
  { code: 'fr', flag: '🇫🇷', name: 'Французский' },
  { code: 'it', flag: '🇮🇹', name: 'Итальянский' },
  { code: 'en', flag: '🇬🇧', name: 'Английский' },
  { code: 'pt', flag: '🇵🇹', name: 'Португальский' },
]
const NATIVE_LOCALES = [
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'uk', flag: '🇺🇦', name: 'Українська' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'bg', flag: '🇧🇬', name: 'Български' },
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'sq', flag: '🇦🇱', name: 'Shqip' },
]

function Languages() {
  const [cfg, setCfg] = useState(null)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState('es') // какой изучаемый язык настраиваем

  useEffect(() => { api.get('/admin/platform-settings').then(setCfg).catch(e => setErr(e.message)) }, [])
  if (err) return <div style={{ color: 'var(--red)' }}>{err}</div>
  if (!cfg) return <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>

  const map = cfg.targetLocales || {}
  // выбранные локали для активного языка. undefined = все языки (не ограничено)
  const sel = map[active] // массив или undefined
  const isAll = !Array.isArray(sel) || sel.length === 0

  const setLocales = (arr) => {
    setCfg(c => ({ ...c, targetLocales: { ...(c.targetLocales || {}), [active]: arr } }))
    setSaved(false)
  }
  const toggleLocale = (code) => {
    const cur = Array.isArray(sel) ? sel : []
    setLocales(cur.includes(code) ? cur.filter(x => x !== code) : [...cur, code])
  }
  const setAll = () => setLocales([]) // пусто = без ограничений (все языки)

  const save = async () => {
    setSaving(true); setErr('')
    try { await api.put('/admin/platform-settings', { config: cfg }); setSaved(true) }
    catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <h3 style={{ margin: '0 0 6px' }}>🌍 Активные языки перевода</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 12px' }}>
          Для каждого изучаемого языка выбери, на какие родные языки переводить контент (слова и упражнения).
          Например, испанский пока переводим только на <b>русский и испанский</b> — остальные не трогаем, чтобы не тратить токены.
          Ничего не выбрано = переводим на все 10 языков.
        </p>

        {/* Выбор изучаемого языка */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {TARGET_LANGS.map(l => (
            <button key={l.code} onClick={() => setActive(l.code)} style={{
              padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line)',
              background: active === l.code ? 'var(--accent)' : 'var(--surface-2)',
              color: active === l.code ? 'var(--accent-ink)' : 'var(--ink)',
              fontWeight: active === l.code ? 700 : 500, fontSize: 13, cursor: 'pointer',
            }}>{l.flag} {l.name}{Array.isArray(map[l.code]) && map[l.code].length ? ` (${map[l.code].length})` : ''}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Родные языки для перевода:</div>
          <button onClick={setAll} style={{
            padding: '4px 10px', borderRadius: 8, border: '1px solid var(--line)',
            background: isAll ? 'var(--accent)' : 'var(--surface-2)',
            color: isAll ? 'var(--accent-ink)' : 'var(--ink-soft)', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>Все языки</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {NATIVE_LOCALES.map(loc => {
            const on = isAll || sel.includes(loc.code)
            return (
              <label key={loc.code} onClick={() => { if (isAll) setLocales([loc.code]); else toggleLocale(loc.code) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9,
                  border: '1px solid var(--line)', cursor: 'pointer',
                  background: on && !isAll ? 'var(--accent)' : 'var(--surface-2)',
                  color: on && !isAll ? 'var(--accent-ink)' : (isAll ? 'var(--ink-soft)' : 'var(--ink)'),
                  opacity: isAll ? 0.7 : 1,
                }}>
                <span>{loc.flag}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{loc.name}</span>
              </label>
            )
          })}
        </div>
        {!isAll && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '10px 0 0' }}>
            {TARGET_LANGS.find(l => l.code === active)?.name}: перевод только на {sel.length} {sel.length === 1 ? 'язык' : 'языка/языков'}.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0' }}>
        <button onClick={save} disabled={saving} style={{
          padding: '11px 26px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
          background: 'var(--accent)', color: 'var(--accent-ink)', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
        {saved && <span style={{ color: 'var(--good, #16a34a)', fontWeight: 600 }}>✓ Сохранено</span>}
        {err && <span style={{ color: 'var(--red)' }}>{err}</span>}
      </div>
    </div>
  )
}

// Школы: супер-админ выставляет тариф и лимиты (картинки/OCR/ученики) каждой школе.
// limits = { images_month, ocr_month, max_students }. 0/пусто = без лимита.
function Schools() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [savingId, setSavingId] = useState(null)
  useEffect(() => { api.get('/admin/schools').then(setRows).catch(e => setErr(e.message)) }, [])
  if (err) return <div style={{ color: 'var(--red)' }}>{err}</div>
  if (!rows) return <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>

  const setLimit = (id, key, val) => setRows(rs => rs.map(s => s.id === id
    ? { ...s, limits: { ...s.limits, [key]: val === '' ? null : parseInt(val) || 0 } } : s))

  const save = async (s) => {
    setSavingId(s.id); setErr('')
    try {
      const upd = await api.patch(`/admin/schools/${s.id}`, { plan: s.plan, limits: s.limits })
      setRows(rs => rs.map(x => x.id === s.id ? { ...x, ...upd } : x))
    } catch (e) { setErr(e.message) } finally { setSavingId(null) }
  }

  const Num = ({ s, k, label, hint }) => (
    <label style={{ fontSize: 12 }}>{label}
      <input type="number" min="0" placeholder="∞" value={s.limits?.[k] ?? ''}
        onChange={e => setLimit(s.id, k, e.target.value)}
        style={{ ...input, marginTop: 3, maxWidth: 110 }} />
      {hint && <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{hint}</div>}
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: 0 }}>
        Тарифы и лимиты школ. Пустое поле = без лимита (∞). Картинки/OCR тратят OpenAI — ограничивай школы на бесплатном тарифе.
      </p>
      {rows.map(s => (
        <div key={s.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🏫 {s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                {s.owner_email} · {s.students} учеников · {s.lessons} уроков · картинок в этом месяце: <b>{s.images_this_month}</b>
              </div>
            </div>
            <select value={s.plan || 'free'} onChange={e => setRows(rs => rs.map(x => x.id === s.id ? { ...x, plan: e.target.value } : x))}
              style={{ ...input, maxWidth: 140 }}>
              <option value="free">free</option>
              <option value="pro">pro</option>
              <option value="unlimited">unlimited</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Num s={s} k="images_month" label="Картинок / мес" hint="генерация gpt-image-1" />
            <Num s={s} k="ocr_month"    label="OCR фото / мес" hint="разбор фото (gpt-4o)" />
            <Num s={s} k="max_students" label="Макс. учеников" />
            <button onClick={() => save(s)} disabled={savingId === s.id} style={{
              padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13,
              opacity: savingId === s.id ? 0.6 : 1,
            }}>{savingId === s.id ? 'Сохраняю…' : 'Сохранить'}</button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Users() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get('/admin/users').then(setRows).catch(e => setErr(e.message)) }, [])
  if (err) return <div style={{ color: 'var(--red)' }}>{err}</div>
  if (!rows) return <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>
  const fmt = d => d ? new Date(d).toLocaleDateString('ru-RU') : '—'
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)' }}>
            <th style={{ padding: '10px 12px' }}>#</th>
            <th style={{ padding: '10px 12px' }}>Email</th>
            <th style={{ padding: '10px 12px' }}>Роль</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Уроки</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Слова</th>
            <th style={{ padding: '10px 12px' }}>Активность</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '9px 12px', color: 'var(--ink-soft)' }}>{u.id}</td>
              <td style={{ padding: '9px 12px' }}>
                {u.email}{u.id === 1 && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>ADMIN</span>}
                {u.full_name && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{u.full_name}</div>}
              </td>
              <td style={{ padding: '9px 12px' }}>{u.role === 'owner' ? '👨‍🏫 Учитель' : '🎓 Ученик'}</td>
              <td style={{ padding: '9px 12px', textAlign: 'right' }}>{u.lessons || ''}</td>
              <td style={{ padding: '9px 12px', textAlign: 'right' }}>{u.words || ''}</td>
              <td style={{ padding: '9px 12px', color: 'var(--ink-soft)' }}>{fmt(u.last_active)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
