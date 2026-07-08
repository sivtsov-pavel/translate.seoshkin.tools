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
  { code: 'en', label: '🇬🇧 EN' },
]

// dark=true — для тёмного навбара, dark=false — для светлого фона
export default function LangSwitcher({ dark = false }) {
  const { lang, setLang } = useI18nStore()

  return (
    <select
      value={lang}
      onChange={e => setLang(e.target.value)}
      style={{
        background: dark ? 'rgba(255,255,255,0.15)' : '#f9fafb',
        color: dark ? '#fff' : '#374151',
        border: dark ? '1px solid rgba(255,255,255,0.3)' : '1px solid #d1d5db',
        borderRadius: 6,
        padding: '3px 6px',
        fontSize: 13,
        cursor: 'pointer',
        outline: 'none',
      }}>
      {LANGS.map(l => (
        <option key={l.code} value={l.code} style={{ color: '#374151', background: '#fff' }}>
          {l.label}
        </option>
      ))}
    </select>
  )
}
