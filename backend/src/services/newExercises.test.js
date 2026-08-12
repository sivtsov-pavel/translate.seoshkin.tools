import { describe, it, expect } from 'vitest'
import { lessonsToHideUntouched } from './newExercises.js'

const D = (s) => new Date(s)

describe('какие пройденные уроки прятать целиком', () => {
  it('прячет урок, где после прохождения ничего не появилось', () => {
    const rows = [{ lesson_id: 10, last_attempt_at: D('2026-08-01'), newest_exercise_at: D('2026-07-20') }]
    expect(lessonsToHideUntouched(rows)).toEqual([10])
  })

  it('НЕ прячет урок, в котором появились упражнения после последней попытки', () => {
    const rows = [{ lesson_id: 11, last_attempt_at: D('2026-08-01'), newest_exercise_at: D('2026-08-12') }]
    expect(lessonsToHideUntouched(rows)).toEqual([])
  })

  it('урок без единой попытки не прячет — там всё новое', () => {
    const rows = [{ lesson_id: 12, last_attempt_at: null, newest_exercise_at: D('2026-07-01') }]
    expect(lessonsToHideUntouched(rows)).toEqual([])
  })

  it('урок без упражнений прячет — показывать нечего', () => {
    const rows = [{ lesson_id: 13, last_attempt_at: D('2026-08-01'), newest_exercise_at: null }]
    expect(lessonsToHideUntouched(rows)).toEqual([13])
  })

  it('разбирает смесь уроков', () => {
    const rows = [
      { lesson_id: 1, last_attempt_at: D('2026-08-10'), newest_exercise_at: D('2026-08-12') }, // новое → показать
      { lesson_id: 2, last_attempt_at: D('2026-08-10'), newest_exercise_at: D('2026-08-09') }, // старое → спрятать
      { lesson_id: 3, last_attempt_at: D('2026-08-10'), newest_exercise_at: D('2026-08-10') }, // ровно то же → спрятать
    ]
    expect(lessonsToHideUntouched(rows)).toEqual([2, 3])
  })

  it('пустой вход — пустой выход, без падения', () => {
    expect(lessonsToHideUntouched([])).toEqual([])
    expect(lessonsToHideUntouched(undefined)).toEqual([])
  })
})
