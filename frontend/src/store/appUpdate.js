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
