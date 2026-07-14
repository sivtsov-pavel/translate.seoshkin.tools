// Переключатель ИЗУЧАЕМОГО языка (мульти-таргет). Меняет активный target_lang и
// перезагружает — весь контент (уроки/слова/озвучка) переключается на новый язык.
const LANGS = [
  { code: 'de', flag: '🇩🇪', name: 'Немецкий' },
  { code: 'es', flag: '🇪🇸', name: 'Испанский' },
  { code: 'fr', flag: '🇫🇷', name: 'Французский' },
  { code: 'it', flag: '🇮🇹', name: 'Итальянский' },
  { code: 'en', flag: '🇬🇧', name: 'Английский' },
  { code: 'pt', flag: '🇵🇹', name: 'Португальский' },
]

export default function TargetSwitcher() {
  const cur = localStorage.getItem('target_lang') || 'de'
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
        border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.18)',
        color: 'var(--accent-ink)', cursor: 'pointer',
      }}>
      {LANGS.map(l => <option key={l.code} value={l.code} style={{ color: '#111' }}>{l.flag} Учу: {l.name}</option>)}
    </select>
  )
}
