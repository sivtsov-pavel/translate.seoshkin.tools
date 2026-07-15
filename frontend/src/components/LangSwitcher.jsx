import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18nStore } from '../store/i18n.js'

const LANGS = [
  { code: 'de', label: '🇩🇪', name: 'DE' },
  { code: 'uk', label: '🇺🇦', name: 'UK' },
  { code: 'bg', label: '🇧🇬', name: 'BG' },
  { code: 'tr', label: '🇹🇷', name: 'TR' },
  { code: 'ar', label: '🇸🇦', name: 'AR' },
  { code: 'es', label: '🇪🇸', name: 'ES' },
  { code: 'fr', label: '🇫🇷', name: 'FR' },
  { code: 'sq', label: '🇦🇱', name: 'SQ' },
  { code: 'en', label: '🇬🇧', name: 'EN' },
  { code: 'ru', label: '🇷🇺', name: 'RU' },
]

// Брейкпоинт мобильной раскладки (3 колонки вместо 5) и запасные ширины
// дропдауна на случай самого первого прохода измерения (см. useLayoutEffect ниже).
const MOBILE_BREAKPOINT = 480
const DROPDOWN_WIDTH_MOBILE = 160
const DROPDOWN_WIDTH_DESKTOP = 220
// Минимальный отступ от края реального вьюпорта при клэмпинге позиции
const EDGE_MARGIN = 8

export default function LangSwitcher({ pill = false, dropUp = false }) {
  const { lang, setLang } = useI18nStore()
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const dropdownRef = useRef()
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT)
  // null пока позиция не измерена/не открыт дропдаун — в этот момент дропдаун
  // отрисован, но скрыт (visibility: hidden), чтобы можно было измерить его
  // реальную ширину через dropdownRef до первой отрисовки на экране (без мигания)
  const [pos, setPos] = useState(null)

  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  // Отслеживаем размер экрана для мобильной версии
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Рассчитываем позицию дропдауна относительно РЕАЛЬНОГО вьюпорта.
  // Дропдаун рендерится порталом в document.body (см. рендер ниже), поэтому
  // ему не мешает overflow:hidden шторки сайдбара (.layout-drawer) — предыдущая
  // версия считала переполнение от window.innerWidth, хотя реальным родителем
  // с overflow:hidden была более узкая шторка, и дропдаун мог обрезаться.
  // useLayoutEffect — до отрисовки кадра браузером, чтобы не было мигания
  // дефолтной/устаревшей позиции.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    if (!ref.current || !dropdownRef.current) return

    const triggerRect = ref.current.getBoundingClientRect()
    // Реальная отрисованная ширина дропдауна (он уже в DOM на этом проходе,
    // просто скрыт через visibility:hidden, пока позиция не посчитана —
    // offsetWidth при этом корректен, в отличие от display:none)
    const dropdownWidth = dropdownRef.current.offsetWidth
      || (isMobile ? DROPDOWN_WIDTH_MOBILE : DROPDOWN_WIDTH_DESKTOP)
    const viewportWidth = document.documentElement.clientWidth

    // Симметричный клэмп: сперва выравниваем правый край дропдауна по правому
    // краю кнопки-триггера, затем зажимаем между левым и правым отступом
    // реального вьюпорта — работает одинаково для лево- и право-переполнения,
    // без раздельных веток alignLeft/alignRight с разной строгостью проверки
    const maxLeft = Math.max(EDGE_MARGIN, viewportWidth - dropdownWidth - EDGE_MARGIN)
    const left = Math.min(Math.max(triggerRect.right - dropdownWidth, EDGE_MARGIN), maxLeft)

    const vertical = dropUp
      ? window.innerHeight - triggerRect.top + 6
      : triggerRect.bottom + 6

    setPos({ left, vertical })
  }, [open, isMobile, dropUp])

  // Закрываем при клике вне. Дропдаун теперь портал в document.body — он больше
  // не вложен в ref.current, поэтому проверяем containment по обоим узлам,
  // иначе клик по самому дропдауну считался бы «внешним» и закрывал меню
  // раньше, чем сработает onClick на кнопке языка.
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      const insideTrigger = ref.current && ref.current.contains(e.target)
      const insideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target)
      if (!insideTrigger && !insideDropdown) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const pick = (code) => {
    setLang(code)
    setOpen(false)
  }

  const triggerStyle = pill ? {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--surface-2)', border: '1px solid var(--line)',
    borderRadius: 999, padding: '7px 11px', fontSize: 13,
    color: 'var(--ink)', cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
  } : {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'var(--surface-2)', border: '1px solid var(--line)',
    borderRadius: 8, padding: '5px 9px', fontSize: 13,
    color: 'var(--ink)', cursor: 'pointer', userSelect: 'none',
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Кнопка-триггер */}
      <button
        onClick={() => setOpen(v => !v)}
        style={triggerStyle}
      >
        <span style={{ fontSize: 16 }}>{current.label}</span>
        <span>{current.name}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, opacity: 0.6 }} />
      </button>

      {/* Дропдаун с флагами — портал в document.body, чтобы position:fixed
          позиционировался от реального вьюпорта и не обрезался overflow:hidden
          промежуточных контейнеров (шторка сайдбара на мобиле) */}
      {open && createPortal(
        <div ref={dropdownRef} style={{
          position: 'fixed',
          left: pos ? pos.left : -9999,
          [dropUp ? 'bottom' : 'top']: pos ? pos.vertical : -9999,
          visibility: pos ? 'visible' : 'hidden',
          zIndex: 2000,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          padding: 8,
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)',
          gap: 4,
          minWidth: isMobile ? DROPDOWN_WIDTH_MOBILE : DROPDOWN_WIDTH_DESKTOP,
          maxWidth: `calc(100vw - ${EDGE_MARGIN * 2}px)`,
        }}>
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '8px 4px', borderRadius: 10,
                border: l.code === lang ? '2px solid var(--accent)' : '2px solid transparent',
                background: l.code === lang ? 'var(--accent-soft)' : 'transparent',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                color: l.code === lang ? 'var(--accent)' : 'var(--ink)',
                transition: 'background .1s',
              }}
            >
              <span style={{ fontSize: 22 }}>{l.label}</span>
              <span>{l.name}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
