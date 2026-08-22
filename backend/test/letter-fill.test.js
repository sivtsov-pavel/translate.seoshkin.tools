// «Добавь букву»: маску проверяем и при необходимости строим сами.
//
// Находка 23.08.2026: на бою 544 упражнения прятали буквы внутри артикля — «d_r Sport»,
// «d__ N__l». Ученик угадывает буквы в «der/die/das» вместо того, чтобы тренировать
// само слово, а род при этом не запоминается: артикль он именно что не видит целиком.
// buildMask артикль не трогал уже тогда, но isValidMask такие маски пропускал как годные.
import { describe, it, expect } from 'vitest'
import { isValidMask, buildMask, normalizeLetterFill } from '../src/services/letterFill.js'

describe('маска «Добавь букву»', () => {
  it('дырка внутри слова — маска годная', () => {
    expect(isValidMask('Sp_rt', 'Sport')).toBe(true)
  })

  it('дырка внутри артикля — маска негодная', () => {
    expect(isValidMask('d_r Sport', 'der Sport')).toBe(false)
    expect(isValidMask('d__ N__l', 'die Null')).toBe(false)
  })

  it('артикль целый, дырка в слове — маска годная', () => {
    expect(isValidMask('der Sp_rt', 'der Sport')).toBe(true)
  })

  it('разная длина маски и ответа — негодная', () => {
    expect(isValidMask('ich _n', 'ich bin')).toBe(false)
  })

  it('buildMask артикль не трогает', () => {
    const masked = buildMask('der Sport')
    expect(masked.startsWith('der ')).toBe(true)
    expect(masked).not.toBe('der Sport') // дырка всё-таки появилась
  })

  it('битую маску с дыркой в артикле normalizeLetterFill перестраивает', () => {
    const out = normalizeLetterFill({ answer: 'der Sport', masked: 'd_r _p_r_' })
    expect(out.masked.startsWith('der ')).toBe(true)
    expect(isValidMask(out.masked, 'der Sport')).toBe(true)
  })
})
