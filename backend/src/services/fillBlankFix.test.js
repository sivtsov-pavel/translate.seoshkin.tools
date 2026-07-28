import { describe, it, expect } from 'vitest'
import { fixFillBlank, isSameWordForm } from './fillBlankFix.js'

describe('isSameWordForm', () => {
  it('формы одного глагола', () => {
    expect(isSameWordForm('schließe', 'schließen')).toBe(true)
    expect(isSameWordForm('arbeitet', 'arbeiten')).toBe(true)
  })

  it('разные слова — нет', () => {
    expect(isSameWordForm('öffne', 'schließen')).toBe(false)
    expect(isSameWordForm('verstehe', 'schließen')).toBe(false)
  })

  it('короткие слова не склеиваем: der/den — разные', () => {
    expect(isSameWordForm('der', 'den')).toBe(false)
  })

  it('общее начало, но слова разные', () => {
    expect(isSameWordForm('Kind', 'Kino')).toBe(false)
  })
})

describe('fixFillBlank', () => {
  it('ответ есть среди вариантов — не трогаем', () => {
    const p = { sentence: 'Ich ___ hier.', blank: 'wohne', options: ['wohne', 'gehe'] }
    expect(fixFillBlank(p)).toBe(p)
  })

  it('реальный случай урока 18: ответ-инфинитив заменяем формой из вариантов', () => {
    const out = fixFillBlank({ sentence: 'Ich ___ die Tür.', blank: 'schließen', options: ['schließe', 'öffne', 'verstehe'] })
    expect(out.blank).toBe('schließe')
    expect(out.options).toEqual(['schließe', 'öffne', 'verstehe'])
  })

  it('похожей формы нет — добавляем ответ в варианты, чтобы упражнение решалось', () => {
    const out = fixFillBlank({ sentence: 'Ich ___ hier.', blank: 'wohne', options: ['gehe', 'komme'] })
    expect(out.options).toContain('wohne')
    expect(out.blank).toBe('wohne')
  })

  it('вариантов меньше двух — чинить нечего, это другой дефект', () => {
    const p = { sentence: 'Ich ___ hier.', blank: 'wohne', options: ['gehe'] }
    expect(fixFillBlank(p)).toBe(p)
  })

  it('мусор на входе не роняет', () => {
    expect(fixFillBlank(null)).toBe(null)
    expect(fixFillBlank({})).toEqual({})
  })
})
