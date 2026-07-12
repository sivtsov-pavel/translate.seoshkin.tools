import { useState, useEffect, useRef } from 'react'
import { useI18nStore } from '../store/i18n.js'

const LANGS = [
  { code: 'de', label: '🇩🇪', name: 'DE' },
  { code: 'uk', label: '🇺🇦', name: 'UK' },
  { code: 'bg', label: '🇧🇬', name: 'BG' },
  { code: 'tr', label: '🇹🇷', name: 'TR' },
  { code: 'ar', label: '🇸🇦', name: 'AR' },
  { code: 'es', label: '🇪🇸', name: 'ES' },
  { code: 'fr', label: '🇫🇷', name: 'FR' },
  { code: 'sq', label: '🇦🇱', name: 'SQ' },
  { code: 'en', label: '🇬🇧', name: 'EN' },
  { code: 'ru', label: '🇷🇺', name: 'RU' },
]

export default function LangSwitcher({ pill = false, dropUp = false }) {
  const { lang, setLang } = useI18nStore()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  // Закрываем при клике вне
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const pick = (code) => {
    setLang(code)
    setOpen(false)
  }

  const triggerStyle = pill ? {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--surface-2)', border: '1px solid var(--line)',
    borderRadius: 999, padding: '7px 11px', fontSize: 13,
    color: 'var(--ink)', cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
  } : {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--surface-2)', border: '1px solid var(--line)',
    borderRadius: 8, padding: '5px 9px', fontSize: 13,
    color: 'var(--ink)', cursor: 'pointer', userSelect: 'none',
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Кнопка-триггер */}
      <button
        onClick={() => setOpen(v => !v)}
        style={triggerStyle}
      >
        <span style={{ fontSize: 16 }}>{current.label}</span>
        <span>{current.name}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, opacity: 0.6 }} />
      </button>

      {/* Дропдаун с флагами — залипает пока не выберешь */}
      {open && (
        <div style={{
          position: 'absolute', [dropUp ? 'bottom' : 'top']: 'calc(100% + 6px)', right: 0,
          zIndex: 2000,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          padding: 8,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
          minWidth: 220,
        }}>
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '8px 4px', borderRadius: 10,
                border: l.code === lang ? '2px solid var(--accent)' : '2px solid transparent',
                background: l.code === lang ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                color: l.code === lang ? 'var(--accent)' : 'var(--ink)',
                transition: 'background .1s',
              }}
            >
              <span style={{ fontSize: 22 }}>{l.label}</span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
