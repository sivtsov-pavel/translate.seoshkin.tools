import { useI18nStore } from '../store/i18n.js'

const LANGS = [
  { code: 'ru', label: 'RU' },
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' },
]

// dark=true — белые кнопки (для тёмного навбара), dark=false — тёмные (для светлого фона)
export default function LangSwitcher({ dark = false }) {
  const { lang, setLang } = useI18nStore()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {LANGS.map((l, i) => (
        <span key={l.code} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <span style={{ color: dark ? '#a5b4fc' : '#d1d5db', margin: '0 2px', fontSize: 12 }}>|</span>}
          <button
            onClick={() => setLang(l.code)}
            title={l.code.toUpperCase()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 4px',
              fontWeight: lang === l.code ? 700 : 400,
              color: dark
                ? (lang === l.code ? '#fff' : '#a5b4fc')
                : (lang === l.code ? '#4f46e5' : '#6b7280'),
              textDecoration: lang === l.code ? 'underline' : 'none',
            }}>
            {l.label}
          </button>
        </span>
      ))}
    </div>
  )
}
