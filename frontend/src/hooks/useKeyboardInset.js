import { useEffect } from 'react'

// Клавиатура на мобиле: при дефолтном режиме вьюпорта (resizes-visual) она сжимает ВИДИМУЮ
// область, но не разметку. Значит position:fixed-элементы (нижние шторки Читалки, панель чата)
// остаются на месте и оказываются под клавиатурой. Меряем её высоту через visualViewport и
// кладём в --keyboard-inset — её используют .full-page-layout и нижние шторки.
//
// ⚠️ Работает только пока в index.html НЕТ interactive-widget=overlays-content: в том режиме
// visualViewport.height не меняется и мерить нечего (см. комментарий в index.html).
//
// Прокрутку к полю в дефолтном режиме делает сам браузер; наш скролл — подстраховка для
// случаев, когда карточка высокая и браузер докручивает не до конца.
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

    // Скроллим только в момент ПОЯВЛЕНИЯ клавиатуры, а не на каждое её шевеление.
    //
    // Первая версия дёргала скролл на любом resize/scroll вьюпорта, пока клавиатура
    // открыта, — и экран прыгал ровно с первого набранного символа (жалоба про диктант,
    // 05.09.2026). Причина: Android достраивает строку подсказок, как только начинаешь
    // печатать; высота клавиатуры меняется → resize → плавный scrollIntoView → он сам
    // меняет вьюпорт → снова resize. Круг замыкался, пока не отпустишь клавиатуру.
    // Плюс в этот же момент CSS ужимает картинку слова — прыжок становился заметным.
    let wasOpen = false

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--keyboard-inset', `${inset}px`)
      const open = inset > KEYBOARD_MIN_PX
      root.classList.toggle('keyboard-open', open)
      if (open && !wasOpen) {
        // Ждём и пересчёта раскладки, и анимации ужимания картинки слова (0.18s в
        // index.css): скролл к полю, которое в этот момент само едет вверх, промахивается.
        clearTimeout(timer)
        timer = setTimeout(scrollFocusedIntoView, 220)
      }
      wasOpen = open
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
