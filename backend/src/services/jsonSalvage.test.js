import { describe, it, expect } from 'vitest'
import { salvageJsonObjects } from './jsonSalvage.js'

describe('salvageJsonObjects', () => {
  it('обычный массив разбирается целиком', () => {
    expect(salvageJsonObjects('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('битый элемент в СЕРЕДИНЕ теряется один, остальные доходят', () => {
    // Ровно этот случай ронял батч из сорока упражнений целиком
    const broken = '[{"type":"flashcard"},{"type":"fill_blank",,},{"type":"letter_fill"}]'
    expect(salvageJsonObjects(broken)).toEqual([{ type: 'flashcard' }, { type: 'letter_fill' }])
  })

  it('оборванный хвост не мешает начальным элементам', () => {
    expect(salvageJsonObjects('[{"a":1},{"a":2},{"a":')).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('мусор вокруг ответа игнорируется', () => {
    expect(salvageJsonObjects('Вот результат:\n```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }])
  })

  it('вложенные объекты не считаются отдельными элементами', () => {
    const r = salvageJsonObjects('[{"payload":{"blank":"x"},"type":"fill_blank"}]')
    expect(r).toEqual([{ payload: { blank: 'x' }, type: 'fill_blank' }])
  })

  it('скобки внутри строк не сбивают разбор', () => {
    const r = salvageJsonObjects('[{"sentence":"Er sagt: {beispiel} — ja!"}]')
    expect(r).toEqual([{ sentence: 'Er sagt: {beispiel} — ja!' }])
  })

  it('экранированная кавычка внутри строки', () => {
    expect(salvageJsonObjects('[{"q":"он сказал \\"привет\\""}]')).toEqual([{ q: 'он сказал "привет"' }])
  })

  it('пустой и мусорный вход — пустой список, без исключений', () => {
    expect(salvageJsonObjects('')).toEqual([])
    expect(salvageJsonObjects(null)).toEqual([])
    expect(salvageJsonObjects('просто текст без json')).toEqual([])
  })
})
