import { useEffect, useState } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { api } from '../api/client.js'
import { isAndroidApp } from '../utils/device.js'

// Блок «Виджет на домашнем экране» в настройках.
//
// Виджет живёт в нативной части Android-приложения и до куки сайта не достаёт: Custom Tabs
// изолирован. Поэтому включение — это выдача отдельного узкого токена и передача его в
// приложение ссылкой intent://. Выключение отзывает токен на сервере: виджет получает 401,
// перестаёт ходить в сеть и показывает «отключён». Просто спрятать блок было бы обманом —
// выключенный виджет продолжал бы будить телефон каждые полчаса.
//
// Блок показываем ТОЛЬКО внутри нашей Android-обёртки: в браузере и на iPhone виджета не
// существует, и предлагать его там — отправлять человека искать то, чего нет.
const PACKAGE_ID = 'tools.seoshkin.translate'

const T = {
  title:     { ru: 'Виджет на домашнем экране', en: 'Home screen widget', de: 'Widget auf dem Startbildschirm', uk: 'Віджет на домашньому екрані', es: 'Widget en la pantalla de inicio', fr: 'Widget sur l’écran d’accueil', bg: 'Уиджет на началния екран', tr: 'Ana ekran widget’ı', ar: 'أداة على الشاشة الرئيسية', sq: 'Widget në ekranin bazë' },
  desc:      { ru: 'Показывает, сколько осталось до нового урока — не открывая приложение.', en: 'Shows how much is left before the next lesson opens — without opening the app.', de: 'Zeigt, wie viel bis zur nächsten Lektion fehlt — ohne die App zu öffnen.', uk: 'Показує, скільки лишилося до нового уроку — не відкриваючи застосунок.', es: 'Muestra cuánto falta para la siguiente lección, sin abrir la app.', fr: 'Montre ce qu’il reste avant la prochaine leçon, sans ouvrir l’application.', bg: 'Показва колко остава до новия урок — без да отваряте приложението.', tr: 'Yeni ders açılana kadar ne kaldığını uygulamayı açmadan gösterir.', ar: 'يعرض كم تبقّى لفتح الدرس التالي دون فتح التطبيق.', sq: 'Tregon sa mbetet deri te mësimi i ri — pa hapur aplikacionin.' },
  enable:    { ru: 'Включить виджет', en: 'Enable widget', de: 'Widget aktivieren', uk: 'Увімкнути віджет', es: 'Activar widget', fr: 'Activer le widget', bg: 'Включи уиджета', tr: 'Widget’ı aç', ar: 'تفعيل الأداة', sq: 'Aktivizo widget-in' },
  disable:   { ru: 'Выключить', en: 'Disable', de: 'Deaktivieren', uk: 'Вимкнути', es: 'Desactivar', fr: 'Désactiver', bg: 'Изключи', tr: 'Kapat', ar: 'إيقاف', sq: 'Çaktivizo' },
  on:        { ru: 'Включён', en: 'Enabled', de: 'Aktiv', uk: 'Увімкнено', es: 'Activado', fr: 'Activé', bg: 'Включен', tr: 'Açık', ar: 'مفعّلة', sq: 'Aktiv' },
  howto:     { ru: 'Теперь добавьте его: долгое нажатие на домашнем экране → «Виджеты» → Deutsch.', en: 'Now add it: long-press the home screen → “Widgets” → Deutsch.', de: 'Jetzt hinzufügen: lange auf den Startbildschirm tippen → „Widgets“ → Deutsch.', uk: 'Тепер додайте його: довге натискання на домашньому екрані → «Віджети» → Deutsch.', es: 'Ahora añádelo: mantén pulsada la pantalla de inicio → “Widgets” → Deutsch.', fr: 'Ajoutez-le : appui long sur l’écran d’accueil → « Widgets » → Deutsch.', bg: 'Сега го добавете: задръжте на началния екран → «Уиджети» → Deutsch.', tr: 'Şimdi ekleyin: ana ekrana uzun basın → “Widget’lar” → Deutsch.', ar: 'أضِفها الآن: اضغط مطوّلًا على الشاشة الرئيسية ← «الأدوات» ← Deutsch.', sq: 'Tani shtoje: shtyp gjatë në ekranin bazë → “Widget-et” → Deutsch.' },
  noApk:     { ru: 'Ничего не произошло? Обновите APK — виджет появился в новой версии приложения.', en: 'Nothing happened? Update the APK — the widget arrived in a newer app version.', de: 'Nichts passiert? APK aktualisieren — das Widget kam mit einer neueren Version.', uk: 'Нічого не сталося? Оновіть APK — віджет з’явився в новій версії застосунку.', es: '¿No pasó nada? Actualiza el APK: el widget llegó en una versión nueva.', fr: 'Rien ne s’est passé ? Mettez à jour l’APK : le widget est arrivé dans une version plus récente.', bg: 'Нищо не се случи? Обновете APK — уиджетът дойде с нова версия.', tr: 'Bir şey olmadı mı? APK’yı güncelleyin — widget yeni sürümle geldi.', ar: 'لم يحدث شيء؟ حدِّث APK — وصلت الأداة في إصدار أحدث.', sq: 'S’ndodhi asgjë? Përditëso APK-në — widget-i erdhi me një version të ri.' },
  preview:   { ru: 'Сейчас на виджете', en: 'On the widget now', de: 'Aktuell im Widget', uk: 'Зараз на віджеті', es: 'Ahora en el widget', fr: 'Actuellement sur le widget', bg: 'Сега на уиджета', tr: 'Şu anda widget’ta', ar: 'الآن في الأداة', sq: 'Tani në widget' },
  devices:   { ru: 'Устройств подключено', en: 'Devices connected', de: 'Verbundene Geräte', uk: 'Пристроїв підключено', es: 'Dispositivos conectados', fr: 'Appareils connectés', bg: 'Свързани устройства', tr: 'Bağlı cihaz', ar: 'أجهزة متصلة', sq: 'Pajisje të lidhura' },
  waiting:   { ru: 'Следующий урок откроется', en: 'Next lesson opens', de: 'Nächste Lektion öffnet', uk: 'Наступний урок відкриється', es: 'La próxima lección se abre', fr: 'Prochaine leçon le', bg: 'Следващият урок отваря', tr: 'Sonraki ders açılıyor', ar: 'يُفتح الدرس التالي', sq: 'Mësimi tjetër hapet' },
  noSched:   { ru: 'Выберите расписание курса', en: 'Choose the course schedule', de: 'Kursplan wählen', uk: 'Оберіть розклад курсу', es: 'Elige el horario del curso', fr: 'Choisissez le planning du cours', bg: 'Изберете разписание на курса', tr: 'Kurs programını seçin', ar: 'اختر جدول الدورة', sq: 'Zgjidh orarin e kursit' },
  allDone:   { ru: 'Все уроки пройдены', en: 'All lessons done', de: 'Alle Lektionen geschafft', uk: 'Усі уроки пройдено', es: 'Todas las lecciones hechas', fr: 'Toutes les leçons terminées', bg: 'Всички уроци са минати', tr: 'Tüm dersler bitti', ar: 'أُنجزت كل الدروس', sq: 'Të gjitha mësimet u kryen' },
  noLessons: { ru: 'Уроков пока нет', en: 'No lessons yet', de: 'Noch keine Lektionen', uk: 'Уроків поки немає', es: 'Aún no hay lecciones', fr: 'Pas encore de leçons', bg: 'Още няма уроци', tr: 'Henüz ders yok', ar: 'لا دروس بعد', sq: 'Ende s’ka mësime' },
  error:     { ru: 'Не получилось. Попробуйте ещё раз.', en: 'Didn’t work. Please try again.', de: 'Hat nicht geklappt. Bitte erneut versuchen.', uk: 'Не вийшло. Спробуйте ще раз.', es: 'No funcionó. Inténtalo de nuevo.', fr: 'Échec. Réessayez.', bg: 'Не се получи. Опитайте пак.', tr: 'Olmadı. Tekrar deneyin.', ar: 'لم ينجح. حاول مرة أخرى.', sq: 'Nuk funksionoi. Provo sërish.' },
}
const tr = (key, lang) => T[key][lang] || T[key].en

