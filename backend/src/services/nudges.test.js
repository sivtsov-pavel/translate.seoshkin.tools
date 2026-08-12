import { describe, it, expect } from 'vitest'
import { shouldNudge, pickNudge, firstName, NUDGE_WINDOW } from './nudges.js'

const base = {
  localMinutes: 12 * 60,   // полдень
  lastNudgeMinutes: null,
  countToday: 0,
  studiedToday: false,
}

describe('когда пинать ученика', () => {
  it('днём, если сегодня не занимался — пинаем', () => {
    expect(shouldNudge(base)).toBe(true)
  })

  it('занимался сегодня — не трогаем', () => {
    expect(shouldNudge({ ...base, studiedToday: true })).toBe(false)
  })

  it('ночью и рано утром молчим', () => {
    expect(shouldNudge({ ...base, localMinutes: 7 * 60 })).toBe(false)   // 07:00 — рано
    expect(shouldNudge({ ...base, localMinutes: 23 * 60 })).toBe(false)  // 23:00 — поздно
    expect(shouldNudge({ ...base, localMinutes: NUDGE_WINDOW.from * 60 })).toBe(true)
  })

  it('выдерживаем два часа между сообщениями', () => {
    expect(shouldNudge({ ...base, localMinutes: 12 * 60, lastNudgeMinutes: 11 * 60 })).toBe(false)
    expect(shouldNudge({ ...base, localMinutes: 13 * 60, lastNudgeMinutes: 11 * 60 })).toBe(true)
  })

  it('не больше четырёх за день — иначе уведомления просто отключат', () => {
    expect(shouldNudge({ ...base, countToday: 3 })).toBe(true)
    expect(shouldNudge({ ...base, countToday: 4 })).toBe(false)
  })
})

describe('тексты', () => {
  it('обращается по имени', () => {
    const n = pickNudge('Павлуша', 0, false)
    expect(n.body).toContain('Павлуша')
  })

  it('перебирает разные тексты, а не повторяет один', () => {
    const a = pickNudge('Павлуша', 0, false).body
    const b = pickNudge('Павлуша', 1, false).body
    const c = pickNudge('Павлуша', 2, false).body
    expect(new Set([a, b, c]).size).toBeGreaterThan(1)
  })

  it('для прошедшего урок — другой текст, про закрепление', () => {
    const n = pickNudge('Павлуша', 0, true)
    expect(n.body).toMatch(/закреп|повтор/i)
  })

  it('без имени текст остаётся человеческим', () => {
    const n = pickNudge('', 0, false)
    expect(n.body.length).toBeGreaterThan(10)
    expect(n.body).not.toContain('undefined')
    expect(n.body).not.toContain(', ,')
  })
})

describe('firstName', () => {
  it('берёт имя из полного имени', () => {
    expect(firstName('Павел Сивцов')).toBe('Павел')
    expect(firstName('  Анна  ')).toBe('Анна')
  })

  it('пустое имя не ломает', () => {
    expect(firstName(null)).toBe('')
    expect(firstName('')).toBe('')
  })
})
