import { describe, it, expect } from 'vitest'
import { buildSections, chestProgress } from '../src/services/sections.js'

const node = (number, state, title = `Урок ${number}: Тема ${number}`) =>
  ({ lesson_id: 600 + number, number, title, title_translations: { en: `Lesson ${number}` }, state })

// 49 уроков: 37 пройдено, 38-й текущий, дальше заперто — настоящая раскладка Павла
const course = () => [
  ...Array.from({ length: 37 }, (_, i) => node(i + 1, 'done')),
  node(38, 'current'),
  ...Array.from({ length: 11 }, (_, i) => node(i + 39, 'locked')),
]

describe('buildSections', () => {
  it('режет курс на главы по десять уроков', () => {
    const s = buildSections(course())
    expect(s.length).toBe(5)
    expect(s.map(x => x.total)).toEqual([10, 10, 10, 10, 9])
    expect(s.map(x => [x.from, x.to])).toEqual([[1, 10], [11, 20], [21, 30], [31, 40], [41, 49]])
  })

  it('название и переводы берёт у первого урока раздела', () => {
    const s = buildSections(course())
    expect(s[3].title).toBe('Урок 31: Тема 31')
    expect(s[3].title_translations).toEqual({ en: 'Lesson 31' })
  })

  it('состояния: пройден, текущий, будущий', () => {
    const s = buildSections(course())
    expect(s.map(x => x.state)).toEqual(['done', 'done', 'done', 'current', 'future'])
    expect(s[3].done).toBe(7)   // уроки 31–37 пройдены, 38-й текущий
  })

  it('весь курс пройден — текущим становится последний непройденный, а его нет', () => {
    const s = buildSections(Array.from({ length: 20 }, (_, i) => node(i + 1, 'done')))
    expect(s.map(x => x.state)).toEqual(['done', 'done'])
  })

  it('текущего узла нет (всё заперто) — текущим объявляем первый непройденный', () => {
    const nodes = [...Array.from({ length: 10 }, (_, i) => node(i + 1, 'done')),
                   ...Array.from({ length: 10 }, (_, i) => node(i + 11, 'locked'))]
    const s = buildSections(nodes)
    expect(s.map(x => x.state)).toEqual(['done', 'current'])
  })

  it('раздел, пройденный целиком, остаётся пройденным даже если текущий узел позади', () => {
    // Дрип и пропуски такое допускают: урок 5 недоделан, а 11–20 закрыты целиком
    const nodes = [
      ...Array.from({ length: 4 }, (_, i) => node(i + 1, 'done')),
      node(5, 'current'),
      ...Array.from({ length: 5 }, (_, i) => node(i + 6, 'locked')),
      ...Array.from({ length: 10 }, (_, i) => node(i + 11, 'done')),
    ]
    const s = buildSections(nodes)
    expect(s[0].state).toBe('current')
    expect(s[1].state).toBe('done')
  })

  it('курс короче раздела — одна глава', () => {
    const s = buildSections([node(1, 'current'), node(2, 'locked')])
    expect(s.length).toBe(1)
    expect(s[0].total).toBe(2)
  })

  it('пусто на входе — пусто на выходе', () => {
    expect(buildSections([])).toEqual([])
    expect(buildSections(null)).toEqual([])
  })

  it('размер раздела настраивается', () => {
    expect(buildSections(course(), 25).length).toBe(2)
  })
})

describe('chestProgress', () => {
  it('считает, сколько уроков до конца текущего раздела', () => {
    const s = buildSections(course())
    expect(chestProgress(s)).toEqual({ left: 3, done: 7, total: 10 })
  })

  it('текущего раздела нет — сундука нет', () => {
    expect(chestProgress([])).toBeNull()
  })
})
