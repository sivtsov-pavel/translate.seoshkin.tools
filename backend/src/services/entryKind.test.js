import { describe, it, expect } from 'vitest'
import { classifyEntry, joinWrappedLines } from './entryKind.js'

describe('classifyEntry — реальные строки из разбора урока 19', () => {
  it('вопрос — предложение', () => {
    expect(classifyEntry('Welche Sprache sprichst du?')).toBe('sentence')
    expect(classifyEntry('können Sie das übersetzen?')).toBe('sentence')
  })

  it('заготовка с многоточием — предложение (в словарь не годится)', () => {
    expect(classifyEntry('ich suche die ... Straße.')).toBe('sentence')
  })

  it('суффикс из грамматической таблицы — обрывок', () => {
    expect(classifyEntry('_ig')).toBe('fragment')
    expect(classifyEntry('-chen')).toBe('fragment')
  })
})

describe('classifyEntry — что обязано остаться словом', () => {
  it('обычное существительное с артиклем', () => {
    expect(classifyEntry('die Straße')).toBe('word')
  })

  it('глагол', () => {
    expect(classifyEntry('sprechen')).toBe('word')
  })

  it('устойчивые выражения из двух-трёх слов', () => {
    expect(classifyEntry('noch nicht')).toBe('word')
    expect(classifyEntry('zu Hause')).toBe('word')
    expect(classifyEntry('guten Tag')).toBe('word')
  })

  it('сокращение с точкой — не предложение', () => {
    expect(classifyEntry('z.B.')).toBe('word')
  })

  it('английские и испанские слова тоже слова', () => {
    expect(classifyEntry('the table')).toBe('word')
    expect(classifyEntry('la casa')).toBe('word')
  })
})

describe('classifyEntry — границы', () => {
  it('короткий вопрос всё равно предложение', () => {
    expect(classifyEntry("Wie geht's?")).toBe('sentence')
  })

  it('четыре слова без точки — уже фраза', () => {
    expect(classifyEntry('Kannst du mir helfen')).toBe('sentence')
  })

  it('пустая строка — обрывок', () => {
    expect(classifyEntry('   ')).toBe('fragment')
    expect(classifyEntry(null)).toBe('fragment')
  })
})

describe('joinWrappedLines — перенос в тетради', () => {
  it('дефис в конце — перенос слова, склеиваем без пробела', () => {
    expect(joinWrappedLines(['Der Kühl-', 'schrank ist neu.'])).toEqual(['Der Kühlschrank ist neu.'])
  })

  it('фраза не закончена, продолжение со строчной — одно предложение', () => {
    expect(joinWrappedLines(['Die Dose', 'ist leer.'])).toEqual(['Die Dose ist leer.'])
  })

  it('законченную фразу не приклеиваем к следующей', () => {
    expect(joinWrappedLines(['Ich wohne hier.', 'Du kommst spät.']))
      .toEqual(['Ich wohne hier.', 'Du kommst spät.'])
  })

  it('следующая с заглавной — новая мысль, не продолжение', () => {
    expect(joinWrappedLines(['Das ist mein Freund', 'Er ist neu hier.']))
      .toEqual(['Das ist mein Freund', 'Er ist neu hier.'])
  })

  it('вопрос закончен — склейки нет', () => {
    expect(joinWrappedLines(['Wie geht es dir?', 'gut, danke.']))
      .toEqual(['Wie geht es dir?', 'gut, danke.'])
  })

  it('пустые строки отбрасываются', () => {
    expect(joinWrappedLines(['  ', 'Ich bin da.'])).toEqual(['Ich bin da.'])
  })
})
