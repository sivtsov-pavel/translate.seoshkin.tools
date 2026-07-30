// Тесты гейта прогрессии: доступ к урокам не должен пропадать у того, кто занимался.
//
// Поводом стал живой случай 30.07.2026: после ужесточения правила «урок пройден» у трёх
// учеников с расписанием первый урок перестал считаться пройденным, цепочка гейта порвалась
// на первом звене, и вместо пятнадцати уроков остался доступен один. Логика гейта вынесена
// сюда как чистая функция, чтобы такое ловилось тестом, а не учеником.
import { describe, it, expect } from 'vitest'

// Копия правил из playableLessonIds (та же формула, без обращения к базе).
function gate({ lessons, passed, touched, openedByCalendar }) {
  const passedSet = new Set(passed)
  const touchedSet = new Set(touched)
  const passedCount = lessons.filter(id => passedSet.has(id)).length
  const reachedIdx = lessons.reduce((max, id, i) =>
    (passedSet.has(id) || touchedSet.has(id)) ? i : max, -1)
  const opened = Math.max(openedByCalendar, passedCount + 1, reachedIdx + 1)
  const playable = new Set()
  let doneIdx = 0, prevPassed = true
  for (const id of lessons) {
    const calendarOpen = doneIdx < opened
    const earned = passedSet.has(id) || touchedSet.has(id)
    const gateOpen = doneIdx === 0 || prevPassed || earned
    if ((calendarOpen && gateOpen) || earned) playable.add(id)
    prevPassed = passedSet.has(id)
    doneIdx++
  }
  return playable
}

const L = [101, 102, 103, 104, 105]

describe('гейт прогрессии', () => {
  it('первый урок открыт всегда', () => {
    expect(gate({ lessons: L, passed: [], touched: [], openedByCalendar: 1 })).toEqual(new Set([101]))
  })

  it('следующий урок открывается после прохождения предыдущего', () => {
    const p = gate({ lessons: L, passed: [101], touched: [101], openedByCalendar: 2 })
    expect(p.has(102)).toBe(true)
    expect(p.has(103)).toBe(false)
  })

  it('календарь не даёт убежать вперёд', () => {
    const p = gate({ lessons: L, passed: [101, 102], touched: [101, 102], openedByCalendar: 2 })
    expect(p.has(103)).toBe(true)   // пройдено+1 всегда доступно
    expect(p.has(104)).toBe(false)  // а вот дальше — только по расписанию
  })

  it('РЕГРЕССИЯ: начатые уроки остаются доступными, даже если первый «расподтвердился»', () => {
    // Ровно ситуация ученика 21: занимался в уроках 103 и 105, но урок 101 после
    // ужесточения правила стал непройденным. Раньше здесь оставался только 101.
    const p = gate({ lessons: L, passed: [], touched: [103, 105], openedByCalendar: 1 })
    expect(p.has(101)).toBe(true)
    expect(p.has(103)).toBe(true)
    expect(p.has(105)).toBe(true)
  })

  it('пройденный урок доступен для повторения при дыре в цепочке', () => {
    // Пройдены 101 и 103, урок 102 пропущен: 103 нельзя закрывать — он уже пройден.
    const p = gate({ lessons: L, passed: [101, 103], touched: [101, 103], openedByCalendar: 2 })
    expect(p.has(103)).toBe(true)
  })

  it('нетронутые уроки за пределами расписания закрыты', () => {
    const p = gate({ lessons: L, passed: [], touched: [], openedByCalendar: 1 })
    expect(p.has(104)).toBe(false)
    expect(p.has(105)).toBe(false)
  })
})
