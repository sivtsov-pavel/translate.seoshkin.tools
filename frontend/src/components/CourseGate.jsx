import { useI18nStore } from '../store/i18n.js'

// Гейт выбора ИЗУЧАЕМОГО языка — окно приветствия при первом входе + по кнопке «Сменить курс».
// Полноэкранное, кремовый фон, плитки языков с флагом/названием/полоской флага.
const META = {
  de: { flag: '🇩🇪', stripe: ['#1a1a1a', '#dd0000', '#ffce00'] },
  es: { flag: '🇪🇸', stripe: ['#AA151B', '#F1BF00', '#AA151B'] },
  en: { flag: '🇬🇧', stripe: ['#012169', '#ffffff', '#C8102E'] },
  fr: { flag: '🇫🇷', stripe: ['#0055A4', '#ffffff', '#EF4135'] },
  it: { flag: '🇮🇹', stripe: ['#008C45', '#ffffff', '#CD212A'] },
  pt: { flag: '🇵🇹', stripe: ['#006600', '#ffffff', '#FF0000'] },
}

export default function CourseGate({ langs, onClose, runTourAfter }) {
  const { t, lang } = useI18nStore()
  const list = (langs && langs.length ? langs : ['de']).filter(c => META[c])
  let dn = null
  try { dn = new Intl.DisplayNames([lang || 'ru'], { type: 'language' }) } catch { /* фолбэк */ }
  const nameOf = (c) => { const n = dn?.of(c); return n ? n.charAt(0).toUpperCase() + n.slice(1) : c.toUpperCase() }

  const pick = (code) => {
    localStorage.setItem('target_lang', code)
    localStorage.setItem('lang_chosen', '1')
    // Первый вход: после выбора языка — запустить тур (флаг переживёт reload)
    if (runTourAfter) { localStorage.removeItem('tour_seen_v1'); localStorage.setItem('run_tour_after', '1') }
    window.location.reload() // весь контент переключится на выбранный язык
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: 6 }}>
          {t.nav.chooseLanguage || 'Выбери язык'}
        </div>
        <h1 style={{ fontFamily: 'var(--heading-font)', fontSize: 26, margin: '0 0 22px', color: 'var(--ink)' }}>
          {t.nav.whichCourse || 'Какой курс продолжим?'}
        </h1>
        <div style={{ display: 'grid', gridTemplateColumns: list.length > 1 ? '1fr 1fr' : '1fr', gap: 12 }}>
          {list.map(code => (
            <button key={code} onClick={() => pick(code)}
              style={{ background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 18, padding: '14px 14px 18px', cursor: 'pointer', boxShadow: 'var(--card-shadow)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <img src={`/uploads/lang-cards/${code}.webp`} alt="" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'block' }}
                style={{ width: '100%', aspectRatio: '3/2', objectFit: 'cover', borderRadius: 12 }} />
              <span style={{ fontSize: 40, lineHeight: 1, display: 'none' }}>{META[code].flag}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{nameOf(code)}</span>
              <span style={{ display: 'block', height: 4, width: 44, borderRadius: 3, background: `linear-gradient(90deg, ${META[code].stripe.join(',')})` }} />
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 18 }}>{t.nav.courseHint || 'Курс всегда можно сменить кнопкой сверху'}</p>
        {onClose && (
          <button onClick={onClose} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>✕ {t.exercise?.toHome || 'Закрыть'}</button>
        )}
      </div>
    </div>
  )
}
