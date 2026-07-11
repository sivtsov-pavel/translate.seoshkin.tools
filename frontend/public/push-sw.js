// Push-уведомления — импортируется в workbox-сгенерированный sw.js

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || '📚 Deutsch lernen', {
      body:    data.body  || 'Пора повторить слова!',
      icon:    data.icon  || '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const w = list.find(c => 'focus' in c)
      return w ? w.focus() : clients.openWindow(url)
    })
  )
})
