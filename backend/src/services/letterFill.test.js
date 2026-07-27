import { describe, it, expect } from 'vitest'
import { isValidMask, buildMask, normalizeLetterFill } from './letterFill.js'

describe('isValidMask — можно ли дозаполнить маску до ответа', () => {
  it('нормальная маска', () => {
    expect(isValidMask('H_nd', 'Hund')).toBe(true)
    expect(isValidMask('die Sonnenb_rille', 'die Sonnenbrille')).toBe(false) // длина не сходится
    expect(isValidMask('die Sonnenb_ille', 'die Sonnenbrille')).toBe(true)
  })

  it('брак от модели: потеряна буква', () => {
    expect(isValidMask('wünshe_n', 'wünschen')).toBe(false)
  })

  it('брак от модели: разная длина', () => {
    expect(isValidMask('ich _n', 'ich bin')).toBe(false)
  })

  it('без дырок — это не упражнение', () => {
    expect(isValidMask('Hund', 'Hund')).toBe(false)
  })

  it('слишком много дырок — угадайка, а не упражнение', () => {
    expect(isValidMask('H___', 'Hund')).toBe(false)
  })

  it('3–4 дырки в длинном слове — нормальное упражнение, не трогаем', () => {
    expect(isValidMask('d__i__g', 'dreißig')).toBe(true)       // 4 дырки из 7 букв
    expect(isValidMask('B_r_tch_n', 'Brötchen')).toBe(false)   // а тут длина не сходится
  })

  it('мусор на входе', () => {
    expect(isValidMask(null, 'Hund')).toBe(false)
    expect(isValidMask('H_nd', '')).toBe(false)
  })
})

describe('buildMask — строим маску сами', () => {
  it('артикль не трогаем, первая буква слова видна', () => {
    const m = buildMask('der Tisch')
    expect(m.startsWith('der T')).toBe(true)
    expect(isValidMask(m, 'der Tisch')).toBe(true)
  })

  it('чинит слово, на котором сломалась модель', () => {
    const m = buildMask('wünschen')
    expect(isValidMask(m, 'wünschen')).toBe(true)
    expect(m[0]).toBe('w')
  })

  it('длинное слово — две дырки', () => {
    const m = buildMask('die Sonnenbrille')
    expect(isValidMask(m, 'die Sonnenbrille')).toBe(true)
    expect([...m].filter(c => c === '_').length).toBe(2)
  })

  it('фраза из двух слов', () => {
    const m = buildMask('ich bin')
    expect(isValidMask(m, 'ich bin')).toBe(true)
  })

  it('детерминированно — та же маска при повторе', () => {
    expect(buildMask('wünschen')).toBe(buildMask('wünschen'))
  })

  it('маскировать нечего', () => {
    expect(buildMask('ab')).toBe(null)
    expect(buildMask('')).toBe(null)
    expect(buildMask(null)).toBe(null)
  })
})

describe('normalizeLetterFill — что уезжает в базу', () => {
  it('годную маску оставляем как есть', () => {
    const p = { word_de: 'Hund', translation_ru: 'собака', masked: 'H_nd', answer: 'Hund' }
    expect(normalizeLetterFill(p).masked).toBe('H_nd')
  })

  it('битую маску чиним', () => {
    const p = { word_de: 'wünschen', translation_ru: 'желать', masked: 'wünshe_n', answer: 'wünschen' }
    const out = normalizeLetterFill(p)
    expect(out.masked).not.toBe('wünshe_n')
    expect(isValidMask(out.masked, 'wünschen')).toBe(true)
  })

  it('маску другой длины чиним', () => {
    const p = { word_de: 'ich bin', masked: 'ich _n', answer: 'ich bin' }
    expect(isValidMask(normalizeLetterFill(p).masked, 'ich bin')).toBe(true)
  })

  it('answer берём из word_de, если его не прислали', () => {
    const out = normalizeLetterFill({ word_de: 'der Tisch', masked: 'мусор' })
    expect(out.answer).toBe('der Tisch')
    expect(isValidMask(out.masked, 'der Tisch')).toBe(true)
  })

  it('нечего маскировать — упражнение отбрасываем', () => {
    expect(normalizeLetterFill({ word_de: 'ab' })).toBe(null)
    expect(normalizeLetterFill({})).toBe(null)
    expect(normalizeLetterFill(null)).toBe(null)
  })
})
