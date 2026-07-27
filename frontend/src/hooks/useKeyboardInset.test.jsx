import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardInset } from './useKeyboardInset.js'

// Клавиатуру на настоящем телефоне не воспроизвести, поэтому подделываем visualViewport:
// именно его resize сообщает, что клавиатура выехала (высота вьюпорта стала меньше окна).
function mockViewport() {
  const listeners = {}
  const vv = {
    height: 800, offsetTop: 0,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn) },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter(f => f !== fn) },
  }
  window.visualViewport = vv
  window.innerHeight = 800
  return { vv, fire: (t) => (listeners[t] || []).forEach(fn => fn()) }
}

describe('useKeyboardInset — поле ввода не должно прятаться под клавиатурой', () => {
  let scrollSpy

  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.className = ''
    document.documentElement.style.removeProperty('--keyboard-inset')
    scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy
  })
  afterEach(() => { vi.useRealTimers() })

  it('клавиатура закрыта — inset 0, класса нет', () => {
    const { fire } = mockViewport()
    renderHook(() => useKeyboardInset())
    act(() => { fire('resize') })
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false)
  })

  it('клавиатура выехала — считаем высоту и ставим класс keyboard-open', () => {
    const { vv, fire } = mockViewport()
    renderHook(() => useKeyboardInset())
    act(() => { vv.height = 450; fire('resize') })   // 800 − 450 = клавиатура 350px
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('350px')
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(true)
  })

  it('мелкое изменение (адресная строка) за клавиатуру не считаем', () => {
    const { vv, fire } = mockViewport()
    renderHook(() => useKeyboardInset())
    act(() => { vv.height = 740; fire('resize') })   // 60px — это не клавиатура
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false)
  })

  it('сфокусированное поле подтягивается в видимую зону', () => {
    const { vv, fire } = mockViewport()
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    input.focus()
    renderHook(() => useKeyboardInset())
    act(() => { vv.height = 450; fire('resize') })
    expect(scrollSpy).not.toHaveBeenCalled()          // ждём пересчёта раскладки
    act(() => { vi.advanceTimersByTime(200) })
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    input.remove()
  })

  it('без фокуса на поле не скроллим (не дёргаем страницу зря)', () => {
    const { vv, fire } = mockViewport()
    document.body.focus()
    renderHook(() => useKeyboardInset())
    act(() => { vv.height = 450; fire('resize') })
    act(() => { vi.advanceTimersByTime(200) })
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('класс снимается при размонтировании — иначе навигация осталась бы скрытой', () => {
    const { vv, fire } = mockViewport()
    const { unmount } = renderHook(() => useKeyboardInset())
    act(() => { vv.height = 450; fire('resize') })
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(true)
    unmount()
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false)
  })
})
