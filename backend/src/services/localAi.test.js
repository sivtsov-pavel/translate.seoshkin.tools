import { describe, it, expect } from 'vitest'
import { cleanConcept } from './localAi.js'

describe('cleanConcept — чистим ответ локальной модели до голого понятия', () => {
  it('простой ответ', () => {
    expect(cleanConcept('Table')).toBe('Table')
  })

  it('срезает рассуждения qwen3 в <think>', () => {
    expect(cleanConcept('<think>\nПользователь просит перевод слова «стол».\n</think>\nTable')).toBe('Table')
  })

  it('обрыв на рассуждениях (незакрытый <think>) — ответа нет, обрывок мысли в промпт не тащим', () => {
    expect(cleanConcept('<think>hmm the word is Tisch → table')).toBe('')
  })

  it('снимает кавычки и точку', () => {
    expect(cleanConcept('"Suitcase".')).toBe('Suitcase')
  })

  it('берёт первую содержательную строку', () => {
    expect(cleanConcept('\n\nHand\n\nЭто перевод слова «рука».')).toBe('Hand')
  })

  it('не длиннее трёх слов', () => {
    expect(cleanConcept('native language of the person')).toBe('native language of')
  })

  it('короткая фраза проходит целиком', () => {
    expect(cleanConcept('native language')).toBe('native language')
  })

  it('ответ кириллицей отбрасываем — иначе снова нарисуется надпись', () => {
    expect(cleanConcept('стол')).toBe('')
  })

  it('пустой/мусорный ответ', () => {
    expect(cleanConcept('')).toBe('')
    expect(cleanConcept(null)).toBe('')
    expect(cleanConcept('<think>только рассуждения</think>')).toBe('')
  })
})
