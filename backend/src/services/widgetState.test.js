// Состояния виджета. Виджет висит на домашнем экране и показывает число без объяснений —
// поэтому каждое состояние проверяем тестом: ошибка здесь выглядит как «приложение врёт».
import { describe, it, expect } from 'vitest'
import { resolveWidgetState, isLessonPassed, sumRequired, WIDGET_STATES } from './widgetState.js'

// Урок с заданным прогрессом по обязательным типам
const lesson = (id, number, courseId, fcDone, fcTotal, mcDone, mcTotal) => ({
  id, number, course_id: courseId, title: `Урок ${number}`, title_translations: {},
  required: {
    flashcard:       { done: fcDone, total: fcTotal },
    multiple_choice: { done: mcDone, total: mcTotal },
  },
})

const РАСПИСАНИЕ = new Map([[7, { start_date: '2026-08-03', weekdays: [1, 3, 5] }]])

describe('sumRequired', () => {
  it('складывает оба обязательных типа в одно число', () => {
    expect(sumRequired({ flashcard: { done: 20, total: 20 }, multiple_choice: { done: 14, total: 20 } }))
      .toEqual({ done: 34, total: 40 })
  })
})

describe('isLessonPassed', () => {
  it('пройден, когда оба типа закрыты полностью', () => {
    expect(isLessonPassed(lesson(1, 1, 7, 20, 20, 20, 20))).toBe(true)
  })

  it('не пройден, пока один тип не добит', () => {
    expect(isLessonPassed(lesson(1, 1, 7, 20, 20, 19, 20))).toBe(false)
  })

  it('РЕГРЕССИЯ: урок без обязательных типов не считается пройденным', () => {
    // Урок 19 из бага 22.08.2026: только диктант и речь. Такой урок не должен
    // ни держать цепочку, ни показываться виджетом как «пройден».
    expect(isLessonPassed(lesson(1, 1, 7, 0, 0, 0, 0))).toBe(false)
  })
})

describe('resolveWidgetState', () => {
  it('идёт урок — показывает текущий и его прогресс', () => {
    const lessons = [lesson(101, 1, 7, 20, 20, 20, 20), lesson(102, 2, 7, 20, 20, 14, 20)]
    const r = resolveWidgetState({
      lessons, passed: new Set([101]), playable: new Set([101, 102]),
    })
    expect(r.state).toBe(WIDGET_STATES.IN_PROGRESS)
    expect(r.lesson.id).toBe(102)
    expect(r.required).toEqual({ done: 34, total: 40 })
    expect(r.byType.multiple_choice).toEqual({ done: 14, total: 20 })
  })

  it('текущий — первый непройденный, а не первый начатый', () => {
    const lessons = [lesson(101, 1, 7, 20, 20, 20, 20), lesson(102, 2, 7, 0, 20, 0, 20)]
    const r = resolveWidgetState({ lessons, passed: new Set([101]), playable: new Set([101, 102]) })
    expect(r.lesson.id).toBe(102)
    expect(r.required).toEqual({ done: 0, total: 40 })
  })

  it('урок пройден, следующий закрыт календарём — отдаёт дату открытия', () => {
    // Расписание: пн/ср/пт от 03.08.2026 (понедельник). Второй урок курса — среда 05.08.
    const lessons = [lesson(101, 1, 7, 20, 20, 20, 20), lesson(102, 2, 7, 0, 20, 0, 20)]
    const r = resolveWidgetState({
      lessons, passed: new Set([101]), playable: new Set([101]),
      schedules: РАСПИСАНИЕ,
    })
    expect(r.state).toBe(WIDGET_STATES.WAITING_CALENDAR)
    expect(r.nextUnlockDate).toBe('2026-08-05')
  })

  it('курс без расписания — отдельное состояние, а не «всё сделано»', () => {
    const lessons = [lesson(101, 1, 7, 0, 20, 0, 20)]
    const r = resolveWidgetState({
      lessons, passed: new Set(), playable: new Set(), needsSchedule: [7],
    })
    expect(r.state).toBe(WIDGET_STATES.NO_SCHEDULE)
    expect(r.courseId).toBe(7)
  })

  it('все уроки пройдены', () => {
    const lessons = [lesson(101, 1, 7, 20, 20, 20, 20)]
    const r = resolveWidgetState({ lessons, passed: new Set([101]), playable: new Set([101]) })
    expect(r.state).toBe(WIDGET_STATES.ALL_DONE)
    expect(r.lesson).toBe(null)
  })

  it('материалов нет вовсе', () => {
    expect(resolveWidgetState({ lessons: [], passed: new Set(), playable: null }).state)
      .toBe(WIDGET_STATES.NO_LESSONS)
  })

  it('у учителя дрипа нет — доступен любой непройденный урок', () => {
    const lessons = [lesson(101, 1, 7, 20, 20, 20, 20), lesson(102, 2, 7, 0, 20, 0, 20)]
    const r = resolveWidgetState({ lessons, passed: new Set([101]), playable: null })
    expect(r.state).toBe(WIDGET_STATES.IN_PROGRESS)
    expect(r.lesson.id).toBe(102)
  })

  it('дыра в цепочке: показывает первый непройденный из доступных', () => {
    // Пройдены 1 и 3, второй пропущен и остался доступен — виджет ведёт именно в него.
    const lessons = [
      lesson(101, 1, 7, 20, 20, 20, 20),
      lesson(102, 2, 7, 5, 20, 0, 20),
      lesson(103, 3, 7, 20, 20, 20, 20),
    ]
    const r = resolveWidgetState({
      lessons, passed: new Set([101, 103]), playable: new Set([101, 102, 103]),
    })
    expect(r.lesson.id).toBe(102)
    expect(r.required).toEqual({ done: 5, total: 40 })
  })
})
