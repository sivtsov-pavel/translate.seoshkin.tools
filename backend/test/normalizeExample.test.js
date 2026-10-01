import { describe, it, expect } from 'vitest'
import { normalizeExample } from '../src/services/processor.js'

describe('normalizeExample — пустота, пришедшая словом', () => {
  it('настоящий пример не трогает', () => {
    expect(normalizeExample('Ich gehe zum Supermarkt.')).toBe('Ich gehe zum Supermarkt.')
  })
  it('обрезает пробелы по краям', () => {
    expect(normalizeExample('  Das ist gut.  ')).toBe('Das ist gut.')
  })
  it('строка "null" от модели — это отсутствие примера', () => {
    // Ровно этот случай Павел увидел в словаре 01.10.2026: «der Supermarkt — супермаркет, null»
    expect(normalizeExample('null')).toBeNull()
    expect(normalizeExample('NULL')).toBeNull()
    expect(normalizeExample(' null ')).toBeNull()
  })
  it('прочие способы сказать «нечего»', () => {
    for (const v of ['undefined', 'none', 'nil', 'N/A', '-', '—', '']) {
      expect(normalizeExample(v), `«${v}» должно стать NULL`).toBeNull()
    }
  })
  it('настоящие null и undefined', () => {
    expect(normalizeExample(null)).toBeNull()
    expect(normalizeExample(undefined)).toBeNull()
  })
  it('слово, лишь НАЧИНАЮЩЕЕСЯ на null, остаётся примером', () => {
    expect(normalizeExample('Nullpunkt ist hier.')).toBe('Nullpunkt ist hier.')
  })
})
