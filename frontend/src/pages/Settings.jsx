import { useState, useEffect } from 'react'
import { useSettingsStore } from '../store/settings.js'

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
  const [saved, setSaved] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)

  // Локальный черновик — применяем в реальном времени только визуальные
  const [draft, setDraft] = useState({
    daily_limit: store.daily_limit,
    openai_key:  store.openai_key,
    zoom:        store.zoom,
    fontFamily:  store.fontFamily,
    accentColor: store.accentColor,
    voiceRate:   store.voiceRate,
  })

  useEffect(() => {
    if (!store.loaded) store.fetchSettings()
  }, [])

  useEffect(() => {
    setDraft({
      daily_limit: store.daily_limit,
      openai_key:  store.openai_key,
      zoom:        store.zoom,
      fontFamily:  store.fontFamily,
      accentColor: store.accentColor,
      voiceRate:   store.voiceRate,
    })
  }, [store.loaded])

  const update = (key, value) => setDraft(d => ({ ...d, [key]: value }))

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
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          Голос и автопроизношение настраиваются в боковой панели слева.
        </div>
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
          {draft.openai_key && (
            <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 4 }}>
              ✓ Ключ задан — ИИ будет использовать ваш аккаунт
            </div>
          )}
          {!draft.openai_key && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              Если не задан — используется ключ сервера
            </div>
          )}
        </Row>
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
