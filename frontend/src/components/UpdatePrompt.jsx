import { RefreshCw } from 'lucide-react'
import { useI18nStore } from '../store/i18n.js'
import { useAppUpdateStore } from '../store/appUpdate.js'

// Плашка «Вышло обновление» — внизу экрана, поверх всего.
//
// До неё новая версия приезжала молча и непредсказуемо: у одних не приезжала вовсе
// (пока приложение открыто, браузер за обновлением не ходит), у других страница
// перезагружалась сама посреди занятия. Человек не понимал, какая у него версия и
// почему обещанного нет — на этом мы потеряли не один круг проверок.
//
// Перезагрузка по кнопке: она забирает новые файлы, которые service worker уже скачал.
export default function UpdatePrompt() {
  const { t } = useI18nStore()
  const { ready, hidden, hide } = useAppUpdateStore()
  if (!ready || hidden) return null

  return (
    <div style={{
      position: 'fixed', zIndex: 300, left: 12, right: 12,
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-h, 0px) + 12px)',
      margin: '0 auto', maxWidth: 460,
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18,
      boxShadow: '0 18px 40px -18px rgba(0,0,0,.65)',
      padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 12, background: 'var(--accent)',
        color: 'var(--accent-ink)', display: 'grid', placeItems: 'center' }}>
        <RefreshCw size={19} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>{t.common.updateTitle}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{t.common.updateDesc}</div>
      </div>
      <button onClick={hide}
        style={{ flex: 'none', padding: '9px 10px', borderRadius: 12, border: 'none', background: 'transparent',
          color: 'var(--ink-soft)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        {t.common.updateLater}
      </button>
      <button onClick={() => window.location.reload()}
        style={{ flex: 'none', padding: '10px 16px', borderRadius: 12, border: 'none',
          background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        {t.common.updateBtn}
      </button>
    </div>
  )
}
