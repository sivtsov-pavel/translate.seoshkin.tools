import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export function usePushNotifications() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ok = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    if (ok) setPermission(Notification.permission)

    // Проверить есть ли уже подписка; если её нет, но разрешение есть и пользователь
    // ранее включал напоминания (флаг переживает чистку кэша) — молча переподписываемся.
    // Так «Напоминания» не слетают после каждой жёсткой чистки PWA.
    if (ok) {
      navigator.serviceWorker.ready.then(reg =>
        reg.pushManager.getSubscription().then(async sub => {
          if (sub) { setSubscribed(true); return }
          if (Notification.permission === 'granted' && localStorage.getItem('reminders_enabled') === '1') {
            try {
              const { key } = await api.get('/push/vapid-key')
              if (!key) return
              const r = await registerSW() || reg
              const subscription = await r.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key),
              })
              await api.post('/push/subscribe', { subscription })
              setSubscribed(true)
            } catch (e) { console.error('Push авто-переподписка:', e) }
          }
        })
      )
    }
  }, [])

  const subscribe = useCallback(async () => {
    setLoading(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false

      const { key } = await api.get('/push/vapid-key')
      if (!key) throw new Error('VAPID key not configured')

      const reg = await registerSW()
      if (!reg) throw new Error('Service Worker не поддерживается')

      const existingSub = await reg.pushManager.getSubscription()
      if (existingSub) await existingSub.unsubscribe()

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })

      await api.post('/push/subscribe', { subscription })
      localStorage.setItem('reminders_enabled', '1')  // помним выбор для авто-переподписки после чистки кэша
      setSubscribed(true)
      return true
    } catch (err) {
      console.error('Push subscribe error:', err)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      localStorage.setItem('reminders_enabled', '0')  // осознанная отписка — не переподписываемся авто
      setSubscribed(false)
    } catch (err) {
      console.error('Push unsubscribe error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { supported, permission, subscribed, loading, subscribe, unsubscribe }
}
