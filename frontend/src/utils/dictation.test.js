import { describe, it, expect } from 'vitest'
import { answerVariants, checkDictation, spokenForm } from './dictation.js'

describe('answerVariants — разбор слов с «/»', () => {
  it('обычное слово отдаёт одну форму', () => {
    expect(answerVariants('das Alphabet')).toEqual(['das Alphabet'])
  })

  it('два синонима — каждый самодостаточен', () => {
    expect(answerVariants('die Lehrerin / die Kursleiterin'))
      .toEqual(['die Lehrerin / die Kursleiterin', 'die Lehrerin', 'die Kursleiterin'])
  })

  it('без пробелов вокруг слэша', () => {
    expect(answerVariants('Kunde/Kundin')).toEqual(['Kunde/Kundin', 'Kunde', 'Kundin'])
  })

  it('местоимения с общим хвостом-глаголом', () => {
    expect(answerVariants('er/sie/es hofft'))
      .toEqual(['er/sie/es hofft', 'er hofft', 'sie hofft', 'es hofft'])
  })

  it('два местоимения с общим хвостом', () => {
    expect(answerVariants('sie/Sie möchten'))
      .toEqual(['sie/Sie möchten', 'sie möchten', 'Sie möchten'])
  })

  it('только местоимения, без хвоста', () => {
    expect(answerVariants('er/sie/es')).toEqual(['er/sie/es', 'er', 'sie', 'es'])
  })

  it('срезает подсказку в скобках', () => {
    expect(answerVariants('die Farben (мн.ч.)')).toEqual(['die Farben'])
  })
})

describe('spokenForm — что синтезатор читает вслух', () => {
  it('обычное слово читается как есть', () => {
    expect(spokenForm('das Alphabet')).toBe('das Alphabet')
  })

  it('из двух форм диктуем первую, а не строку со слэшем', () => {
    expect(spokenForm('die Lehrerin / die Kursleiterin')).toBe('die Lehrerin')
  })

  it('местоимения с общим хвостом — читаем полную форму', () => {
    expect(spokenForm('er/sie/es hofft')).toBe('er hofft')
  })
})

describe('checkDictation — что засчитываем', () => {
  it('достаточно одной формы из двух', () => {
    expect(checkDictation('die Lehrerin', 'die Lehrerin / die Kursleiterin').correct).toBe(true)
    expect(checkDictation('die Kursleiterin', 'die Lehrerin / die Kursleiterin').correct).toBe(true)
  })

  it('строка целиком тоже верна', () => {
    expect(checkDictation('die Lehrerin / die Kursleiterin', 'die Lehrerin / die Kursleiterin').correct).toBe(true)
  })

  it('одно местоимение без глагола НЕ засчитывается', () => {
    expect(checkDictation('er', 'er/sie/es hofft').correct).toBe(false)
    expect(checkDictation('er hofft', 'er/sie/es hofft').correct).toBe(true)
  })

  it('регистр важен, но подсказываем про заглавную', () => {
    const r = checkDictation('die lehrerin', 'die Lehrerin / die Kursleiterin')
    expect(r.correct).toBe(false)
    expect(r.caseHint).toBe(true)
  })

  it('чужое слово — ошибка без подсказки про регистр', () => {
    const r = checkDictation('die Karslaterin', 'die Lehrerin / die Kursleiterin')
    expect(r.correct).toBe(false)
    expect(r.caseHint).toBe(false)
  })

  it('пустой ответ — не верно', () => {
    expect(checkDictation('  ', 'das Alphabet').correct).toBe(false)
  })
})
