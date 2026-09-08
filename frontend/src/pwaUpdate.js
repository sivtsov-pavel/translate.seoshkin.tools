import { useAppUpdateStore } from './store/appUpdate.js'

// Слежение за новой версией приложения.
//
// Два отдельных механизма, и оба нужны:
//
//   1) Браузер сам проверяет service worker только при навигации. В установленном
//      приложении (PWA/TWA) страница живёт сутками — и обновление не приезжает
//      неделями. Поэтому дёргаем reg.update() сами: при возврате в приложение и раз
//      в четверть часа.
//   2) SW собран с skipWaiting, поэтому новая версия активируется сразу и стреляет
//      controllerchange. Раньше мы по нему молча перезагружали страницу — могло
//      выбросить человека посреди упражнения. Теперь просто помечаем, что версия
//      готова, а перезагрузку предлагает плашка (components/UpdatePrompt.jsx).
//
// Проверка стоит один запрос к sw.js и работает даже офлайн (падает молча).

const CHECK_EVERY_MS = 15 * 60 * 1000
const MIN_GAP_MS = 60 * 1000     // не чаще раза в минуту, чтобы не долбить при переключении вкладок

export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return

  const { setReady } = useAppUpdateStore.getState()
  let lastCheck = 0

  const check = async () => {
    const now = Date.now()
    if (now - lastCheck < MIN_GAP_MS) return
    lastCheck = now
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg?.update()
    } catch { /* офлайн или SW ещё не встал — не беда, проверим в следующий раз */ }
  }

  // Новая версия скачалась и встала рядом со старой
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return
    // Уже ждёт с прошлого раза (страницу открыли, а обновление скачалось раньше)
    if (reg.waiting && navigator.serviceWorker.controller) setReady()
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing
      if (!sw) return
      sw.addEventListener('statechange', () => {
        // controller есть = это НЕ первая установка, а именно обновление
        if (sw.state === 'installed' && navigator.serviceWorker.controller) setReady()
      })
    })
  }).catch(() => {})

  // Новый SW взял управление — версия точно новее той, что открыта
  navigator.serviceWorker.addEventListener('controllerchange', () => setReady())

  check()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('focus', check)
  setInterval(check, CHECK_EVERY_MS)
}
