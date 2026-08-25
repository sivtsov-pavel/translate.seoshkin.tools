// Карточки виджета. На домашнем экране ошибку видно всем и сразу, а починить её можно
// только новым APK — поэтому сборку карточки проверяем тестами, а не глазами.
import { describe, it, expect } from 'vitest'
import { choiceCard, flipCard, CARD_KINDS } from './widgetCards.js'

const mcRow = (over = {}) => ({
  id: 501,
  type: 'multiple_choice',
  payload: { question: 'Переведите: die Schwester', options: ['сестра', 'брат', 'мать', 'тётя', 'дядя'], correct: 0 },
  payload_translations: {},
  word_de: 'die Schwester',
  word_translations: { ru: 'сестра', es: 'hermana' },
  translation_ru: 'сестра',
  ...over,
})

describe('карточка «выбери ответ»', () => {
  it('четыре варианта, правильный среди них', () => {
    const c = choiceCard(mcRow(), 'ru')
    expect(c.kind).toBe(CARD_KINDS.CHOICE)
    expect(c.options).toHaveLength(4)
    expect(c.options[c.correct]).toBe('сестра')
  })

  it('вопрос — слово без служебного префикса: на виджете мало места', () => {
    expect(choiceCard(mcRow({ word_de: null }), 'ru').question).toBe('die Schwester')
  })

  it('произносится немецкое слово, а не перевод', () => {
    expect(choiceCard(mcRow(), 'ru').speak).toBe('die Schwester')
  })

  it('варианты — на языке ученика, если перевод есть', () => {
    const row = mcRow({
      payload_translations: { es: ['hermana', 'hermano', 'madre', 'tía', 'tío'] },
    })
    const c = choiceCard(row, 'es')
    expect(c.options[c.correct]).toBe('hermana')
    expect(c.options.every(o => /^[a-zá-úñ]+$/i.test(o))).toBe(true)
  })

  it('перевод неполный — берём исходные варианты, а не мешанину из двух языков', () => {
    const row = mcRow({ payload_translations: { es: ['hermana', 'hermano'] } })
    const c = choiceCard(row, 'es')
    expect(c.options[c.correct]).toBe('сестра')
  })

  it('битое упражнение не попадает на виджет', () => {
    expect(choiceCard(mcRow({ payload: { options: ['одно'], correct: 0 } }), 'ru')).toBe(null)
    expect(choiceCard(mcRow({ payload: { options: ['а', 'б'], correct: 9 } }), 'ru')).toBe(null)
  })

  it('правильный ответ не стоит всегда на одном месте', () => {
    // Иначе запоминается позиция кнопки, а не слово.
    const positions = new Set()
    for (let i = 0; i < 40; i++) positions.add(choiceCard(mcRow(), 'ru').correct)
    expect(positions.size).toBeGreaterThan(1)
  })
})

describe('карточка со самооценкой', () => {
  const flipRow = (over = {}) => ({
    id: 777, type: 'flashcard',
    payload: { question: 'die Schwester', answer: 'сестра' },
    payload_translations: {},
    word_de: 'die Schwester',
    word_translations: { ru: 'сестра', es: 'hermana' },
    translation_ru: 'сестра',
    ...over,
  })

  it('слово и перевод на языке ученика', () => {
    const c = flipCard(flipRow(), 'es')
    expect(c.kind).toBe(CARD_KINDS.FLIP)
    expect(c.question).toBe('die Schwester')
    expect(c.answer).toBe('hermana')
  })

  it('нет перевода на язык ученика — падаем на русский, а не на пустоту', () => {
    expect(flipCard(flipRow({ word_translations: {} }), 'es').answer).toBe('сестра')
  })

  it('без перевода вовсе карточку не показываем', () => {
    const c = flipCard(flipRow({ word_translations: {}, translation_ru: null, payload: { question: 'die Schwester' } }), 'ru')
    expect(c).toBe(null)
  })
})
