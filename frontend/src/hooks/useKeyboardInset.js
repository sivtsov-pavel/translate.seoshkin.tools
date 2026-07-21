import { useEffect } from 'react'

// Клавиатура на мобиле (Android/iOS): при interactive-widget=overlays-content (index.html) клавиатура
// НЕ сжимает вьюпорт, а перекрывает контент снизу. Чтобы поля ввода/чат не прятались под ней,
// считаем высоту клавиатуры через visualViewport и кладём в CSS-переменную --keyboard-inset —
// её используют .full-page-layout и нижние шторки (bottom: var(--keyboard-inset, 0px) + ...).
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
}
