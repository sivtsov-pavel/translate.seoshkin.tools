import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSettingsStore, applyVisual } from '../store/settings.js'
import { useAuthStore } from '../store/auth.js'
import { usePushNotifications } from '../hooks/usePushNotifications.jsx'
import { api } from '../api/client.js'
import ProfileTab from './Profile.jsx'

const TABS = [
  { id: 'profile',      label: '👤 Профиль' },
  { id: 'settings',     label: '⚙️ Настройки' },
  { id: 'integrations', label: '🔑 Интеграции' },
  { id: 'reminders',    label: '⏰ Напоминания' },
]

const VOICE_KEY = 'de_voice_name'

// Тумблер «реакции тренера Pablo в упражнениях» (видео верно/неверно). Можно отключить — только текст.
// onSave — коллбек от родителя: досылает ПОЛНЫЙ visual-блок на сервер (PATCH заменяет колонку целиком,
// частичный объект стёр бы соседние поля вроде zoom/fontFamily).
function TrainerReactionsRow({ onSave }) {
  const [on, setOn] = useState(() => localStorage.getItem('trainer_reactions') !== 'false')
  const toggle = () => {
    const next = !on
    localStorage.setItem('trainer_reactions', next ? 'true' : 'false')
    setOn(next)
    onSave?.({ trainerReactions: next })
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)', marginTop: 8 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>🗣️ Тренер в упражнениях</div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Pablo реагирует видео на ответ (верно/неверно). Выключи — только текст.</div>
      </div>
      <button onClick={toggle} style={{
        flexShrink: 0, width: 52, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
        background: on ? 'var(--accent)' : 'var(--surface-2)', transition: 'background .2s',
      }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
      </button>
    </div>
  )
}

