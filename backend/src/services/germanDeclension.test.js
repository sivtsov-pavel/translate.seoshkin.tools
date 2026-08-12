import { describe, it, expect } from 'vitest'
import { declineNoun, isDeclinableNoun } from './germanDeclension.js'

describe('isDeclinableNoun', () => {
  it('узнаёт существительное с артиклем', () => {
    expect(isDeclinableNoun('der Tisch')).toBe(true)
    expect(isDeclinableNoun('die Kerze')).toBe(true)
    expect(isDeclinableNoun('das Buch')).toBe(true)
  })

  it('отвергает слова без артикля и не-существительные', () => {
    expect(isDeclinableNoun('kochen')).toBe(false)
    expect(isDeclinableNoun('schön')).toBe(false)
    expect(isDeclinableNoun('')).toBe(false)
  })

  it('отвергает составные записи со слэшем и множественное «die ...»', () => {
    expect(isDeclinableNoun('der Kunde/die Kundin')).toBe(false)
  })
})

describe('declineNoun — мужской род', () => {
  it('der Tisch → den/dem/des Tisches', () => {
    expect(declineNoun('der Tisch')).toEqual({
      article: 'der', noun: 'Tisch',
      nom: 'der Tisch', akk: 'den Tisch', dat: 'dem Tisch', gen: 'des Tisches',
    })
  })

  it('многосложное в родительном получает -s, а не -es', () => {
    expect(declineNoun('der Lehrer').gen).toBe('des Lehrers')
    expect(declineNoun('der Computer').gen).toBe('des Computers')
  })

  it('после шипящих и -s ставим -es', () => {
    expect(declineNoun('das Haus').gen).toBe('des Hauses')
    expect(declineNoun('der Platz').gen).toBe('des Platzes')
  })
})

describe('declineNoun — женский и средний род', () => {
  it('женский род не меняется, кроме артикля', () => {
    expect(declineNoun('die Kerze')).toEqual({
      article: 'die', noun: 'Kerze',
      nom: 'die Kerze', akk: 'die Kerze', dat: 'der Kerze', gen: 'der Kerze',
    })
  })

  it('средний род: артикль как у мужского, кроме винительного', () => {
    const r = declineNoun('das Buch')
    expect(r.nom).toBe('das Buch')
    expect(r.akk).toBe('das Buch')
    expect(r.dat).toBe('dem Buch')
    expect(r.gen).toBe('des Buches')
  })
})

describe('declineNoun — крайние случаи', () => {
  it('на слове без артикля возвращает null', () => {
    expect(declineNoun('Tisch')).toBeNull()
    expect(declineNoun('kochen')).toBeNull()
    expect(declineNoun(null)).toBeNull()
  })

  it('лишние пробелы не мешают', () => {
    expect(declineNoun('  der   Tisch ').akk).toBe('den Tisch')
  })

  it('существительные на -e мужского рода (слабое склонение) не берём', () => {
    // der Kunde → den Kunden, а не den Kunde. Правило сложное и с исключениями,
    // поэтому такие слова просто пропускаем, чтобы не учить ошибке.
    expect(declineNoun('der Kunde')).toBeNull()
    expect(declineNoun('der Junge')).toBeNull()
  })
})
