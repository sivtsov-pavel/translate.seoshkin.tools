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

  // Личные формы тоже кончаются на -n. Проверка по хвосту слова превращала их
  // в «kane» и «bie» — то есть ломала верные упражнения.
  it('личная форма на -n остаётся нетронутой', () => {
    const kann = { sentence: 'Ich ___ gut singen.', blank: 'kann', options: ['kann'] }
    expect(fixAgreement(kann)).toBe(kann)
    const bin = { sentence: 'Ich ___ müde.', blank: 'bin', options: ['bin'] }
    expect(fixAgreement(bin)).toBe(bin)
    const schon = { sentence: 'Ihr ___ dran.', blank: 'seid', options: ['seid'] }
    expect(fixAgreement(schon)).toBe(schon)
  })

  it('возвратный глагол: местоимение уже в предложении', () => {
    const out = fixAgreement({ sentence: 'Ich ___ mich über die Schule.', blank: 'sich ärgern', options: ['sich ärgern'] })
    expect(out.blank).toBe('ärgere')
    expect(out.options).toContain('ärgere')
  })

  it('возвратный глагол без местоимения в предложении — не трогаем', () => {
    const p = { sentence: 'Ich ___ über die Schule.', blank: 'sich ärgern', options: ['sich ärgern'] }
    expect(fixAgreement(p)).toBe(p)
  })

  it('глаголы на -eln/-ern спрягаются верно', () => {
    expect(fixAgreement({ sentence: 'Ich ___ Briefmarken.', blank: 'sammeln', options: ['sammeln'] }).blank).toBe('sammle')
  })
})

// Отделяемые глаголы — дыра, найденная аудитом 13.08: «aufräumen» спрягался целиком
// в «aufräume» («Ich aufräume mein Zimmer auf» — не немецкий, урок 298).
describe('fixAgreement — отделяемые приставки', () => {
  it('приставка в конце предложения: в пропуск идёт спрягаемая основа', () => {
    const out = fixAgreement({ sentence: 'Ich ___ die Arbeit an.', blank: 'anfangen', options: ['anfangen', 'gehen'] })
    expect(out.blank).toBe('fange')
    expect(out.options).toContain('fange')
    expect(fixAgreement({ sentence: 'Ich ___ mein Zimmer auf.', blank: 'aufräumen', options: ['aufräumen'] }).blank).toBe('räume')
    expect(fixAgreement({ sentence: 'Ihr ___ die Geschenke ein.', blank: 'einpacken', options: ['einpacken'] }).blank).toBe('packt')
  })

  it('wir: инфинитив целиком в пропуске неверен, верна основа', () => {
    // Раньше «Wir anfangen … an» считалось правильным (форма wir совпадает с инфинитивом)
    expect(fixAgreement({ sentence: 'Wir ___ um 8 Uhr auf.', blank: 'aufstehen', options: ['aufstehen'] }).blank).toBe('stehen')
  })

  it('возвратный отделяемый: основа без приставки и местоимения', () => {
    expect(fixAgreement({ sentence: 'Ich ___ mich schnell an.', blank: 'sich anziehen', options: ['sich anziehen'] }).blank).toBe('ziehe')
  })

  it('du: основа сильного глагола наугад не спрягается — отбрасываем', () => {
    expect(fixAgreement({ sentence: 'Du ___ die Arbeit an.', blank: 'anfangen', options: ['anfangen'] })).toBe(null)
  })

  it('приставка НЕ отделена в предложении — не чиним сами, отбрасываем', () => {
    expect(fixAgreement({ sentence: 'Ich ___ mein Zimmer.', blank: 'aufräumen', options: ['aufräumen'] })).toBe(null)
  })

  it('ложные отделяемые спрягаются целиком', () => {
    // antworten — не «ant + worten»; teilen — не «teil + en»; angeln — не «an + geln»
    expect(fixAgreement({ sentence: 'Ich ___ auf die Frage.', blank: 'antworten', options: ['antworten'] }).blank).toBe('antworte')
    expect(fixAgreement({ sentence: 'Ich ___ den Kuchen.', blank: 'teilen', options: ['teilen'] }).blank).toBe('teile')
    expect(fixAgreement({ sentence: 'Ich ___ am See.', blank: 'angeln', options: ['angeln'] }).blank).toBe('angle')
  })

  it('притяжательное Ihr + существительное не трогается (защита регистром)', () => {
    // «Ihr ___ ist kaputt» + «Wagen»: сверка формы wir регистрозависима — существительное
    // с заглавной не совпадает с «wagen» и остаётся нетронутым. Закреплено тестом.
    const p = { sentence: 'Ihr ___ ist kaputt.', blank: 'Wagen', options: ['Wagen', 'Auto'] }
    expect(fixAgreement(p)).toBe(p)
    const st = { sentence: 'Ihr ___ ist online.', blank: 'Status', options: ['Status'] }
    expect(fixAgreement(st)).toBe(st)
  })
})
