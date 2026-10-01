import { describe, it, expect } from 'vitest'
import { roadPath, layoutNodes, splitRoadBySections, OFFSETS } from '../src/pages/path/road.js'

describe('roadPath', () => {
  it('пустой список — пустая строка', () => {
    expect(roadPath([])).toBe('')
  })

  it('одна точка — только перенос пера, без кривых', () => {
    expect(roadPath([[10, 20]])).toBe('M 10 20')
  })

  it('на каждую пару точек приходится одна кубическая кривая', () => {
    const d = roadPath([[0, 0], [10, 100], [20, 200], [30, 300]])
    expect(d.match(/C /g)).toHaveLength(3)
    expect(d.startsWith('M 0 0')).toBe(true)
  })

  it('кривая проходит ЧЕРЕЗ сами точки, а не мимо', () => {
    // Узлы стоят на дороге, и линия обязана входить в их центры: иначе дорога идёт рядом
    // с кружками, и карта читается как схема, а не как путь.
    const d = roadPath([[0, 0], [10, 100], [20, 200]])
    expect(d).toContain('10 100')
    expect(d).toContain('20 200')
  })
})

describe('layoutNodes', () => {
  const lessons = (n, currentAt = -1) =>
    Array.from({ length: n }, (_, i) => ({ state: i === currentAt ? 'current' : 'done' }))

  it('узлы идут сверху вниз с заданным шагом', () => {
    const p = layoutNodes(lessons(3), { centerX: 300, startY: 60, step: 118 })
    expect(p.map(x => x.y)).toEqual([60, 178, 296])
  })

  it('после текущего узла дорога расступается под карточку', () => {
    const p = layoutNodes(lessons(3, 1), { centerX: 300, startY: 0, step: 100, afterCurrent: 90 })
    expect(p[1].y).toBe(100)
    expect(p[2].y).toBe(290)   // 100 + 100 + 90
  })

  it('текущий узел встаёт слева — справа от него раскрывается карточка', () => {
    for (const at of [0, 1, 4, 7, 12]) {
      const p = layoutNodes(lessons(15, at), { centerX: 300, startY: 0 })
      expect(p[at].x, `текущий на позиции ${at}`).toBe(300 - 170)
    }
  })

  it('масштаб сжимает смещения, не трогая шаг', () => {
    const p = layoutNodes(lessons(2), { centerX: 300, startY: 0, step: 100, scale: 0.5 })
    expect(p[0].x).toBe(300 + OFFSETS[0] * 0.5)
    expect(p[1].y).toBe(100)
  })

  it('контрольной добавляем воздух сверху', () => {
    const items = [{ state: 'done' }, { state: 'open', type: 'exam' }]
    const p = layoutNodes(items, { centerX: 300, startY: 0, step: 100 })
    expect(p[1].y).toBe(120)   // 0 + 100 + 20
  })

  it('пустой раздел — пустая раскладка', () => {
    expect(layoutNodes([], { centerX: 300, startY: 0 })).toEqual([])
  })
})

describe('splitRoadBySections', () => {
  const sections = [
    { lesson_ids: [1, 2, 3] },
    { lesson_ids: [4, 5, 6] },
  ]

  it('раскладывает уроки по их разделам', () => {
    const road = [
      { kind: 'lesson', lesson_id: 1 }, { kind: 'lesson', lesson_id: 2 },
      { kind: 'lesson', lesson_id: 5 },
    ]
    const b = splitRoadBySections(road, sections)
    expect(b[0].map(x => x.lesson_id)).toEqual([1, 2])
    expect(b[1].map(x => x.lesson_id)).toEqual([5])
  })

  it('станцию относит к разделу её урока', () => {
    const road = [{ kind: 'checkpoint', type: 'speech', lesson_id: 4 }]
    expect(splitRoadBySections(road, sections)[1]).toHaveLength(1)
  })

  it('грамматическую станцию — по первому из её уроков', () => {
    const road = [{ kind: 'checkpoint', type: 'grammar', lesson_ids: [2, 3, 4] }]
    expect(splitRoadBySections(road, sections)[0]).toHaveLength(1)
  })

  it('узел неизвестного урока не теряется — уходит в последний раздел', () => {
    // У ученика при дрипе такое бывает: потерять узел хуже, чем показать его чуть не там
    const b = splitRoadBySections([{ kind: 'lesson', lesson_id: 99 }], sections)
    expect(b[1]).toHaveLength(1)
  })

  it('порядок внутри раздела сохраняется', () => {
    const road = [1, 3, 2].map(id => ({ kind: 'lesson', lesson_id: id }))
    expect(splitRoadBySections(road, sections)[0].map(x => x.lesson_id)).toEqual([1, 3, 2])
  })

  it('разделов нет — пусто', () => {
    expect(splitRoadBySections([{ lesson_id: 1 }], [])).toEqual([])
  })
})
