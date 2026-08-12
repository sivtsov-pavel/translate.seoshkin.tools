import { describe, it, expect } from 'vitest'
import { summarizePhraseProgress, isPhraseDone } from './phraseProgress.js'

describe('прогресс по набору фраз', () => {
  it('фраза пройдена, когда закрыты слушаю и собираю (говорю необязателен)', () => {
    expect(isPhraseDone({ step_listen: true, step_build: true, step_speak: false })).toBe(true)
    expect(isPhraseDone({ step_listen: true, step_build: true, step_speak: true })).toBe(true)
  })

  it('одного шага мало', () => {
    expect(isPhraseDone({ step_listen: true, step_build: false, step_speak: true })).toBe(false)
    expect(isPhraseDone({ step_listen: false, step_build: true, step_speak: true })).toBe(false)
  })

  it('нетронутая фраза не пройдена', () => {
    expect(isPhraseDone(null)).toBe(false)
    expect(isPhraseDone({})).toBe(false)
    expect(isPhraseDone({ step_listen: null, step_build: null, step_speak: null })).toBe(false)
  })

  it('считает пройденные по набору', () => {
    const rows = [
      { id: 1, step_listen: true, step_build: true,  step_speak: true },
      { id: 2, step_listen: true, step_build: false, step_speak: false },
      { id: 3, step_listen: null, step_build: null,  step_speak: null },
    ]
    expect(summarizePhraseProgress(rows)).toEqual({ total: 3, done: 1 })
  })

  it('пустой набор не ломает счётчик', () => {
    expect(summarizePhraseProgress([])).toEqual({ total: 0, done: 0 })
    expect(summarizePhraseProgress(undefined)).toEqual({ total: 0, done: 0 })
  })
})
