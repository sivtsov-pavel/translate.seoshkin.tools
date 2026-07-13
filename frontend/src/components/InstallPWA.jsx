import { useEffect, useState } from 'react'
import { useI18nStore } from '../store/i18n.js'

// Плавающая кнопка «Установить приложение».
// Chrome/Android/десктоп: ловим beforeinstallprompt и показываем свою кнопку
// (браузер сам подсказку глушит после установки/удаления). iOS Safari события не даёт —
// показываем инструкцию «Поделиться → На экран Домой».

const T = {
  install: { ru:'Установить приложение', uk:'Встановити застосунок', de:'App installieren', en:'Install app', bg:'Инсталирай приложението', tr:'Uygulamayı yükle', ar:'تثبيت التطبيق', es:'Instalar la app', fr:'Installer l’app', sq:'Instalo aplikacionin' },
  later:   { ru:'Позже', uk:'Пізніше', de:'Später', en:'Later', bg:'По-късно', tr:'Sonra', ar:'لاحقاً', es:'Más tarde', fr:'Plus tard', sq:'Më vonë' },
  iosHint: { ru:'Нажмите «Поделиться» ⬆️ и выберите «На экран „Домой"»', uk:'Натисніть «Поділитися» ⬆️ і оберіть «На екран „Початок"»', de:'Tippe auf „Teilen" ⬆️ und „Zum Home-Bildschirm"', en:'Tap Share ⬆️ then “Add to Home Screen”', bg:'Натиснете „Споделяне" ⬆️ и „Към начален екран"', tr:'Paylaş ⬆️ ve “Ana Ekrana Ekle”', ar:'اضغط مشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية»', es:'Toca Compartir ⬆️ y “Añadir a inicio”', fr:'Appuyez sur Partager ⬆️ puis « Sur l’écran d’accueil »', sq:'Shtyp Ndaj ⬆️ dhe “Shto në ekran”' },
}
const tr = (key, lang) => T[key][lang] || T[key].en

export default function InstallPWA() {
  const { lang } = useI18nStore()
  const [deferred, setDeferred] = useState(null)   // событие beforeinstallprompt (Android/десктоп)
  const [showIos, setShowIos] = useState(false)    // подсказка для iOS
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa_install_dismissed') === '1')

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

  useEffect(() => {
    if (isStandalone()) return // уже установлено — не показываем

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e) }
    const onInstalled = () => { setDeferred(null); setShowIos(false); localStorage.setItem('pwa_install_dismissed', '1') }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari: события нет — показываем инструкцию (только Safari, не в standalone)
    const ua = window.navigator.userAgent
    const isIos = /iP(hone|ad|od)/.test(ua)
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    if (isIos && isSafari) setShowIos(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => { setDismissed(true); localStorage.setItem('pwa_install_dismissed', '1') }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setDeferred(null)
  }

  if (dismissed || isStandalone()) return null
  if (!deferred && !showIos) return null

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-h, 0px) + 12px)',
      zIndex: 3000, maxWidth: 440, margin: '0 auto',
      background: 'var(--surface, #fff)', color: 'var(--ink, #111)',
      border: '1px solid var(--line, #ddd)', borderRadius: 14,
      boxShadow: '0 8px 30px rgba(0,0,0,0.22)',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <img src="/icons/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {deferred ? (
          <div style={{ fontWeight: 700, fontSize: 14 }}>{tr('install', lang)}</div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.35 }}>{tr('iosHint', lang)}</div>
        )}
      </div>
      {deferred && (
        <button onClick={install} style={{
          padding: '9px 16px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
          background: 'var(--accent, #C9A54A)', color: 'var(--accent-ink, #111)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        }}>{tr('install', lang)}</button>
      )}
      <button onClick={dismiss} aria-label={tr('later', lang)} style={{
        background: 'none', border: 'none', color: 'var(--ink-soft, #888)', cursor: 'pointer',
        fontSize: 20, lineHeight: 1, flexShrink: 0, padding: 4,
      }}>✕</button>
    </div>
  )
}
