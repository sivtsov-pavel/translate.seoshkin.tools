import { describe, it, expect } from 'vitest'
import { buildOptions, shuffleWords, checkBuilt } from './PhraseTrainer.jsx'

const phrases = [
  { id: 1, text: 'Ich koche Suppe.', translation: 'Я варю суп.' },
  { id: 2, text: 'Ich gehe in die Küche.', translation: 'Я иду на кухню.' },
  { id: 3, text: 'Ich wasche meine Hände.', translation: 'Я мою руки.' },
]

describe('шаг «слушаю»', () => {
  it('даёт три варианта, среди них верный', () => {
    const opts = buildOptions(phrases, 0)
    expect(opts).toHaveLength(3)
    expect(opts).toContain('Я варю суп.')
  })

  it('не повторяет варианты', () => {
    expect(new Set(buildOptions(phrases, 1)).size).toBe(3)
  })

  it('на наборе из двух фраз не падает', () => {
    const opts = buildOptions(phrases.slice(0, 2), 0)
    expect(opts).toContain('Я варю суп.')
    expect(opts.length).toBeLessThanOrEqual(3)
  })
})

describe('шаг «собираю»', () => {
  it('разбивает фразу на слова', () => {
    expect(shuffleWords('Ich koche Suppe.').sort()).toEqual(['Ich', 'Suppe.', 'koche'])
  })

  it('сверяет собранное с эталоном', () => {
    expect(checkBuilt(['Ich', 'koche', 'Suppe.'], 'Ich koche Suppe.')).toBe(true)
    expect(checkBuilt(['koche', 'Ich', 'Suppe.'], 'Ich koche Suppe.')).toBe(false)
  })

  it('лишние пробелы в эталоне не мешают', () => {
    expect(checkBuilt(['Ich', 'koche'], '  Ich koche  ')).toBe(true)
  })
})
