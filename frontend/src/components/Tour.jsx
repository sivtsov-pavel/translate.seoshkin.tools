import { useState, useEffect, useCallback, useMemo } from 'react'
import { useI18nStore } from '../store/i18n.js'

// Онбординг-тур: подсвечивает элементы по CSS-селекторам + подсказка.
// Запускается кнопкой 🧭 в топбаре (в любой момент) и один раз при первом входе.
// Шаги по главной; элементы, которых нет на странице, пропускаются.
// Позже допишем шаги по остальным разделам.

export default function Tour({ onClose }) {
  const { t } = useI18nStore()
  const T = t.tour || {}

  // Шаги: селектор + заголовок + текст (с русским фолбэком)
  const steps = useMemo(() => [
    { sel: '.layout-hamburger', title: T.menuTitle || 'Меню', text: T.menuText || 'Здесь весь список разделов: словарь, читалка, грамматика, книги и остальное.' },
    { sel: '.dl-metrics', title: T.progressTitle || 'Прогресс дня', text: T.progressText || 'Два независимых счётчика — уроки и слова. Видно сразу, без прокрутки.' },
    { sel: '.dl-features', title: T.featuresTitle || 'Тренер, игры, поиск', text: T.featuresText || 'AI-тренер Pablo, «Любовь к детям», игры и поиск урока — всё тут.' },
    { sel: '.dl-path', title: T.pathTitle || 'Путь уроков', text: T.pathText || 'Уроки идут ниткой. Тапни по кружку — раскроется карточка урока: упражнения, зачёт, слова.' },
    { sel: '.dl-sets-toggle-row', title: T.setsTitle || 'Наборы', text: T.setsText || 'Твои подборки слов. Скрыты по умолчанию — включай, когда собираешь тренировку.' },
    { sel: '[aria-label="Профиль"]', title: T.profileTitle || 'Профиль', text: T.profileText || 'Тема оформления, язык интерфейса, настройки и выход — всё здесь.' },
  ], [T])

  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  // Находит первый существующий шаг начиная с idx (вперёд)
  const findFrom = useCallback((idx, dir = 1) => {
    let k = idx
    while (k >= 0 && k < steps.length) {
      if (document.querySelector(steps[k].sel)) return k
      k += dir
    }
    return -1
  }, [steps])

  const measure = useCallback((idx) => {
    const el = document.querySelector(steps[idx]?.sel)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setTimeout(() => setRect(el.getBoundingClientRect()), 260)
  }, [steps])

  // При старте — первый доступный шаг
  useEffect(() => {
    const first = findFrom(0)
    if (first < 0) { onClose?.(); return }
    setI(first); measure(first)
  }, []) // eslint-disable-line

  // Перемер при ресайзе/скролле
  useEffect(() => {
    const on = () => { const el = document.querySelector(steps[i]?.sel); if (el) setRect(el.getBoundingClientRect()) }
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true) }
  }, [i, steps])

  const next = () => {
    const n = findFrom(i + 1)
    if (n < 0) { onClose?.(); return }
    setI(n); measure(n)
  }

  if (!rect) return null
  const pad = 8
  const spot = { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
  const below = rect.bottom + 200 < window.innerHeight
  const card = {
    top: below ? rect.bottom + 14 : Math.max(12, rect.top - 176),
    left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
  }
  const stepNo = steps.filter((s, k) => k <= i && document.querySelector(s.sel)).length
  const totalNo = steps.filter(s => document.querySelector(s.sel)).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500 }}>
      {/* Спот-подсветка */}
      <div style={{ position: 'absolute', ...spot, borderRadius: 14, boxShadow: '0 0 0 4000px rgba(20,18,14,0.62), 0 0 0 3px var(--blue)', transition: 'all .25s ease', pointerEvents: 'none' }} />
      {/* Карточка-подсказка */}
      <div style={{ position: 'absolute', ...card, width: 288, background: 'var(--surface)', borderRadius: 16, padding: '16px 18px', boxShadow: '0 16px 40px rgba(0,0,0,0.3)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
          {Array.from({ length: totalNo }).map((_, k) => (
            <span key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: k === stepNo - 1 ? 'var(--blue)' : 'var(--line)' }} />
          ))}
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--ink)', fontFamily: 'var(--heading-font)' }}>{steps[i].title}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.45 }}>{steps[i].text}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12.5, cursor: 'pointer' }}>{T.skip || 'Пропустить'}</button>
          <button onClick={next} style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {stepNo >= totalNo ? (T.done || 'Готово') : (T.next || 'Далее')}
          </button>
        </div>
      </div>
    </div>
  )
}
