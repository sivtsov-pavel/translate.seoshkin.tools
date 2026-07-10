import { useI18nStore } from '../store/i18n.js'

const LANGS = [
  { code: 'ru', label: '🇷🇺 RU' },
  { code: 'uk', label: '🇺🇦 UK' },
  { code: 'bg', label: '🇧🇬 BG' },
  { code: 'tr', label: '🇹🇷 TR' },
  { code: 'ar', label: '🇸🇦 AR' },
  { code: 'es', label: '🇪🇸 ES' },
  { code: 'fr', label: '🇫🇷 FR' },
  { code: 'de', label: '🇩🇪 DE' },
  { code: 'sq', label: '🇦🇱 SQ' },
  { code: 'en', label: '🇬🇧 EN' },
]

export default function LangSwitcher({ pill = false, dark = false }) {
  const { lang, setLang } = useI18nStore()

  const style = pill ? {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--surface-2)', border: '1px solid var(--line)',
    borderRadius: 999, padding: '8px 12px', fontSize: 13,
    color: 'var(--ink)', cursor: 'pointer', outline: 'none',
  } : {
    background: 'var(--surface-2)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 8, padding: '5px 8px', fontSize: 13,
    cursor: 'pointer', outline: 'none',
  }

  return (
    <select value={lang} onChange={e => setLang(e.target.value)} style={style}>
      {LANGS.map(l => (
        <option key={l.code} value={l.code} style={{ color: '#fff', background: '#1e1e1e' }}>
          {l.label}
        </option>
      ))}
    </select>
  )
}
