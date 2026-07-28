import { describe, it, expect } from 'vitest'
import { normalizeBlankMarker } from './fillblank.js'

describe('normalizeBlankMarker — пропуск любой длины', () => {
  it('два подчёркивания приводятся к трём (иначе пропуск не отображался)', () => {
    expect(normalizeBlankMarker('Ich __ jeden Morgen.')).toBe('Ich ___ jeden Morgen.')
  })

  it('больше трёх — тоже к трём', () => {
    expect(normalizeBlankMarker('Bist du _____?')).toBe('Bist du ___?')
  })

  it('нормальное предложение не трогаем', () => {
    expect(normalizeBlankMarker('Ich ___ jeden Morgen.')).toBe('Ich ___ jeden Morgen.')
  })

  it('одиночное подчёркивание — не пропуск, не трогаем', () => {
    expect(normalizeBlankMarker('snake_case')).toBe('snake_case')
  })
})
