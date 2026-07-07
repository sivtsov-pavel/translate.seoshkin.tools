import { describe, it, expect } from 'vitest'
import { sm2 } from '../src/services/srs.js'

describe('SM-2 алгоритм', () => {
  it('первое правильное повторение (quality=5): reps=1, interval=1', () => {
    const { newReps, newInterval, newEf } = sm2(5, 2.5, 0, 0)
    expect(newReps).toBe(1)
    expect(newInterval).toBe(1)
    expect(newEf).toBeGreaterThanOrEqual(2.5)
  })

  it('второе правильное повторение: interval=6', () => {
    const { newReps, newInterval } = sm2(5, 2.5, 1, 1)
    expect(newReps).toBe(2)
    expect(newInterval).toBe(6)
  })

  it('третье повторение: interval = round(prev * EF)', () => {
    const ef = 2.5
    const { newReps, newInterval } = sm2(4, ef, 6, 2)
    expect(newReps).toBe(3)
    expect(newInterval).toBe(Math.round(6 * (ef + (0.1 - 1 * (0.08 + 1 * 0.02)))))
  })

  it('неверный ответ (quality < 3): сброс reps и interval', () => {
    const { newReps, newInterval } = sm2(1, 2.5, 6, 3)
    expect(newReps).toBe(0)
    expect(newInterval).toBe(1)
  })

  it('EF не опускается ниже 1.3', () => {
    const { newEf } = sm2(0, 1.3, 0, 0)
    expect(newEf).toBeGreaterThanOrEqual(1.3)
  })
})
