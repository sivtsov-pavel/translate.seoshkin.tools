import { useEffect } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { useUiModeStore } from '../store/uiMode.js'

// Тумблер между двумя дизайнами: «Новичок» — экран «Путь» (одна дорога, один следующий
// шаг), «Эксперт» — привычный полный интерфейс. По умолчанию учителю эксперт, ученику
// новичок. Переключает ТОЛЬКО отображение: права и данные те же.
//
// Живёт в отдельном файле, потому что нужен в двух местах: в шапке (телефон) и в боковой
// панели новичка (компьютер) — на десктопе шапка другая, и тумблер там терялся.
export default function UiModeToggle({ compact = false }) {
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const { resolve, toggle, load } = useUiModeStore()
  const mode = resolve(user)

  useEffect(() => { load(user) }, [])

  const label = mode === 'novice' ? t.path.modeNovice : t.path.modeExpert

  return (
    <button
      className="dl-mode-toggle"
      onClick={async () => { await toggle(user); window.location.assign('/') }}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: compact ? '8px 10px' : '6px 12px', borderRadius: 999,
        border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer',
        fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap',
        width: compact ? '100%' : 'auto',
      }}>
      <span>{label}</span>
    </button>
  )
}
