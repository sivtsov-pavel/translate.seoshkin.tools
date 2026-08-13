import { describe, it, expect } from 'vitest'
import { fixAgreement } from './fillBlankFix.js'

// Инфинитив вместо личной формы — ошибка, которую сразу видит учитель:
// «Ich ___ das Buch» с ответом «nehmen» вместо «nehme».
describe('fixAgreement — инфинитив после подлежащего', () => {
  it('ich: слабый глагол', () => {
    const out = fixAgreement({ sentence: 'Ich ___ auf gutes Wetter.', blank: 'hoffen', options: ['hoffen', 'gehen'] })
    expect(out.blank).toBe('hoffe')
    expect(out.options).toContain('hoffe')   // иначе ответа нет среди вариантов
  })

  it('ich: сильный глагол — корень в 1 лице не меняется', () => {
    expect(fixAgreement({ sentence: 'Ich ___ das Buch.', blank: 'nehmen', options: ['nehmen'] }).blank).toBe('nehme')
    expect(fixAgreement({ sentence: 'Ich ___ ein Auto.', blank: 'sehen', options: ['sehen'] }).blank).toBe('sehe')
  })

  it('ich: основа на -t получает -e', () => {
    expect(fixAgreement({ sentence: 'Ich ___ auf dich.', blank: 'warten', options: ['warten'] }).blank).toBe('warte')
  })

  it('ihr: основа на -t получает -et', () => {
    expect(fixAgreement({ sentence: 'Ihr ___ auf den Bus.', blank: 'warten', options: ['warten'] }).blank).toBe('wartet')
  })

  it('wir: инфинитив и есть верная форма — не трогаем', () => {
    const p = { sentence: 'Wir ___ Deutsch.', blank: 'lernen', options: ['lernen'] }
    expect(fixAgreement(p)).toBe(p)
  })

  it('du и er: спрягать наугад нельзя — упражнение отбрасываем', () => {
    // du nimmst, er sieht — корень меняется, из инфинитива это не выводится
    expect(fixAgreement({ sentence: 'Du ___ das Buch.', blank: 'nehmen', options: ['nehmen'] })).toBe(null)
    expect(fixAgreement({ sentence: 'Er ___ den Film.', blank: 'sehen', options: ['sehen'] })).toBe(null)
  })
})

describe('fixAgreement — чего трогать нельзя', () => {
  it('модальный глагол: инфинитив в конце правилен', () => {
    // Тот самый случай, ради которого общая эвристика была запрещена
    const p = { sentence: 'Ich kann gut ___.', blank: 'singen', options: ['singen'] }
    expect(fixAgreement(p)).toBe(p)
  })

  it('пропуск не после подлежащего', () => {
    const p = { sentence: 'Heute ___ ich viel.', blank: 'arbeiten', options: ['arbeiten'] }
    expect(fixAgreement(p)).toBe(p)
  })

  it('Sie — не понять, «Вы» или «она»', () => {
    const p = { sentence: 'Sie ___ das Buch.', blank: 'nehmen', options: ['nehmen'] }
    expect(fixAgreement(p)).toBe(p)
  })

  it('ответ не инфинитив — это не наш случай', () => {
    const p = { sentence: 'Ich ___ Hunger.', blank: 'habe', options: ['habe'] }
    expect(fixAgreement(p)).toBe(p)
  })
})
