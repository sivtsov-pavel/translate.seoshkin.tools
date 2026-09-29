import { create } from 'zustand'

// Вышла ли новая версия приложения.
//
// Раньше страница перезагружалась сама, молча, как только новый service worker брал
// управление. Со стороны это выглядело так: у одних новая версия «не приезжала» (пока
// приложение открыто, браузер за обновлением не ходит), у других экран перезагружался
// посреди упражнения. И в обоих случаях человек не понимал, что происходит — жалоба
// Павла 08.09.2026: «а то непонятно».
//
// Теперь решение за человеком: показываем плашку «Вышло обновление» с кнопкой.
export const useAppUpdateStore = create((set) => ({
  ready: false,        // новая версия скачана и ждёт перезагрузки
  hidden: false,       // человек нажал «Позже» — до конца сеанса не напоминаем
  busy: false,         // нажали «Обновить» — идёт переход на новую версию
  setReady: () => set({ ready: true }),
  hide: () => set({ hidden: true }),
  setBusy: () => set({ busy: true }),
}))

// Переход на новую версию по кнопке.
//
// ПОЧЕМУ НЕ ПРОСТО location.reload(). Так было до 14.09.2026, и Павел дважды за день
// получил одно и то же: «нажал обновить — плашка пропала, а версия прежняя». Причин
// у этого две, и лечить надо обе:
//
//   1. Новый service worker может стоять в waiting — тогда страницу обслуживает СТАРЫЙ,
//      и перезагрузка честно отдаёт старый бандл из его кеша. Просим новый встать
//      (SKIP_WAITING) и ждём смены контроллера.
//   2. Даже с новым воркером перезагрузка берёт файлы из precache. Если он по какой-то
//      причине не обновился, человек опять видит старое. Поэтому перед перезагрузкой
//      сносим ТОЛЬКО precache-кеши Workbox — картинки слов и кеш API не трогаем, они
//      про офлайн, а не про версию.
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.waiting) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        setTimeout(resolve, 3000)   // не ждём вечно: лучше перезагрузиться, чем висеть
      })
    }
    if (window.caches) {
      const names = await caches.keys()
      await Promise.all(names.filter(n => n.includes('precache')).map(n => caches.delete(n)))
    }
  } catch { /* нет SW или запрещены кеши — перезагружаемся как есть */ }
  window.location.reload()
}

// Жёсткий сброс: снести ВСЕ кеши и сам service worker.
//
// Отличается от applyUpdate тем, что не спрашивает воркер вежливо, а выкидывает
// его целиком. Нужно ровно в одном случае: обновление «не приезжает» никакими
// кнопками — воркер завис в промежуточном состоянии, и договориться с ним уже
// нельзя. Цена — приложение заново скачает картинки слов для офлайна, поэтому
// это не кнопка на каждый день.
//
// Каждый шаг в своём try/catch: в приватном окне и при запрете данных сайта
// caches и serviceWorker бросают сами по себе, и падение на первом шаге
// оставило бы остальные несделанными.
export async function hardResetApp() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || []
    await Promise.all(regs.map(r => r.unregister().catch(() => {})))
  } catch { /* SW недоступен — значит и сносить нечего */ }
  try {
    const names = await caches.keys()
    await Promise.all(names.map(n => caches.delete(n).catch(() => {})))
  } catch { /* кеши запрещены браузером */ }
  // Перезагружаемся мимо HTTP-кеша: без метки браузер может отдать свой index.html
  window.location.replace(`${window.location.pathname}?fresh=${Date.now()}`)
}
