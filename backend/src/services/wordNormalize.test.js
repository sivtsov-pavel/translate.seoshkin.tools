import { describe, it, expect } from 'vitest'
import { stripJunk, looksLikeTypo, findAcceptedSpelling, normalizeIncomingWord } from './wordNormalize.js'

describe('stripJunk — служебные префиксы от модели', () => {
  it('срезает «verb:» (реальный случай с прода)', () => {
    expect(stripJunk('verb: kochen')).toBe('kochen')
  })

  it('срезает другие пометки частей речи', () => {
    expect(stripJunk('noun: das Haus')).toBe('das Haus')
    expect(stripJunk('глагол — sprechen')).toBe('sprechen')
  })

  it('нормальное слово не трогает', () => {
    expect(stripJunk('der Tisch')).toBe('der Tisch')
    expect(stripJunk('  die   Frau ')).toBe('die Frau')
  })

  it('не режет слово, начинающееся похоже', () => {
    expect(stripJunk('verboten')).toBe('verboten')
  })
})

describe('looksLikeTypo — опечатка или другое слово?', () => {
  it('опечатка в середине длинного слова', () => {
    expect(looksLikeTypo('Enthschuldigung', 'Entschuldigung')).toBe(true)
  })

  it('разные формы глагола НЕ опечатка — различие в окончании', () => {
    expect(looksLikeTypo('arbeitet', 'arbeiten')).toBe(false)
    expect(looksLikeTypo('wiederholt', 'wiederholen')).toBe(false)
  })

  it('короткие слова не трогаем — слишком рискованно', () => {
    expect(looksLikeTypo('Buch', 'Bach')).toBe(false)
    expect(looksLikeTypo('Haus', 'Maus')).toBe(false)
    expect(looksLikeTypo('Frau', 'Frei')).toBe(false)
  })

  it('единственное и множественное — разные слова', () => {
    expect(looksLikeTypo('Buchstabe', 'Buchstaben')).toBe(false)
  })

  it('слишком много различий — это другое слово', () => {
    expect(looksLikeTypo('Sonnenbrille', 'Sonnenschirm')).toBe(false)
  })

  it('одинаковые — не опечатка', () => {
    expect(looksLikeTypo('Entschuldigung', 'Entschuldigung')).toBe(false)
  })
})

describe('findAcceptedSpelling — берём уже принятое написание', () => {
  const known = ['die Entschuldigung', 'der Tisch', 'arbeiten', 'die Sonnenbrille']

  it('находит правильное написание вместе с артиклем', () => {
    expect(findAcceptedSpelling('Enthschuldigung', known)).toBe('die Entschuldigung')
  })

  it('форму глагола не подменяет', () => {
    expect(findAcceptedSpelling('arbeitet', known)).toBe(null)
  })

  it('новое слово оставляет новым', () => {
    expect(findAcceptedSpelling('das Fenster', known)).toBe(null)
  })

  it('пустой список известных слов', () => {
    expect(findAcceptedSpelling('Enthschuldigung', [])).toBe(null)
  })

  it('из нескольких подходящих берёт лучший, а не первый', () => {
    // В базе рядом с правильным вариантом лежит свой же мусор — строчная форма.
    const messy = ['entschuldigung', 'Entschuldigung', 'die Entschuldigung']
    expect(findAcceptedSpelling('Enthschuldigung', messy)).toBe('die Entschuldigung')
    expect(findAcceptedSpelling('Enthschuldigung', ['entschuldigung', 'Entschuldigung'])).toBe('Entschuldigung')
  })
})

describe('normalizeIncomingWord — что реально уедет в базу', () => {
  const known = ['die Entschuldigung', 'der Tisch']

  it('мусорный префикс срезан', () => {
    expect(normalizeIncomingWord('verb: kochen', known)).toBe('kochen')
  })

  it('опечатка заменена принятым написанием', () => {
    expect(normalizeIncomingWord('Enthschuldigung', known)).toBe('die Entschuldigung')
  })

  it('и то и другое сразу', () => {
    expect(normalizeIncomingWord('noun: Enthschuldigung', known)).toBe('die Entschuldigung')
  })

  it('нормальное новое слово проходит как есть', () => {
    expect(normalizeIncomingWord('das Fenster', known)).toBe('das Fenster')
  })

  it('пустое слово не добавляем', () => {
    expect(normalizeIncomingWord('   ', known)).toBe(null)
    expect(normalizeIncomingWord('verb:', known)).toBe(null)
    expect(normalizeIncomingWord(null, known)).toBe(null)
  })
})
