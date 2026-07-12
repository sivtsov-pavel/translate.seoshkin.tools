import { describe, it, expect } from 'vitest'
import { mergeMemory, topMistakes, buildReport } from './aiTrainerMemory.js'

const fixedNow = () => '2026-07-12T00:00:00.000Z'

describe('mergeMemory', () => {
  it('на первой сессии создаёт память из обновления', () => {
    const res = mergeMemory(null, {
      summary_text: 'Учень Іван з Берліна',
      known_facts: { имя: 'Иван', город: 'Берлин' },
      recurring_mistakes: [{ type: 'артикли', example: 'der Haus' }],
      topics_covered: [{ topic: 'знакомство' }],
    }, fixedNow)

    expect(res.summary_text).toBe('Учень Іван з Берліна')
    expect(res.known_facts).toEqual({ имя: 'Иван', город: 'Берлин' })
    expect(res.recurring_mistakes).toHaveLength(1)
    expect(res.recurring_mistakes[0]).toMatchObject({ type: 'артикли', times_seen: 1, last_seen_at: fixedNow() })
    expect(res.topics_covered).toHaveLength(1)
  })

  it('повторная ошибка того же типа увеличивает times_seen, а не дублируется', () => {
    const existing = {
      summary_text: 'старое',
      known_facts: { имя: 'Иван' },
      recurring_mistakes: [{ type: 'артикли', example: 'der Haus', times_seen: 2, last_seen_at: 'старое' }],
      topics_covered: [{ topic: 'кафе' }],
    }
    const res = mergeMemory(existing, {
      summary_text: 'новое',
      known_facts: { город: 'Мюнхен' },
      recurring_mistakes: [{ type: 'артикли', example: 'die Buch' }],
      topics_covered: [{ topic: 'покупки' }],
    }, fixedNow)

    // Одна запись про артикли, times_seen выросло с 2 до 3
    const artikli = res.recurring_mistakes.filter(m => m.type === 'артикли')
    expect(artikli).toHaveLength(1)
    expect(artikli[0].times_seen).toBe(3)
    expect(artikli[0].last_seen_at).toBe(fixedNow())
    // Факты слиты
    expect(res.known_facts).toEqual({ имя: 'Иван', город: 'Мюнхен' })
    // Темы накоплены
    expect(res.topics_covered).toHaveLength(2)
    // Новая выжимка перекрывает старую
    expect(res.summary_text).toBe('новое')
  })

  it('новая ошибка другого типа добавляется отдельно', () => {
    const existing = { recurring_mistakes: [{ type: 'артикли', times_seen: 1 }] }
    const res = mergeMemory(existing, { recurring_mistakes: [{ type: 'порядок слов' }] }, fixedNow)
    expect(res.recurring_mistakes.map(m => m.type).sort()).toEqual(['артикли', 'порядок слов'])
  })

  it('пустой summary в обновлении не затирает существующий', () => {
    const res = mergeMemory({ summary_text: 'важное' }, { summary_text: '' }, fixedNow)
    expect(res.summary_text).toBe('важное')
  })
})

describe('topMistakes', () => {
  it('возвращает топ-N по частоте', () => {
    const list = [
      { type: 'a', times_seen: 1 },
      { type: 'b', times_seen: 5 },
      { type: 'c', times_seen: 3 },
    ]
    expect(topMistakes(list, 2).map(m => m.type)).toEqual(['b', 'c'])
  })
})

describe('buildReport', () => {
  it('считает реплики и собирает ошибки с коррекцией', () => {
    const messages = [
      { role: 'trainer', text: 'Hallo!' },
      { role: 'user', text: 'Ich bin gut', correction: 'Mir geht es gut' },
      { role: 'trainer', text: 'Schön!' },
      { role: 'user', text: 'Ja', correction: null },
      { role: 'user', text: 'Tschüss', correction: 'null' },
    ]
    const rep = buildReport(messages)
    expect(rep.message_count).toBe(5)
    expect(rep.user_message_count).toBe(3)
    expect(rep.mistakes_count).toBe(1)
    expect(rep.mistakes[0]).toEqual({ original: 'Ich bin gut', correction: 'Mir geht es gut' })
  })

  it('пустой ввод не падает', () => {
    expect(buildReport()).toMatchObject({ message_count: 0, mistakes_count: 0 })
  })
})
