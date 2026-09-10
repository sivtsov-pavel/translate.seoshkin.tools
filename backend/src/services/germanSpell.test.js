// Проверка немецкой орфографии: словарь должен молчать на нормальных словах и
// ругаться на ошибках распознавания с фотографии тетради.
//
// Тест закрывает обе ловушки, на которых наивное подключение словаря разваливается
// (см. шапку germanSpell.js): записи с флагом «только внутри составного слова» и
// составные слова, которых в словаре нет.
import { describe, it, expect } from 'vitest'
import { isGermanWord, suggestGerman, unknownWordsIn } from './germanSpell.js'

describe('Немецкая орфография по словарю', () => {
  it('базовая лексика проходит', () => {
    // Именно на этих словах nspell спотыкался: у каждого в словаре есть вторая
    // запись с флагом ONLYINCOMPOUND, и без фильтрации все четыре были «ошибкой».
    for (const w of ['gehen', 'sein', 'lesen', 'gut', 'machen', 'Wasser', 'Freund']) {
      expect(isGermanWord(w), w).toBe(true)
    }
  })

  it('составные слова проходят, хотя в словаре их нет', () => {
    // Bahnhof и Fußball — по семь букв: на них ловились пороги разреза, и обычные
    // слова числились ошибками, зашумляя отчёт.
    for (const w of ['Hausaufgabe', 'Arbeitszimmer', 'Krankenhaus', 'Kindergarten', 'Bahnhof', 'Fußball']) {
      expect(isGermanWord(w), w).toBe(true)
    }
  })

  it('известный предел: опечатка из двух настоящих слов проходит', () => {
    // «fürzehn» вместо «vierzehn» = für + zehn. Словарю возразить нечем — такое
    // ловится только смыслом. Тест сторожит границу, чтобы её не считали багом.
    expect(isGermanWord('fürzehn')).toBe(true)
  })

  it('ошибки распознавания ловятся', () => {
    expect(isGermanWord('Ocean')).toBe(false)      // английское написание вместо Ozean
    expect(isGermanWord('Schwestre')).toBe(false)  // переставлены буквы
    expect(isGermanWord('Leu')).toBe(false)        // несуществующая форма от Löwe
  })

  it('предлагает замену, когда есть что предложить', () => {
    expect(suggestGerman('Ocean')).toContain('Ozean')
    expect(suggestGerman('Schwestre')).toContain('Schwester')
  })

  it('цифры, знаки и пустое не проверяются', () => {
    for (const w of ['', '2026', '09.09.2016', '12:30']) expect(isGermanWord(w), w).toBe(true)
  })

  it('в тексте находит только незнакомые слова', () => {
    const bad = unknownWordsIn('Der Ocean ist blau und das Haus ist groß.')
    expect(bad.map(x => x.word)).toEqual(['Ocean'])
  })
})
