import { useI18nStore } from '../store/i18n.js'

// Переключатель ИЗУЧАЕМОГО языка (мульти-таргет). Меняет target_lang и перезагружает.
// Названия языков — на языке ИНТЕРФЕЙСА (Intl.DisplayNames), без хардкода → переведены везде.
const LANGS = [
  { code: 'de', flag: '🇩🇪' }, { code: 'es', flag: '🇪🇸' }, { code: 'fr', flag: '🇫🇷' },
  { code: 'it', flag: '🇮🇹' }, { code: 'en', flag: '🇬🇧' }, { code: 'pt', flag: '🇵🇹' },
]

export default function TargetSwitcher() {
  const { lang } = useI18nStore()
  const cur = localStorage.getItem('target_lang') || 'de'
  let dn = null
  try { dn = new Intl.DisplayNames([lang || 'ru'], { type: 'language' }) } catch { /* нет Intl — фолбэк на код */ }
  const nameOf = (code) => {
    const n = dn?.of(code)
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code.toUpperCase()
  }
  const change = (code) => {
    if (code === cur) return
    localStorage.setItem('target_lang', code)
    window.location.reload()
  }
  return (
    <select value={cur} onChange={e => change(e.target.value)}
      title="Какой язык учим"
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        border: '1px solid var(--line)', background: 'var(--surface)',
        color: 'var(--ink)', cursor: 'pointer',
      }}>
      {LANGS.map(l => <option key={l.code} value={l.code} style={{ color: '#111' }}>{l.flag} {nameOf(l.code)}</option>)}
    </select>
  )
}
