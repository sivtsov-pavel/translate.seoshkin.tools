import { describe, it, expect } from 'vitest'
import { computeStreak } from '../src/services/streak.js'

// «Сегодня» фиксируем, иначе тест начнёт врать в полночь
const NOW = new Date('2026-10-01T09:00:00Z')
const d = (s) => new Date(`${s}T12:00:00Z`)

describe('computeStreak', () => {
  it('занимался сегодня и вчера — два дня', () => {
    expect(computeStreak([d('2026-10-01'), d('2026-09-30')], NOW)).toBe(2)
  })

  it('сегодня ещё не занимался, но вчера и позавчера — два дня', () => {
    // Ровно случай Павла 01.10.2026: занятия 29 и 30 сентября, главная показывала «1».
    // День не закончился — рвать серию рано.
    expect(computeStreak([d('2026-09-30'), d('2026-09-29')], NOW)).toBe(2)
  })

  it('длинная серия без сегодняшнего дня', () => {
    const days = ['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-27'].map(d)
    expect(computeStreak(days, NOW)).toBe(4)
  })

  it('пропуск в середине обрывает счёт', () => {
    // 30, 29 подряд; 27 — после дыры за 28-е
    const days = ['2026-09-30', '2026-09-29', '2026-09-27', '2026-09-26'].map(d)
    expect(computeStreak(days, NOW)).toBe(2)
  })

  it('последнее занятие раньше вчера — серии нет', () => {
    expect(computeStreak([d('2026-09-29'), d('2026-09-28')], NOW)).toBe(0)
  })

  it('только сегодня — один день', () => {
    expect(computeStreak([d('2026-10-01')], NOW)).toBe(1)
  })

  it('занятий не было вовсе', () => {
    expect(computeStreak([], NOW)).toBe(0)
    expect(computeStreak(null, NOW)).toBe(0)
  })

  it('порядок и повторы на входе не влияют на ответ', () => {
    const days = ['2026-09-29', '2026-10-01', '2026-09-30', '2026-09-30'].map(d)
    expect(computeStreak(days, NOW)).toBe(3)
  })

  it('день из будущего не рвёт серию (часовые пояса)', () => {
    const days = ['2026-10-02', '2026-10-01', '2026-09-30'].map(d)
    expect(computeStreak(days, NOW)).toBe(2)
  })

  it('принимает строки дат, как их отдаёт psql', () => {
    expect(computeStreak(['2026-09-30', '2026-09-29'], NOW)).toBe(2)
  })

  it('реальная история Павла: 24, 25, 29, 30 сентября', () => {
    const days = ['2026-09-30', '2026-09-29', '2026-09-25', '2026-09-24'].map(d)
    expect(computeStreak(days, NOW)).toBe(2)
  })
})