// onSave — тот же коллбек, что и у TrainerReactionsRow (см. выше) — досылает полный visual-блок.
function VoicePicker({ onSave }) {
  const [voices, setVoices] = useState([])
  const [selected, setSelected] = useState(() => localStorage.getItem(VOICE_KEY) || '')
  const [preview, setPreview] = useState(null)
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

  useEffect(() => {
    const load = () => {
      const v = synth?.getVoices().filter(v => v.lang.startsWith('de')) || []
      setVoices(v)
    }
    load()
    synth?.addEventListener('voiceschanged', load)
    return () => synth?.removeEventListener('voiceschanged', load)
  }, [])

  const select = (name) => {
    localStorage.setItem(VOICE_KEY, name)
    setSelected(name)
    onSave?.({ voiceName: name })
    setPreview(name)
    // Пример произношения выбранным голосом
    if (!synth) return
    synth.cancel()
    setTimeout(() => {
      const utt = new SpeechSynthesisUtterance('Guten Tag! Ich lerne Deutsch.')
      utt.lang = 'de-DE'
      utt.rate = parseFloat(localStorage.getItem('voice_rate') || '0.9')
      const v = synth.getVoices().find(v => v.name === name)
      if (v) utt.voice = v
      synth.speak(utt)
    }, 80)
  }

  const activeName = selected || voices.find(v => v.name === 'Google Deutsch')?.name || voices[0]?.name || ''

  if (!voices.length) return (
    <div style={{ fontSize: 13, color: 'var(--ink-soft)', padding: '8px 0' }}>
      Голоса не найдены. На Android может быть доступен только один голос — установите «Google TTS» из Play Market.
    </div>
  )

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Голос для немецкого</div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Нажми — услышишь пример произношения
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {voices.map(v => {
          const active = v.name === activeName
          return (
            <button key={v.name} onClick={() => select(v.name)} style={{
              padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
              background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>{active ? '🔊' : '🔈'}</span>
              <div>
                <div style={{ fontWeight: active ? 700 : 400, fontSize: 14, color: 'var(--ink)' }}>{v.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{v.lang} {v.localService ? '· локальный' : '· онлайн'}</div>
              </div>
              {active && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>активен</span>}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>
        💡 По умолчанию — Google Deutsch. На iPhone голосов мало, установите iOS 17+ для лучших вариантов.
      </div>
    </div>
  )
}

const FONTS = [
  { id: 'Roboto',       label: 'Roboto',       sample: 'Стандартный шрифт приложения' },
  { id: 'Inter',        label: 'Inter',         sample: 'Чёткий современный шрифт' },
  { id: 'Georgia',      label: 'Georgia',       sample: 'Классический с засечками' },
  { id: 'Merriweather', label: 'Merriweather',  sample: 'Читабельный с засечками' },
  { id: 'Nunito',       label: 'Nunito',        sample: 'Округлый, дружелюбный' },
]

const ZOOM_LEVELS = [
  { value: 0.85, label: 'Мелкий' },
  { value: 1.0,  label: 'Обычный' },
  { value: 1.15, label: 'Крупный' },
  { value: 1.3,  label: 'Очень крупный' },
]

const ACCENT_PRESETS = [
  { color: '',        label: 'По умолчанию (золото)' },
  { color: '#C9A54A', label: 'Золото' },
  { color: '#4f46e5', label: 'Индиго' },
  { color: '#0ea5e9', label: 'Синий' },
  { color: '#10b981', label: 'Зелёный' },
  { color: '#f97316', label: 'Оранжевый' },
  { color: '#e11d48', label: 'Красный' },
  { color: '#8b5cf6', label: 'Фиолетовый' },
]

function Section({ icon, title, children }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span> {title}
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{hint}</div>}
      {children}
    </div>
  )
}

export default function Settings() {
  const store = useSettingsStore()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = TABS.findIndex(t => t.id === searchParams.get('tab'))
  const [tab, setTab] = useState(initialTab >= 0 ? initialTab : 0)
  const selectTab = (i) => { setTab(i); setSearchParams(prev => { prev.set('tab', TABS[i].id); return prev }, { replace: true }) }
  const [saved, setSaved] = useState(false)
  const [keyVisible, setKeyVisible]   = useState(false)
  // Ключ OpenAI: сам ключ с сервера не приходит (секрет). Локально держим только НОВЫЙ ввод
  // и статус проверки/сохранения. Факт наличия ключа и маску берём из стора.
  const [keyDraft, setKeyDraft] = useState('')
  const [keyMsg, setKeyMsg]     = useState(null) // { kind:'ok'|'err'|'info', text }
  const [keyBusy, setKeyBusy]   = useState(false)
  const [smtpPassVisible, setSmtpPassVisible] = useState(false)
  // Бампается, когда с сервера подъехали trainerReactions/voiceName — форсит ремонт
  // TrainerReactionsRow/VoicePicker, чтобы их localStorage-инициализация перечиталась заново
  const [visualVersion, setVisualVersion] = useState(0)

  const [draft, setDraft] = useState({
    daily_limit:  store.daily_limit,
    zoom:         store.zoom,
    fontFamily:   store.fontFamily,
    headingFont:  store.headingFont  || 'Georgia',
    headingSize:  store.headingSize  || 22,
    accentColor:  store.accentColor,
    voiceRate:    store.voiceRate,
    mobileLayout: store.mobileLayout || 'bottom',
    smtp_host:    store.smtp_host   || '',
    smtp_port:    store.smtp_port   || 587,
    smtp_secure:  store.smtp_secure || false,
    smtp_user:    store.smtp_user   || '',
    smtp_pass:    store.smtp_pass   || '',
    smtp_from:    store.smtp_from   || '',
  })

  useEffect(() => {
    if (!store.loaded) store.fetchSettings()
  }, [])

  useEffect(() => {
    setDraft({
      daily_limit:  store.daily_limit,
      zoom:         store.zoom,
      fontFamily:   store.fontFamily,
      headingFont:  store.headingFont  || 'Georgia',
      headingSize:  store.headingSize  || 22,
      accentColor:  store.accentColor,
      voiceRate:    store.voiceRate,
      mobileLayout: store.mobileLayout || 'bottom',
      smtp_host:    store.smtp_host   || '',
      smtp_port:    store.smtp_port   || 587,
      smtp_secure:  store.smtp_secure || false,
      smtp_user:    store.smtp_user   || '',
      smtp_pass:    store.smtp_pass   || '',
      smtp_from:    store.smtp_from   || '',
    })
  }, [store.loaded])

  // store.fetchSettings() (запускается выше) уже кладёт ВСЁ содержимое серверного visual-блока
  // в стор (включая trainerReactions/voiceName, если они там есть) — но эти два поля живут не в
  // draft, а в localStorage у дочерних TrainerReactionsRow/VoicePicker. Как только сервер ответил —
  // переносим их в нужные localStorage-ключи и форсим ремонт дочерних компонентов, чтобы подхватили.
  useEffect(() => {
    if (!store.loaded) return
    let changed = false
    if (store.trainerReactions != null) {
      localStorage.setItem('trainer_reactions', store.trainerReactions ? 'true' : 'false')
      changed = true
    }
    if (store.voiceName) {
      localStorage.setItem(VOICE_KEY, store.voiceName)
      changed = true
    }
    if (changed) setVisualVersion(v => v + 1)
  }, [store.loaded, store.trainerReactions, store.voiceName])

  const VISUAL_KEYS = new Set(['zoom', 'fontFamily', 'headingFont', 'headingSize', 'accentColor', 'voiceRate', 'mobileLayout'])
  const LS_KEY = 'app_visual_settings'

  // Полный visual-блок (все 9 полей). Нужен, потому что PATCH /settings/visual заменяет
  // колонку visual целиком — частичный объект стёр бы соседние поля на сервере.
  const buildFullVisual = (overrides = {}) => ({
    zoom: draft.zoom,
    fontFamily: draft.fontFamily,
    headingFont: draft.headingFont,
    headingSize: draft.headingSize,
    accentColor: draft.accentColor,
    voiceRate: draft.voiceRate,
    mobileLayout: draft.mobileLayout,
    trainerReactions: localStorage.getItem('trainer_reactions') !== 'false',
    voiceName: localStorage.getItem(VOICE_KEY) || '',
    ...overrides,
  })

  // Best-effort сохранение на сервер — не блокирует UI и не показывает ошибку при сбое сети,
  // локальный кеш (localStorage) уже обновлён синхронно до вызова.
  const saveFullVisual = (overrides) => {
    api.patch('/settings/visual', { visual: buildFullVisual(overrides) }).catch(() => {})
  }

  // Визуальные настройки применяются И сохраняются сразу — без нажатия «Сохранить»
  const update = (key, value) => setDraft(d => {
    const next = { ...d, [key]: value }
    if (VISUAL_KEYS.has(key)) {
      applyVisual(next)
      const toSave = { zoom: next.zoom, fontFamily: next.fontFamily, headingFont: next.headingFont, headingSize: next.headingSize, accentColor: next.accentColor, voiceRate: next.voiceRate, mobileLayout: next.mobileLayout }
      localStorage.setItem(LS_KEY, JSON.stringify(toSave))
      api.patch('/settings/visual', {
        visual: {
          ...toSave,
          trainerReactions: localStorage.getItem('trainer_reactions') !== 'false',
          voiceName: localStorage.getItem(VOICE_KEY) || '',
        },
      }).catch(() => {})
    }
    return next
  })

  // Проверить ключ OpenAI: если в поле введён новый — проверяем его, иначе сохранённый.
  const handleTestKey = async () => {
    setKeyBusy(true); setKeyMsg({ kind: 'info', text: 'Проверяю ключ…' })
    try {
      const res = await store.testOpenaiKey(keyDraft.trim())
      setKeyMsg(res.ok ? { kind: 'ok', text: '✓ Ключ работает' } : { kind: 'err', text: res.error || 'Ключ не прошёл проверку' })
    } catch (e) {
      setKeyMsg({ kind: 'err', text: e?.message || 'Ошибка проверки' })
    } finally { setKeyBusy(false) }
  }

  // Сохранить введённый ключ (шифруется на сервере). Пустой ввод не сохраняем — для очистки есть «Удалить».
  const handleSaveKey = async () => {
    const k = keyDraft.trim()
    if (!k) { setKeyMsg({ kind: 'err', text: 'Введите ключ' }); return }
    setKeyBusy(true); setKeyMsg({ kind: 'info', text: 'Сохраняю…' })
    try {
      await store.saveOpenaiKey(k)
      setKeyDraft(''); setKeyMsg({ kind: 'ok', text: '✓ Ключ сохранён' })
    } catch (e) {
      setKeyMsg({ kind: 'err', text: e?.message || 'Ошибка сохранения' })
    } finally { setKeyBusy(false) }
  }

  // Удалить сохранённый ключ (вернуться на ключ сервера).
  const handleClearKey = async () => {
    setKeyBusy(true); setKeyMsg({ kind: 'info', text: 'Удаляю…' })
    try {
      await store.saveOpenaiKey('')
      setKeyDraft(''); setKeyMsg({ kind: 'info', text: 'Ключ удалён — используется ключ сервера' })
    } catch (e) {
      setKeyMsg({ kind: 'err', text: e?.message || 'Ошибка' })
    } finally { setKeyBusy(false) }
  }

  const handleSave = async () => {
    await store.saveSettings(draft)
    // store.saveSettings() шлёт в /settings/visual только 7 базовых полей — досылаем полный
    // блок следом, чтобы не потерять trainerReactions/voiceName (PATCH заменяет колонку целиком)
    saveFullVisual()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 80 }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px' }}>Аккаунт</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 20px' }}>
        Профиль и персональные настройки — применяются только для вашего аккаунта
      </p>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 2 }}>
        {TABS.map((tb, i) => (
          <button key={tb.id} onClick={() => selectTab(i)} style={{
            padding: '9px 16px', fontSize: 13.5, fontWeight: 600, borderRadius: '10px 10px 0 0',
            border: 'none', borderBottom: tab === i ? '2px solid var(--blue)' : '2px solid transparent',
            cursor: 'pointer', background: tab === i ? 'var(--surface)' : 'transparent',
            color: tab === i ? 'var(--blue)' : 'var(--ink-soft)',
          }}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 0 && <ProfileTab />}

      {tab === 1 && <>
      {/* ── Обучение ── */}
      <Section icon="🎯" title="Обучение">
        <Row
          label="Упражнений в день"
          hint={`Максимум упражнений за одну сессию «Сегодня». Сейчас: ${draft.daily_limit}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="range" min={5} max={300} step={5}
              value={draft.daily_limit}
              onChange={e => update('daily_limit', parseInt(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <div style={{
              minWidth: 54, textAlign: 'center', fontWeight: 700, fontSize: 15,
              background: 'var(--accent)', color: 'var(--accent-ink)',
              borderRadius: 8, padding: '4px 8px',
            }}>
              {draft.daily_limit}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {[20, 50, 100, 150, 200].map(v => (
              <button key={v} onClick={() => update('daily_limit', v)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: '1px solid var(--line)',
                  background: draft.daily_limit === v ? 'var(--accent)' : 'var(--surface-2)',
                  color: draft.daily_limit === v ? 'var(--accent-ink)' : 'var(--ink)',
                  fontWeight: draft.daily_limit === v ? 700 : 400,
                }}>
                {v}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            💡 Для детей 20–50 упражнений оптимально. Для взрослых — 50–100.
          </div>
        </Row>
      </Section>

      {/* ── Внешний вид ── */}
      <Section icon="🎨" title="Внешний вид">
        <Row label="Размер текста" hint="Масштаб всей страницы">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ZOOM_LEVELS.map(({ value, label }) => (
              <button key={value} onClick={() => update('zoom', value)}
                style={{
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid var(--line)', fontSize: 13,
                  background: draft.zoom === value ? 'var(--accent)' : 'var(--surface-2)',
                  color: draft.zoom === value ? 'var(--accent-ink)' : 'var(--ink)',
                  fontWeight: draft.zoom === value ? 700 : 400,
                }}>
                <span style={{ fontSize: 12 + (ZOOM_LEVELS.indexOf({ value, label }) * 2) }}>{label}</span>
              </button>
            ))}
          </div>
        </Row>

        <Row label="Шрифт">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FONTS.map(f => (
              <button key={f.id} onClick={() => update('fontFamily', f.id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${draft.fontFamily === f.id ? 'var(--accent)' : 'var(--line)'}`,
                  background: draft.fontFamily === f.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                <span style={{ fontFamily: f.id === 'Georgia' ? 'Georgia,serif' : f.id === 'Merriweather' ? 'Merriweather,Georgia,serif' : `${f.id},-apple-system,sans-serif`, fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                  {f.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'inherit' }}>{f.sample}</span>
              </button>
            ))}
          </div>
        </Row>

        <Row label="Шрифт заголовков">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[{ id: 'body', label: 'Как основной текст', sample: 'Совпадает с выбранным шрифтом' }, ...FONTS].map(f => (
              <button key={f.id} onClick={() => update('headingFont', f.id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${draft.headingFont === f.id ? 'var(--accent)' : 'var(--line)'}`,
                  background: draft.headingFont === f.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                <span style={{ fontFamily: f.id === 'body' ? 'inherit' : f.id === 'Georgia' ? 'Georgia,serif' : f.id === 'Merriweather' ? 'Merriweather,Georgia,serif' : `${f.id},-apple-system,sans-serif`, fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                  {f.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{f.sample}</span>
              </button>
            ))}
          </div>
        </Row>

        <Row label="Размер заголовков">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { value: 18, label: 'Мелкий' },
              { value: 20, label: 'Средний' },
              { value: 22, label: 'Обычный' },
              { value: 26, label: 'Крупный' },
              { value: 30, label: 'Очень крупный' },
            ].map(({ value, label }) => (
              <button key={value} onClick={() => update('headingSize', value)}
                style={{
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid var(--line)', fontSize: 13,
                  background: draft.headingSize === value ? 'var(--accent)' : 'var(--surface-2)',
                  color: draft.headingSize === value ? 'var(--accent-ink)' : 'var(--ink)',
                  fontWeight: draft.headingSize === value ? 700 : 400,
                }}>
                <span style={{ fontSize: value * 0.55 }}>{label}</span>
              </button>
            ))}
          </div>
        </Row>

        <Row label="Акцентный цвет">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {ACCENT_PRESETS.map(({ color, label }) => (
              <button key={color} onClick={() => update('accentColor', color)}
                title={label}
                style={{
                  width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                  border: draft.accentColor === color ? '3px solid var(--ink)' : '2px solid var(--line)',
                  background: color || '#C9A54A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {draft.accentColor === color && <span style={{ fontSize: 16, color: '#fff', textShadow: '0 0 3px #000' }}>✓</span>}
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="color" value={draft.accentColor || '#C9A54A'}
                onChange={e => update('accentColor', e.target.value)}
                style={{ width: 36, height: 36, padding: 2, borderRadius: '50%', cursor: 'pointer', border: '2px solid var(--line)', background: 'none' }}
              />
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Свой цвет</span>
            </div>
          </div>
        </Row>
      </Section>

      {/* ── Навигация ── */}
      <Section icon="📱" title="Мобильная навигация">
        <Row label="Тип меню на телефоне" hint="Влияет только на мобиль (≤640px). На планшете — всегда иконки. На ПК — всегда полный сайдбар.">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'bottom', label: '⬇ Нижняя панель', desc: 'Сегодня, Словарь, Читалка, Разговорник' },
              { id: 'strip',  label: '◀ Боковая полоска', desc: 'Иконки слева, как на планшете' },
            ].map(({ id, label, desc }) => (
              <button key={id} onClick={() => update('mobileLayout', id)}
                style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 140,
                  border: `2px solid ${(draft.mobileLayout || 'bottom') === id ? 'var(--accent)' : 'var(--line)'}`,
                  background: (draft.mobileLayout || 'bottom') === id ? 'var(--accent-soft)' : 'var(--surface-2)',
                }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>{desc}</div>
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* ── Голос ── */}
      <Section icon="🔊" title="Голос">
        <Row label="Скорость произношения" hint={`Текущая: ${draft.voiceRate.toFixed(1)}x`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Медленно</span>
            <input
              type="range" min={0.5} max={1.5} step={0.1}
              value={draft.voiceRate}
              onChange={e => update('voiceRate', parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Быстро</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {[0.6, 0.8, 0.9, 1.0, 1.2].map(v => (
              <button key={v} onClick={() => update('voiceRate', v)}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: '1px solid var(--line)',
                  background: draft.voiceRate === v ? 'var(--accent)' : 'var(--surface-2)',
                  color: draft.voiceRate === v ? 'var(--accent-ink)' : 'var(--ink)',
                }}>
                {v}x
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
            💡 Для начинающих рекомендуется 0.7–0.8, для опытных — 1.0–1.2
          </div>
        </Row>

        <VoicePicker key={`voice-${visualVersion}`} onSave={saveFullVisual} />
        <TrainerReactionsRow key={`reactions-${visualVersion}`} onSave={saveFullVisual} />
      </Section>

      {/* ── Видео-аватар (платная опция D-ID) ── */}
      {isOwner && (
        <Section icon="🎥" title="Видео-аватар тренера (платно)">
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.65 }}>
            В AI-тренере Pablo может <b>по-настоящему оживать</b> (движение губ) через сервис <b>D-ID</b> — это <b>платная</b> опция (тариф ~€79/мес или пакет кредитов). Каждая уникальная произнесённая фраза = 1 кредит.
            <div style={{ height: 10 }} />
            🟢 <b>Голосовой режим ✨ и готовые видео-клипы</b> (приветствие, «верно/неверно», «правильно так») работают <b>бесплатно и безлимитно</b> — кредиты D-ID не тратятся.
            <div style={{ height: 10 }} />
            Кнопка 🎥 «оживить» в тренере появляется, только когда на балансе D-ID остались кредиты. Пока генерировать видео может только учитель; тонкие лимиты по ученикам и тарифам — в отдельном спринте.
          </div>
        </Section>
      )}
      </>}

      {tab === 2 && <>
      {/* ── Интеграции ── */}
      <Section icon="🔑" title="Интеграции">
        <Row label="OpenAI API Key" hint="Свой ключ — обработка фото уроков, картинки, переводы и упражнения идут за ваш счёт. Хранится зашифрованным, на клиент не отдаётся.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type={keyVisible ? 'text' : 'password'}
              value={keyDraft}
              onChange={e => { setKeyDraft(e.target.value); setKeyMsg(null) }}
              placeholder={store.openai_key_set ? 'Ключ задан — введите новый, чтобы заменить' : 'sk-...'}
              autoComplete="off"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
            />
            <button onClick={() => setKeyVisible(v => !v)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--ink-soft)' }}>
              <i className={`bi bi-eye${keyVisible ? '-slash' : ''}`} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={handleTestKey} disabled={keyBusy}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: keyBusy ? 'default' : 'pointer', fontSize: 13, opacity: keyBusy ? 0.6 : 1 }}>
              🔍 Проверить
            </button>
            <button onClick={handleSaveKey} disabled={keyBusy || !keyDraft.trim()}
              style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', cursor: (keyBusy || !keyDraft.trim()) ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: (keyBusy || !keyDraft.trim()) ? 0.5 : 1 }}>
              💾 Сохранить ключ
            </button>
            {store.openai_key_set && (
              <button onClick={handleClearKey} disabled={keyBusy}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', color: 'var(--red)', cursor: keyBusy ? 'default' : 'pointer', fontSize: 13, opacity: keyBusy ? 0.6 : 1 }}>
                Удалить
              </button>
            )}
          </div>

          {keyMsg && (
            <div style={{ fontSize: 12, marginTop: 8, color: keyMsg.kind === 'ok' ? 'var(--good)' : keyMsg.kind === 'err' ? 'var(--red)' : 'var(--ink-soft)' }}>
              {keyMsg.text}
            </div>
          )}
          {store.openai_key_set && !keyMsg && (
            <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 8 }}>✓ Ключ задан{store.openai_key_mask ? ` (${store.openai_key_mask})` : ''}</div>
          )}
          {!store.openai_key_set && !keyMsg && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>Если не задан — используется ключ сервера. Получить: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a></div>
          )}
        </Row>

        {/* SMTP — только для owner */}
        {isOwner && (
          <Row label="Email уведомления (SMTP)"
            hint="Уведомления о новых сообщениях чата отправляются на sivtsov.pavel@gmail.com">
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent)' }}>
                📧 Как получить Gmail App Password:
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
                <li>Открой <b>myaccount.google.com</b> → Безопасность</li>
                <li>Включи двухэтапную аутентификацию (если не включена)</li>
                <li>Перейди в <b>Безопасность → Пароли приложений</b></li>
                <li>Создай новый: «Другое приложение» → «Deutsch.lernen»</li>
                <li>Скопируй 16-символьный пароль — вставь ниже</li>
              </ol>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 3 }}>SMTP хост</label>
                  <input value={draft.smtp_host} onChange={e => update('smtp_host', e.target.value)}
                    placeholder="smtp.gmail.com" style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 3 }}>Порт</label>
                  <input type="number" value={draft.smtp_port} onChange={e => update('smtp_port', parseInt(e.target.value))}
                    placeholder="587" style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 3 }}>Email (логин)</label>
                <input type="email" value={draft.smtp_user} onChange={e => update('smtp_user', e.target.value)}
                  placeholder="sivtsov.pavel@gmail.com" style={{ width: '100%', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'block', marginBottom: 3 }}>App Password (не обычный пароль!)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type={smtpPassVisible ? 'text' : 'password'} value={draft.smtp_pass}
                    onChange={e => update('smtp_pass', e.target.value)}
                    placeholder="xxxx xxxx xxxx xxxx"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }} />
                  <button onClick={() => setSmtpPassVisible(v => !v)}
                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--ink-soft)' }}>
                    <i className={`bi bi-eye${smtpPassVisible ? '-slash' : ''}`} />
                  </button>
                </div>
              </div>
              {draft.smtp_host && draft.smtp_user && draft.smtp_pass && (
                <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 2 }}>
                  ✓ SMTP настроен — письма будут отправляться при новых сообщениях в чате
                </div>
              )}
              {(!draft.smtp_host || !draft.smtp_user || !draft.smtp_pass) && (
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  Пока не настроен — уведомления только в Telegram
                </div>
              )}
            </div>
          </Row>
        )}
      </Section>
      </>}

      {tab === 3 && <>
      {/* Push уведомления */}
      <PushSection />
      <NotifyPrefsSection />
      </>}

      {/* Кнопка сохранения — для вкладок «Настройки» (daily_limit) и «Интеграции» (SMTP);
          визуальные поля (zoom/шрифт/голос/тема) уже сохраняются сразу через update().
          Профиль и Напоминания сохраняются своими кнопками внутри вкладок. */}
      {(tab === 1 || tab === 2) && (
      <button onClick={handleSave}
        style={{
          width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: saved ? 'var(--good)' : 'var(--accent)',
          color: saved ? '#fff' : 'var(--accent-ink)',
          fontSize: 16, fontWeight: 700,
          transition: 'background .3s',
        }}>
        {saved ? '✓ Сохранено!' : 'Сохранить настройки'}
      </button>
      )}
    </div>
  )
}

function PushSection() {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } = usePushNotifications()
  const [msg, setMsg] = useState('')

  if (!supported) return null

  const handleToggle = async () => {
    if (subscribed) {
      await unsubscribe()
      setMsg('Уведомления отключены')
    } else {
      const ok = await subscribe()
      setMsg(ok ? '✓ Уведомления включены! Напоминания придут по твоему времени (настрой ниже).' : 'Доступ к уведомлениям запрещён в настройках браузера.')
    }
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, marginBottom: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 18 }}>🔔</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Напоминания</span>
      </div>
      <div style={{ padding: '14px 18px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          Напоминание придёт в выбранное тобой время (по твоей таймзоне), если есть что
          повторить и ты не заходил. Работает даже когда сайт закрыт.
        </p>

        {permission === 'denied' ? (
          <div style={{ fontSize: 13, color: 'var(--red)', padding: '10px 14px', background: 'rgba(239,68,68,.1)', borderRadius: 8 }}>
            ⚠️ Уведомления заблокированы в браузере. Разреши их в настройках браузера для этого сайта.
          </div>
        ) : (
          <button onClick={handleToggle} disabled={loading} style={{
            padding: '10px 20px', borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer',
            background: subscribed ? 'var(--surface-2)' : 'var(--accent)',
            color: subscribed ? 'var(--ink)' : 'var(--accent-ink)',
            fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {loading ? '…' : subscribed ? (
              <><i className="bi bi-bell-slash" /> Отключить</>
            ) : (
              <><i className="bi bi-bell-fill" /> Включить уведомления</>
            )}
          </button>
        )}

        {msg && (
          <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('✓') ? 'var(--good)' : 'var(--red)' }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}

// Простой тумблер вкл/выкл
function ToggleSwitch({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      style={{
        position: 'relative', width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--surface-2)', transition: 'background .2s', flexShrink: 0,
      }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
      }} />
    </button>
  )
}

// Настройки уведомлений (Duolingo-стиль): тумблеры утро/вечер/вехи + выбор времени.
// Время в ЛОКАЛЬНОЙ таймзоне юзера (определяется автоматически, показываем какая).
function NotifyPrefsSection() {
  const DEFAULTS = { morning: { on: true, time: '09:00' }, evening: { on: true, time: '21:30' }, milestones: { on: true } }
  const user = useAuthStore(s => s.user)
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULTS, ...(user?.notify_prefs || {}) }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Подхватываем серверные значения, когда профиль (auth/me) подгрузился
  useEffect(() => {
    if (user?.notify_prefs) setPrefs({ ...DEFAULTS, ...user.notify_prefs })
  }, [user?.notify_prefs]) // eslint-disable-line react-hooks/exhaustive-deps

  const tz = user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const setSlot = (slot, patch) => setPrefs(p => ({ ...p, [slot]: { ...p[slot], ...patch } }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.put('/me/notify-prefs', { notify_prefs: prefs })
      const next = res.notify_prefs || prefs
      setPrefs(next)
      // Персистим в стор/localStorage, чтобы не сбрасывалось при перезаходе
      useAuthStore.setState(s => {
        const u = { ...(s.user || {}), notify_prefs: next }
        localStorage.setItem('user', JSON.stringify(u))
        return { user: u }
      })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch { /* сеть — молча */ }
    finally { setSaving(false) }
  }

  const cardRow = (label, hint, control) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{hint}</div>}
      </div>
      {control}
    </div>
  )
  const timeInput = (slot) => (
    <input type="time" value={prefs[slot].time} disabled={!prefs[slot].on}
      onChange={e => setSlot(slot, { time: e.target.value })}
      style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', opacity: prefs[slot].on ? 1 : 0.4 }} />
  )

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Когда напоминать</span>
      </div>
      <div style={{ padding: '4px 18px 14px' }}>
        {/* Утро */}
        {cardRow(
          'Утреннее напоминание',
          'Новый урок, что повторить сегодня',
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{timeInput('morning')}<ToggleSwitch on={prefs.morning.on} onChange={v => setSlot('morning', { on: v })} /></div>
        )}
        {/* Вечер */}
        {cardRow(
          'Вечернее напоминание',
          'Не потеряй серию 🔥, если не занимался',
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{timeInput('evening')}<ToggleSwitch on={prefs.evening.on} onChange={v => setSlot('evening', { on: v })} /></div>
        )}
        {/* Вехи */}
        {cardRow(
          'Поздравления с достижениями',
          'Вехи по словам и урокам 🏆',
          <ToggleSwitch on={prefs.milestones.on} onChange={v => setSlot('milestones', { on: v })} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={saving}
            style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '…' : 'Сохранить'}
          </button>
          {saved && <span style={{ fontSize: 13, color: 'var(--good)' }}>✓ Сохранено</span>}
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginLeft: 'auto' }}>Твоя таймзона: {tz}</span>
        </div>
      </div>
    </div>
  )
}
