import { useEffect, useState } from 'react'
import { useI18nStore } from '../store/i18n.js'
// Определение режима запуска — общее с блоком виджета (utils/device.js)
import { isStandalone, isAndroidApp } from '../utils/device.js'

// Блок «Установить приложение» в настройках: PWA и APK рядом, с честным объяснением
// разницы. Стандарт для всех наших приложений (см. ~/.claude/CLAUDE.md).
//
// Почему оба варианта нужны:
//   • PWA ставится в один тап из браузера, обновляется само, работает и на iPhone,
//     но на Android живёт по правилам браузера (например, чистка данных Chrome её задевает);
//   • APK — обычное приложение Android: свой значок, не зависит от браузера, но обновляется
//     только вручную, скачиванием нового файла.
//
// APK у нас — TWA-обёртка: внутри тот же сайт. Поэтому обновления приложения приезжают
// сами, а перекачивать APK нужно, только когда меняется сама оболочка (домен, иконки,
// разрешения). Это прямо сказано в блоке — иначе люди переустанавливают зря.
const APK_URL = '/downloads/deutsch-lernen.apk'

const T = {
  title:      { ru: 'Приложение на телефон', en: 'Mobile app', de: 'App fürs Handy', uk: 'Застосунок на телефон', es: 'App para el móvil', fr: 'Application mobile', bg: 'Приложение за телефон', tr: 'Telefon uygulaması', ar: 'تطبيق الهاتف', sq: 'Aplikacioni në telefon' },
  pwaName:    { ru: 'Установить как приложение (PWA)', en: 'Install as app (PWA)', de: 'Als App installieren (PWA)', uk: 'Встановити як застосунок (PWA)', es: 'Instalar como app (PWA)', fr: 'Installer comme app (PWA)', bg: 'Инсталирай като приложение (PWA)', tr: 'Uygulama olarak yükle (PWA)', ar: 'تثبيت كتطبيق (PWA)', sq: 'Instalo si aplikacion (PWA)' },
  pwaDesc:    { ru: 'Один тап из браузера, обновляется само. Работает и на iPhone.', en: 'One tap from the browser, updates itself. Works on iPhone too.', de: 'Ein Tipp im Browser, aktualisiert sich selbst. Auch auf dem iPhone.', uk: 'Один дотик у браузері, оновлюється саме. Працює і на iPhone.', es: 'Un toque desde el navegador, se actualiza solo. También en iPhone.', fr: 'Un tap depuis le navigateur, se met à jour tout seul. Fonctionne aussi sur iPhone.', bg: 'Едно докосване в браузъра, обновява се само. Работи и на iPhone.', tr: 'Tarayıcıdan tek dokunuş, kendi güncellenir. iPhone’da da çalışır.', ar: 'نقرة واحدة من المتصفح، ويحدّث نفسه. يعمل على iPhone أيضًا.', sq: 'Një prekje nga shfletuesi, përditësohet vetë. Punon edhe në iPhone.' },
  apkName:    { ru: 'Скачать APK (Android)', en: 'Download APK (Android)', de: 'APK laden (Android)', uk: 'Завантажити APK (Android)', es: 'Descargar APK (Android)', fr: 'Télécharger l’APK (Android)', bg: 'Изтегли APK (Android)', tr: 'APK indir (Android)', ar: 'تنزيل APK (أندرويد)', sq: 'Shkarko APK (Android)' },
  apkUpdate:  { ru: 'Обновить APK', en: 'Update APK', de: 'APK aktualisieren', uk: 'Оновити APK', es: 'Actualizar APK', fr: 'Mettre à jour l’APK', bg: 'Обнови APK', tr: 'APK’yı güncelle', ar: 'تحديث APK', sq: 'Përditëso APK' },
  apkDesc:    { ru: 'Обычное приложение Android: свой значок, не зависит от браузера. Обновляется вручную.', en: 'A regular Android app: own icon, independent of the browser. Updated manually.', de: 'Normale Android-App: eigenes Icon, unabhängig vom Browser. Manuelles Update.', uk: 'Звичайний застосунок Android: свій значок, не залежить від браузера. Оновлюється вручну.', es: 'App de Android normal: icono propio, independiente del navegador. Se actualiza a mano.', fr: 'Application Android classique : icône propre, indépendante du navigateur. Mise à jour manuelle.', bg: 'Обикновено Android приложение: собствена икона, независимо от браузъра. Обновява се ръчно.', tr: 'Normal Android uygulaması: kendi simgesi, tarayıcıdan bağımsız. Elle güncellenir.', ar: 'تطبيق أندرويد عادي: أيقونة خاصة، مستقل عن المتصفح. يُحدَّث يدويًا.', sq: 'Aplikacion normal Android: ikonë e vet, i pavarur nga shfletuesi. Përditësohet manualisht.' },
  installed:  { ru: 'Уже установлено', en: 'Already installed', de: 'Bereits installiert', uk: 'Вже встановлено', es: 'Ya instalada', fr: 'Déjà installée', bg: 'Вече е инсталирано', tr: 'Zaten yüklü', ar: 'مثبَّت بالفعل', sq: 'Tashmë i instaluar' },
  iosHint:    { ru: 'На iPhone: «Поделиться» ⬆️ → «На экран „Домой"»', en: 'On iPhone: Share ⬆️ → “Add to Home Screen”', de: 'Auf dem iPhone: Teilen ⬆️ → „Zum Home-Bildschirm"', uk: 'На iPhone: «Поділитися» ⬆️ → «На екран „Початок"»', es: 'En iPhone: Compartir ⬆️ → “Añadir a inicio”', fr: 'Sur iPhone : Partager ⬆️ → « Sur l’écran d’accueil »', bg: 'На iPhone: «Споделяне» ⬆️ → «Към начален екран»', tr: 'iPhone’da: Paylaş ⬆️ → “Ana Ekrana Ekle”', ar: 'على iPhone: مشاركة ⬆️ ← «إضافة إلى الشاشة الرئيسية»', sq: 'Në iPhone: Ndaj ⬆️ → “Shto në ekran”' },
  autoUpdate: { ru: 'Само приложение — это тот же сайт в обёртке, поэтому новые возможности приезжают сами. Перекачивать APK нужно, только когда меняется сама оболочка.', en: 'The app wraps the same site, so new features arrive on their own. Re-downloading the APK is only needed when the shell itself changes.', de: 'Die App umhüllt dieselbe Website, neue Funktionen kommen von selbst. Ein neues APK braucht es nur, wenn sich die Hülle ändert.', uk: 'Застосунок — це той самий сайт в обгортці, тож нові можливості приїздять самі. Перезавантажувати APK треба лише коли змінюється сама оболонка.', es: 'La app envuelve el mismo sitio: las novedades llegan solas. Solo hace falta bajar el APK de nuevo si cambia la propia carcasa.', fr: 'L’app enveloppe le même site : les nouveautés arrivent seules. Retélécharger l’APK n’est utile que si la coque change.', bg: 'Приложението е същият сайт в обвивка — новите функции идват сами. APK се сваля наново само когато се променя обвивката.', tr: 'Uygulama aynı siteyi sarar, yenilikler kendiliğinden gelir. APK’yı yeniden indirmek yalnızca kabuk değişince gerekir.', ar: 'التطبيق غلاف للموقع نفسه، لذا تصل الميزات الجديدة تلقائيًا. إعادة تنزيل APK لازمة فقط عند تغيّر الغلاف.', sq: 'Aplikacioni mbështjell të njëjtin sajt, prandaj risitë vijnë vetë. APK-ja rishkarkohet vetëm kur ndryshon vetë guaska.' },
}
const tr = (key, lang) => T[key][lang] || T[key].en


export default function AppInstallBlock() {
  const { lang } = useI18nStore()
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(isStandalone())
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '')

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e) }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const installPwa = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  const inApp = isAndroidApp()

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>📱 {tr('title', lang)}</div>

      {/* PWA */}
      <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{tr('pwaName', lang)}</div>
          {installed ? (
            <span style={{ fontSize: 13, color: 'var(--good)', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ {tr('installed', lang)}</span>
          ) : deferred ? (
            <button onClick={installPwa}
              style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {tr('pwaName', lang).split(' ')[0]}
            </button>
          ) : null}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>{tr('pwaDesc', lang)}</div>
        {!installed && isIos && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6 }}>{tr('iosHint', lang)}</div>
        )}
      </div>

      {/* APK */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{inApp ? tr('apkUpdate', lang) : tr('apkName', lang)}</div>
          <a href={APK_URL} download
            style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            ⬇️ APK
          </a>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 4 }}>{tr('apkDesc', lang)}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6, opacity: 0.85 }}>{tr('autoUpdate', lang)}</div>
      </div>
    </div>
  )
}
