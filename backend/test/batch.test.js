import { describe, it, expect } from 'vitest'
import { composeBatch, BATCH_SIZE, BATCH_NEW_MIN } from '../src/services/batch.js'

const mk = (nRev, nNew) => [
  ...Array.from({ length: nRev }, (_, i) => ({ id: `r${i}`, is_review: true })),
  ...Array.from({ length: nNew }, (_, i) => ({ id: `n${i}`, is_review: false })),
]
const split = (b) => [b.filter(x => x.is_review).length, b.filter(x => !x.is_review).length]

describe('composeBatch — состав подхода', () => {
  it('бронь под новое работает на реальной пропорции Павла', () => {
    // 30.09.2026: из 133 упражнений дня 95 были повторами
    const b = composeBatch(mk(95, 38))
    expect(b.length).toBe(BATCH_SIZE)
    expect(split(b)).toEqual([BATCH_SIZE - BATCH_NEW_MIN, BATCH_NEW_MIN])
  })

  it('новое кончилось — подход добирается повторами', () => {
    expect(split(composeBatch(mk(80, 0)))).toEqual([BATCH_SIZE, 0])
  })

  it('повторов нет — подход целиком новый', () => {
    expect(split(composeBatch(mk(0, 80)))).toEqual([0, BATCH_SIZE])
  })

  it('нового меньше брони — берём сколько есть, остальное повторы', () => {
    expect(split(composeBatch(mk(80, 3)))).toEqual([BATCH_SIZE - 3, 3])
  })

  it('пул меньше подхода — отдаём как есть', () => {
    expect(composeBatch(mk(5, 4)).length).toBe(9)
  })

  it('пустой пул', () => {
    expect(composeBatch([])).toEqual([])
  })

  it('порядок выдачи сохраняется — иначе типы упражнений пойдут вразнобой', () => {
    const rows = mk(50, 50)
    const idx = new Map(rows.map((r, i) => [r.id, i]))
    const got = composeBatch(rows).map(r => idx.get(r.id))
    expect(got).toEqual([...got].sort((a, b) => a - b))
  })

  it('размер подхода настраивается', () => {
    expect(composeBatch(mk(50, 50), 10, 4).length).toBe(10)
    expect(split(composeBatch(mk(50, 50), 10, 4))).toEqual([6, 4])
  })
})
