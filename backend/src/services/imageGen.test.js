import { describe, it, expect } from 'vitest'
import { isFunctionWord } from './imageGen.js'

// Служебным словам («der», «zwei», «sehr») картинка не нужна — их пропускаем при генерации.
// Но фильтр не должен отбрасывать нормальные слова: каждая ошибка здесь — слово без картинки.

describe('isFunctionWord — немецкий', () => {
  it('служебные отбрасываем', () => {
    expect(isFunctionWord('der')).toBe(true)
    expect(isFunctionWord('zwanzig')).toBe(true)
    expect(isFunctionWord('sehr')).toBe(true)
  })

  it('обычные слова оставляем, артикль не мешает', () => {
    expect(isFunctionWord('der Tisch')).toBe(false)
    expect(isFunctionWord('die Sonnenbrille')).toBe(false)
    expect(isFunctionWord('kochen')).toBe(false)
  })
})

describe('isFunctionWord — английский (тут был баг: проверяли по немецкому списку)', () => {
  it('«in the park» — это парк, картинка нужна', () => {
    expect(isFunctionWord('in the park', 'en')).toBe(false)
  })

  it('«an arm» — это рука, а не немецкий предлог «an»', () => {
    expect(isFunctionWord('an arm', 'en')).toBe(false)
  })

  it('«in the morning» — фраза, не служебное слово', () => {
    expect(isFunctionWord('in the morning', 'en')).toBe(false)
  })

  it('одиночные английские служебные всё же отбрасываем', () => {
    expect(isFunctionWord('in', 'en')).toBe(true)
    expect(isFunctionWord('the', 'en')).toBe(true)
    expect(isFunctionWord('twenty', 'en')).toBe(true)
  })

  it('английское существительное с артиклем оставляем', () => {
    expect(isFunctionWord('a house', 'en')).toBe(false)
    expect(isFunctionWord('house', 'en')).toBe(false)
  })
})

describe('isFunctionWord — испанский', () => {
  it('служебные отбрасываем', () => {
    expect(isFunctionWord('en', 'es')).toBe(true)
    expect(isFunctionWord('veinte', 'es')).toBe(true)
  })

  it('обычные слова оставляем', () => {
    expect(isFunctionWord('la mesa', 'es')).toBe(false)
    expect(isFunctionWord('mano', 'es')).toBe(false)
  })
})

describe('isFunctionWord — мусор на входе', () => {
  it('пустое значение — не служебное (и не падаем)', () => {
    expect(isFunctionWord('')).toBe(false)
    expect(isFunctionWord(null)).toBe(false)
    expect(isFunctionWord(undefined)).toBe(false)
  })

  it('неизвестный язык — работаем по немецкому списку', () => {
    expect(isFunctionWord('der', 'zz')).toBe(true)
  })
})
