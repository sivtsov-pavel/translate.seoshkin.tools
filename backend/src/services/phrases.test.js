import { describe, it, expect } from 'vitest'
import { buildPhrasePrompt, parsePhrasesResponse, validatePhrases } from './phrases.js'

describe('buildPhrasePrompt', () => {
  const words = [
    { word_de: 'die Küche', translation_ru: 'кухня' },
    { word_de: 'kochen', translation_ru: 'готовить' },
  ]

  it('кладёт в промпт эталоны — пример сильнее инструкции', () => {
    const p = buildPhrasePrompt({ words, level: 'A1', langName: 'Deutsch' })
    expect(p).toContain('Ich wasche meine Hände.')
    expect(p).toContain('die Küche')
    expect(p).toContain('A1')
  })

  it('просит меньше фраз, когда слов мало', () => {
    const few = buildPhrasePrompt({ words: words.slice(0, 1), level: 'A1', langName: 'Deutsch' })
    const many = buildPhrasePrompt({
      words: Array.from({ length: 12 }, (_, i) => ({ word_de: `Wort${i}`, translation_ru: `слово${i}` })),
      level: 'A1', langName: 'Deutsch',
    })
    expect(few).toContain('Сделай 6 фраз')
    expect(many).toContain('Сделай 12 фраз')
  })
})

describe('parsePhrasesResponse', () => {
  it('разбирает ответ модели', () => {
    const raw = JSON.stringify({
      title: 'Kochen', emoji: '🍲',
      phrases: [
        { text: 'Ich gehe in die Küche.', emoji: '🏠', words: ['die Küche'] },
        { text: 'Ich koche Suppe.', emoji: '🍲', words: ['kochen'] },
      ],
    })
    const r = parsePhrasesResponse(raw)
    expect(r.title).toBe('Kochen')
    expect(r.phrases).toHaveLength(2)
    expect(r.phrases[0].text).toBe('Ich gehe in die Küche.')
  })

  it('переживает обёртку в ```json', () => {
    const raw = '```json\n{"title":"Kochen","phrases":[{"text":"Ich koche Suppe."}]}\n```'
    expect(parsePhrasesResponse(raw).phrases).toHaveLength(1)
  })

  it('возвращает пустой набор на мусоре вместо падения', () => {
    expect(parsePhrasesResponse('не json').phrases).toEqual([])
    expect(parsePhrasesResponse('').phrases).toEqual([])
  })
})

describe('validatePhrases', () => {
  const wordIndex = new Map([['küche', 11], ['kochen', 22]])

  it('отбрасывает фразы не по уровню и связывает слова урока', () => {
    const parsed = { title: 'Kochen', phrases: [
      { text: 'Ich koche Suppe im Topf.', words: ['kochen'] },
      { text: 'Nachdem ich gekocht hatte, esse ich.', words: ['kochen'] },
    ] }
    const r = validatePhrases(parsed, { level: 'A1', wordIndex })
    expect(r.good).toHaveLength(1)
    expect(r.good[0].word_ids).toEqual([22])
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].problems.join(' ')).toMatch(/придаточ/)
  })

  it('находит слово урока прямо в тексте, даже если модель его не назвала', () => {
    const parsed = { title: 'Kochen', phrases: [{ text: 'Die Küche ist klein.', words: [] }] }
    expect(validatePhrases(parsed, { level: 'A1', wordIndex }).good[0].word_ids).toEqual([11])
  })

  it('не пропускает дубликаты фраз', () => {
    const parsed = { title: 'Kochen', phrases: [
      { text: 'Ich koche Suppe.', words: [] },
      { text: 'Ich koche Suppe.', words: [] },
    ] }
    expect(validatePhrases(parsed, { level: 'A1', wordIndex }).good).toHaveLength(1)
  })

  it('на пустом разборе не падает', () => {
    expect(validatePhrases({ phrases: [] }, { level: 'A1', wordIndex })).toEqual({ good: [], rejected: [] })
  })
})
