import { describe, it, expect } from 'vitest'
import { pickNewExerciseIds } from './newExercises.js'

const D = (s) => new Date(s)

describe('какие нетронутые упражнения пройденного урока считать новыми', () => {
  it('упражнение создано позже того, что ученик трогал → новое', () => {
    const rows = [{ id: 501, created_at: D('2026-08-12T14:54:00Z'), last_touched_at: D('2026-07-30T10:00:00Z') }]
    expect(pickNewExerciseIds(rows)).toEqual([501])
  })

  it('упражнение старше тронутых → не новое, остаётся скрытым', () => {
    const rows = [{ id: 502, created_at: D('2026-07-01T10:00:00Z'), last_touched_at: D('2026-07-30T10:00:00Z') }]
    expect(pickNewExerciseIds(rows)).toEqual([])
  })

  it('ответ на старое упражнение сегодня НЕ прячет новое обратно', () => {
    // Ученик сегодня прошёл старые упражнения урока, но их created_at всё равно старый —
    // ориентир не сдвигается, и склонение, созданное 12.08, остаётся видимым.
    const rows = [
      { id: 503, created_at: D('2026-08-12T14:54:00Z'), last_touched_at: D('2026-06-15T09:00:00Z') },
      { id: 504, created_at: D('2026-06-10T09:00:00Z'), last_touched_at: D('2026-06-15T09:00:00Z') },
    ]
    expect(pickNewExerciseIds(rows)).toEqual([503])
  })

  it('одинаковое время не считается новым — граница строгая', () => {
    const rows = [{ id: 505, created_at: D('2026-08-01T12:00:00Z'), last_touched_at: D('2026-08-01T12:00:00Z') }]
    expect(pickNewExerciseIds(rows)).toEqual([])
  })

  it('урок без единого тронутого упражнения сюда не попадает', () => {
    const rows = [{ id: 506, created_at: D('2026-08-12T14:54:00Z'), last_touched_at: null }]
    expect(pickNewExerciseIds(rows)).toEqual([])
  })

  it('пустой вход — пустой выход, без падения', () => {
    expect(pickNewExerciseIds([])).toEqual([])
    expect(pickNewExerciseIds(undefined)).toEqual([])
  })
})
