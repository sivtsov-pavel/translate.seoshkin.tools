// fetch handler обязателен для Chrome PWA install prompt
self.addEventListener('fetch', (event) => {
  // Для API-запросов — всегда сеть
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }
  // Для остального — network-first (обновления сразу видны)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch {}

  const title   = data.title || '📚 Deutsch lernen'
  const options = {
    body:    data.body  || 'Пора повторить слова!',
    icon:    data.icon  || '/icons/icon-192.png',
    badge:   '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(url) && 'focus' in c)
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
