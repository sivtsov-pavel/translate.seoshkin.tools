import { useEffect, useState } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { isOnline } from '../offline/store.js'

// Хук «онлайн ли мы» — живой (реагирует на пропажу/появление сети)
export function useOnline() {
  const [online, setOnline] = useState(isOnline())
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

// Заглушка для разделов, которым нужен сервер/ИИ (Читалка, Разговорник, Тренер,
// Чат, Переводы, загрузка уроков): в офлайне вместо содержимого — понятное
// сообщение на языке ученика. Использование: if (!online) return <OfflineNotice />
export function OfflineNotice() {
  const { t } = useI18nStore()
  return (
    <div style={{ textAlign: 'center', padding: '70px 24px', color: 'var(--ink-soft)' }}>
      <div style={{ fontSize: 54, marginBottom: 14 }}>📡</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
        {t.offlineMode?.sectionTitle || 'Нужен интернет'}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.65, maxWidth: 440, margin: '0 auto' }}>
        {t.offlineMode?.sectionText || 'Этот раздел работает через ИИ на сервере — без интернета он технически невозможен. А Словарь и упражнения доступны офлайн!'}
      </div>
    </div>
  )
}
