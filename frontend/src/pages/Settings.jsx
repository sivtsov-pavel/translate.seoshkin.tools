import { useState, useEffect, useRef } from 'react'
import { useSettingsStore, applyVisual } from '../store/settings.js'
import { useAuthStore } from '../store/auth.js'

const VOICE_KEY = 'de_voice_name'

function VoicePicker() {
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
  const [saved, setSaved] = useState(false)
  const [keyVisible, setKeyVisible]   = useState(false)
  const [smtpPassVisible, setSmtpPassVisible] = useState(false)

  const [draft, setDraft] = useState({
    daily_limit:  store.daily_limit,
    openai_key:   store.openai_key,
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
      openai_key:   store.openai_key,
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

  const VISUAL_KEYS = new Set(['zoom', 'fontFamily', 'headingFont', 'headingSize', 'accentColor', 'voiceRate', 'mobileLayout'])
  const LS_KEY = 'app_visual_settings'

  // Визуальные настройки применяются И сохраняются сразу — без нажатия «Сохранить»
  const update = (key, value) => setDraft(d => {
    const next = { ...d, [key]: value }
    if (VISUAL_KEYS.has(key)) {
      applyVisual(next)
      const toSave = { zoom: next.zoom, fontFamily: next.fontFamily, headingFont: next.headingFont, headingSize: next.headingSize, accentColor: next.accentColor, voiceRate: next.voiceRate, mobileLayout: next.mobileLayout }
      localStorage.setItem(LS_KEY, JSON.stringify(toSave))
    }
    return next
  })

  const handleSave = async () => {
    await store.saveSettings(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 80 }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 4px' }}>⚙️ Настройки</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 24px' }}>
        Персональные настройки — применяются только для вашего аккаунта
      </p>

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

        <VoicePicker />
      </Section>

      {/* ── Интеграции ── */}
      <Section icon="🔑" title="Интеграции">
        <Row label="OpenAI API Key" hint="Нужен для обработки фото уроков, перевода и проверки упражнений. Хранится в вашем профиле.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type={keyVisible ? 'text' : 'password'}
              value={draft.openai_key || ''}
              onChange={e => update('openai_key', e.target.value)}
              placeholder="sk-..."
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
            />
            <button onClick={() => setKeyVisible(v => !v)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--ink-soft)' }}>
              <i className={`bi bi-eye${keyVisible ? '-slash' : ''}`} />
            </button>
          </div>
          {draft.openai_key && <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 4 }}>✓ Ключ задан</div>}
          {!draft.openai_key && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Если не задан — используется ключ сервера. Получить: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a></div>}
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

      {/* Кнопка сохранения */}
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
    </div>
  )
}
