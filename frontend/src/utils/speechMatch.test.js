import { describe, it, expect } from 'vitest'
import { speechSimilarity } from './speechMatch.js'
import { germanPhonetic } from './germanPhonetic.js'

// Порог засчитывания в упражнении: 0.55 — «почти», 0.75 — «хорошо», 0.90 — «отлично»
const OK = 0.55

describe('транскрипция немецкого', () => {
  it('Tschüss читается как «чюсс»', () => {
    expect(germanPhonetic('Tschüss').toLowerCase()).toContain('ч')
  })
})

describe('speechSimilarity — латиница', () => {
  it('точное совпадение', () => {
    expect(speechSimilarity('Tschüss', 'Tschüss')).toBe(1)
  })

  it('одна буква мимо — всё ещё засчитывается', () => {
    expect(speechSimilarity('tschüs', 'Tschüss')).toBeGreaterThan(OK)
  })

  it('без умлаута — засчитывается', () => {
    expect(speechSimilarity('tschuss', 'Tschüss')).toBeGreaterThan(OK)
  })

  it('слово внутри фразы', () => {
    expect(speechSimilarity('tschüss zusammen', 'Tschüss')).toBeGreaterThan(OK)
  })

  it('артикль в эталоне не мешает', () => {
    expect(speechSimilarity('Hund', 'der Hund')).toBe(1)
  })

  it('чужое слово не проходит', () => {
    expect(speechSimilarity('Guten Tag', 'Tschüss')).toBeLessThan(OK)
  })
})

// Ради чего всё: на Android распознавание отдаёт результат кириллицей,
// и правильно произнесённое слово получало ноль
describe('speechSimilarity — кириллица от распознавания', () => {
  it('«чюсс» засчитывается как Tschüss', () => {
    expect(speechSimilarity('чюсс', 'Tschüss')).toBeGreaterThan(OK)
  })

  it('«чус» — тоже (одна буква мимо)', () => {
    expect(speechSimilarity('чус', 'Tschüss')).toBeGreaterThan(OK)
  })

  it('«Чюсс» с заглавной и точкой', () => {
    expect(speechSimilarity('Чюсс.', 'Tschüss')).toBeGreaterThan(OK)
  })

  it('чужое слово кириллицей не проходит', () => {
    expect(speechSimilarity('привет', 'Tschüss')).toBeLessThan(OK)
  })

  it('пустой ответ — ноль', () => {
    expect(speechSimilarity('', 'Tschüss')).toBe(0)
    expect(speechSimilarity('   ', 'Tschüss')).toBe(0)
  })
})
