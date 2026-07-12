import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18nStore } from '../store/i18n.js'

// Локализованный текст согласия на cookie
const T = {
  ru: { text: 'Мы используем cookie для работы сайта и улучшения сервиса.', accept: 'Принять', more: 'Подробнее' },
  uk: { text: 'Ми використовуємо cookie для роботи сайту та покращення сервісу.', accept: 'Прийняти', more: 'Детальніше' },
  en: { text: 'We use cookies to run the site and improve the service.', accept: 'Accept', more: 'Learn more' },
  de: { text: 'Wir verwenden Cookies für den Betrieb der Website und zur Verbesserung des Dienstes.', accept: 'Akzeptieren', more: 'Mehr' },
  bg: { text: 'Използваме бисквитки за работата на сайта и подобряване на услугата.', accept: 'Приемам', more: 'Повече' },
  tr: { text: 'Sitenin çalışması ve hizmeti iyileştirmek için çerezleri kullanıyoruz.', accept: 'Kabul et', more: 'Daha fazla' },
  ar: { text: 'نستخدم ملفات تعريف الارتباط لتشغيل الموقع وتحسين الخدمة.', accept: 'موافق', more: 'المزيد' },
  es: { text: 'Usamos cookies para el funcionamiento del sitio y mejorar el servicio.', accept: 'Aceptar', more: 'Más' },
  fr: { text: 'Nous utilisons des cookies pour le fonctionnement du site et améliorer le service.', accept: 'Accepter', more: 'En savoir plus' },
  sq: { text: 'Përdorim cookie për funksionimin e faqes dhe përmirësimin e shërbimit.', accept: 'Pranoj', more: 'Më shumë' },
}

export default function CookieConsent() {
  const { lang } = useI18nStore()
  const [accepted, setAccepted] = useState(() => localStorage.getItem('cookie_consent') === '1')
  if (accepted) return null

  const s = T[lang] || T.en
  const accept = () => {
    localStorage.setItem('cookie_consent', '1')
    setAccepted(true)
  }

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 3000,
      background: 'var(--surface)', borderTop: '1px solid var(--line)',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.18)',
      padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 13, color: 'var(--ink)', flex: '1 1 260px', lineHeight: 1.5 }}>
        🍪 {s.text}{' '}
        <Link to="/cookies" style={{ color: 'var(--accent)' }}>{s.more}</Link>
      </span>
      <button onClick={accept} style={{
        padding: '9px 22px', borderRadius: 10, border: 'none',
        background: 'var(--accent)', color: 'var(--accent-ink)',
        fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0,
      }}>
        {s.accept}
      </button>
    </div>
  )
}
