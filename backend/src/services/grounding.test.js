import { describe, it, expect } from 'vitest'
import { groundFillBlank, groundSentenceWrite } from './grounding.js'

const SENTS = [
  'Das ist mein Freund Jamil.',
  'Er ist neu hier.',
  'Welche Sprache sprichst du?',
  'Ich suche die Berliner Straße.',
]

describe('groundFillBlank', () => {
  it('сажает упражнение на реальную фразу урока', () => {
    const out = groundFillBlank(
      { sentence: 'Ich sehe einen Freund.', blank: 'Freund', options: ['Freund', 'Bruder', 'Lehrer'] },
      SENTS)
    expect(out.sentence).toBe('Das ist mein ___ Jamil.')
    expect(out.blank).toBe('Freund')
    expect(out.options).toContain('Freund')
  })

  it('берёт форму из предложения, а не словарную: sprechen → sprichst', () => {
    const out = groundFillBlank(
      { sentence: 'Ich ___ Deutsch.', blank: 'sprechen', options: ['sprechen', 'lesen', 'hören'] },
      SENTS)
    expect(out.sentence).toBe('Welche Sprache ___ du?')
    expect(out.blank).toBe('sprichst')
    // верный ответ обязан быть среди вариантов, иначе упражнение не сдать
    expect(out.options[0]).toBe('sprichst')
    expect(out.options).toHaveLength(3)
  })

  it('подходящей фразы нет — оставляем как было', () => {
    const p = { sentence: 'Die Blume ist schön.', blank: 'Blume', options: ['Blume', 'Baum'] }
    expect(groundFillBlank(p, SENTS)).toBe(p)
  })

  it('длинную фразу не берём — на A1 пропуск в ней теряется', () => {
    const long = ['Ich suche die Berliner Straße weil ich dort einen alten guten Freund von früher treffen möchte.']
    const p = { sentence: 'Ich sehe einen Freund.', blank: 'Freund', options: ['Freund', 'Bruder'] }
    expect(groundFillBlank(p, long)).toBe(p)
  })

  it('вариантов меньше двух — не трогаем', () => {
    const p = { sentence: 'x ___', blank: 'Freund', options: ['Freund'] }
    expect(groundFillBlank(p, SENTS)).toBe(p)
  })

  it('мусор на входе не роняет', () => {
    expect(groundFillBlank(null, SENTS)).toBe(null)
    expect(groundFillBlank({ blank: 'Freund', options: ['a', 'b'] }, null)).toEqual({ blank: 'Freund', options: ['a', 'b'] })
  })
})

describe('groundSentenceWrite', () => {
  it('образец берётся из урока', () => {
    const out = groundSentenceWrite({ word_de: 'die Straße', example: 'Die Straße ist lang.' }, SENTS)
    expect(out.example).toBe('Ich suche die Berliner Straße.')
  })

  it('фразы со словом нет — образец прежний', () => {
    const p = { word_de: 'die Blume', example: 'Die Blume ist schön.' }
    expect(groundSentenceWrite(p, SENTS)).toBe(p)
  })
})
