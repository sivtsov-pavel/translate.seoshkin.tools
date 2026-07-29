import { describe, it, expect } from 'vitest'
import { fixFillBlank, isSameWordForm, ensureBlank, dedupeOptions } from './fillBlankFix.js'

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

// Реальные блокеры из аудита базы 29.07: предложение целое, вписывать некуда
describe('ensureBlank', () => {
  it('ставит пропуск на слове ответа и правит варианты под его форму', () => {
    const out = ensureBlank({ sentence: 'Heute ist ein schöner Tag.', blank: 'heute', options: ['heute', 'morgen'] })
    expect(out.sentence).toBe('___ ist ein schöner Tag.')
    expect(out.blank).toBe('Heute')            // форма из предложения, с заглавной
    expect(out.options).toContain('Heute')     // без этого ответа нет среди вариантов
    expect(out.options).not.toContain('heute')
  })

  it('английский курс тоже', () => {
    const out = ensureBlank({ sentence: 'Basketball is fun.', blank: 'basketball', options: ['basketball', 'tennis'] })
    expect(out.sentence).toBe('___ is fun.')
  })

  it('пропуск уже есть — не трогаем', () => {
    const p = { sentence: 'Ich ___ hier.', blank: 'wohne' }
    expect(ensureBlank(p)).toBe(p)
  })

  it('слова в предложении нет — чинить нечем', () => {
    const p = { sentence: 'Der Hund schläft.', blank: 'Katze' }
    expect(ensureBlank(p)).toBe(p)
  })
})

describe('dedupeOptions', () => {
  it('убирает повтор', () => {
    const out = dedupeOptions({ options: ['heute', 'morgen', 'Heute'] })
    expect(out.options).toEqual(['heute', 'morgen'])
  })

  it('индекс верного ответа едет за ним, а не остаётся на месте', () => {
    const out = dedupeOptions({ options: ['rot', 'rot', 'blau'], correct: 2 })
    expect(out.options).toEqual(['rot', 'blau'])
    expect(out.options[out.correct]).toBe('blau')
  })

  it('после чистки осталось бы меньше двух — не трогаем', () => {
    const p = { options: ['rot', 'ROT'] }
    expect(dedupeOptions(p)).toBe(p)
  })

  it('повторов нет — тот же объект', () => {
    const p = { options: ['rot', 'blau'] }
    expect(dedupeOptions(p)).toBe(p)
  })
})

// Аудит 29.07: ответ « wichtig» с пробелом не совпадал с вариантом «wichtig»
describe('fixFillBlank — пробелы по краям', () => {
  it('ответ с ведущим пробелом совпадает с вариантом', () => {
    const out = fixFillBlank({ sentence: 'Das ist ___.', blank: ' wichtig', options: ['wichtig', 'klein'] })
    expect(out.blank).toBe('wichtig')
    expect(out.options).toContain('wichtig')
  })

  it('пробелы в вариантах тоже снимаются', () => {
    const out = fixFillBlank({ sentence: 'Das ist ___.', blank: 'gut', options: [' gut ', 'klein'] })
    expect(out.options[0]).toBe('gut')
  })
})
