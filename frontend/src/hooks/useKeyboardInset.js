import { useEffect } from 'react'

// Клавиатура на мобиле (Android/iOS): при interactive-widget=overlays-content (index.html) клавиатура
// НЕ сжимает вьюпорт, а перекрывает контент снизу. Чтобы поля ввода/чат не прятались под ней,
// считаем высоту клавиатуры через visualViewport и кладём в CSS-переменную --keyboard-inset —
// её используют .full-page-layout и нижние шторки (bottom: var(--keyboard-inset, 0px) + ...).
//
// Одного inset мало: контейнер сжимается снизу, но поле ввода остаётся там, где было, и
// по-прежнему может оказаться под клавиатурой («Напиши предложение»). Поэтому дополнительно:
//   1) вешаем на <html> класс keyboard-open — по нему прячется нижняя навигация, которая
//      при открытой клавиатуре только съедает место (см. index.css);
//   2) подтягиваем сфокусированное поле в видимую зону — как в мессенджерах.
//
// Скроллить нужно ПОСЛЕ появления клавиатуры: в момент focus её ещё нет, высота вьюпорта
// прежняя, и scrollIntoView промахивается. Поэтому основной триггер — resize визуального
// вьюпорта, а focusin страхует переход между полями при уже открытой клавиатуре.

// Клавиатура ниже этой высоты не бывает; меньшие изменения — это адресная строка браузера.
const KEYBOARD_MIN_PX = 120

function scrollFocusedIntoView() {
  const el = document.activeElement
  if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let timer

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--keyboard-inset', `${inset}px`)
      const open = inset > KEYBOARD_MIN_PX
      root.classList.toggle('keyboard-open', open)
      if (open) {
        // Ждём пересчёта раскладки под новую высоту, иначе скроллим по старым координатам.
        clearTimeout(timer)
        timer = setTimeout(scrollFocusedIntoView, 120)
      }
    }

    // Фокус мог прийти при уже открытой клавиатуре (переход между полями) — resize тогда молчит.
    const onFocusIn = (e) => {
      if (!/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '')) return
      clearTimeout(timer)
      timer = setTimeout(scrollFocusedIntoView, 300)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      clearTimeout(timer)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.removeEventListener('focusin', onFocusIn)
      root.classList.remove('keyboard-open')
    }
  }, [])
}