// Ссылка, которой веб передаёт токен в нативную часть приложения.
const intentUrl = token =>
  `intent://widget-link?token=${encodeURIComponent(token)}#Intent;scheme=dlwidget;package=${PACKAGE_ID};end`

// Одна строка «что человек увидит на виджете прямо сейчас» — по тем же данным,
// которые получает сам виджет.
function previewLine(state, lang) {
  if (!state) return null
  switch (state.state) {
    case 'in_progress': {
      const name = state.lesson?.title_translations?.[lang] || state.lesson?.title || ''
      return `${name} — ${state.required.done} / ${state.required.total}`
    }
    case 'passed_waiting_calendar':
      return state.nextUnlockDate
        ? `${tr('waiting', lang)}: ${new Date(state.nextUnlockDate).toLocaleDateString(lang)}`
        : tr('waiting', lang)
    case 'no_schedule': return tr('noSched', lang)
    case 'all_done':    return tr('allDone', lang)
    default:            return tr('noLessons', lang)
  }
}

export default function WidgetBlock() {
  const { lang } = useI18nStore()
  const [status, setStatus] = useState(null)     // { enabled, devices }
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [justEnabled, setJustEnabled] = useState(false)

  // Виджет бывает только в Android-приложении — в браузере блока нет вовсе.
  const available = isAndroidApp()

  useEffect(() => {
    if (!available) return
    let alive = true
    Promise.all([api.get('/widget/status'), api.get('/widget/state').catch(() => null)])
      .then(([s, p]) => {
        if (!alive) return
        setStatus(s); setPreview(p)
        // Язык виджета хранится на сервере рядом с токеном: нативная часть о смене языка
        // в приложении узнать не может. Синхронизируем при каждом заходе в настройки —
        // запрос идемпотентный и ничего не делает, если язык не менялся.
        if (s.enabled) api.patch('/widget/lang', {
          lang: localStorage.getItem('target_lang') || 'de',   // что учит
          uiLang: lang,                                        // на чём читает
        }).catch(() => {})
      })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [available, lang])

  if (!available || !status) return null

  const enable = async () => {
    setBusy(true); setError(false)
    try {
      const { token } = await api.post('/widget/token', {
        label: navigator.userAgent.slice(0, 60),
        uiLang: lang,
      })
      setStatus(await api.get('/widget/status'))
      setJustEnabled(true)
      // Передаём токен нативной части. Если версия приложения старая и ловить некому,
      // ничего не произойдёт — на этот случай ниже подсказка про обновление APK.
      window.location.href = intentUrl(token)
    } catch { setError(true) } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true); setError(false)
    try {
      await api.delete('/widget/token')
      setStatus(await api.get('/widget/status'))
      setJustEnabled(false)
    } catch { setError(true) } finally { setBusy(false) }
  }

  const line = previewLine(preview, lang)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>🏠 {tr('title', lang)}</div>
        {status.enabled ? (
          <button onClick={disable} disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {tr('disable', lang)}
          </button>
        ) : (
          <button onClick={enable} disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {tr('enable', lang)}
          </button>
        )}
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
        {tr('desc', lang)}
      </div>

      {status.enabled && (
        <>
          <div style={{ fontSize: 13, color: 'var(--good)', fontWeight: 700, marginTop: 12 }}>
            ✓ {tr('on', lang)} · {tr('devices', lang)}: {status.devices.length}
          </div>
          {line && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              <span style={{ color: 'var(--muted)' }}>{tr('preview', lang)}: </span>
              <b>{line}</b>
            </div>
          )}
          {justEnabled && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
              {tr('howto', lang)}
              <div style={{ marginTop: 6 }}>{tr('noApk', lang)}</div>
            </div>
          )}
        </>
      )}

      {error && (
        <div style={{ fontSize: 13, color: 'var(--bad)', marginTop: 10 }}>{tr('error', lang)}</div>
      )}
    </div>
  )
}
