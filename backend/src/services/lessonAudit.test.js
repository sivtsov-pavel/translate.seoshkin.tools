import { describe, it, expect } from 'vitest'
import { checkExercise, checkWord, auditLesson } from './lessonAudit.js'

const ex = (o) => ({ id: 1, target_lang: 'de', ...o })
const levels = (list) => list.map(i => i.level)

describe('checkExercise — «Добавь букву»', () => {
  it('невыполнимая маска — блокер', () => {
    const r = checkExercise(ex({ type: 'letter_fill', payload: { masked: 'h___d__t', answer: 'hundert' } }))
    expect(levels(r)).toContain('blocker')
  })

  it('нормальная маска проходит', () => {
    expect(checkExercise(ex({ type: 'letter_fill', payload: { masked: 'hu__ert', answer: 'hundert' } }))).toHaveLength(0)
  })
})

describe('checkExercise — «Заполни пропуск»', () => {
  it('пропуска нет вовсе — блокер', () => {
    const r = checkExercise(ex({ type: 'fill_blank', payload: { sentence: 'Ich jogge jeden Morgen.', blank: 'jogge', options: ['jogge', 'gehe'] } }))
    expect(levels(r)).toContain('blocker')
  })

  it('два подчёркивания вместо трёх — замечание, не блокер: браузер чинит, печатный лист теряет', () => {
    const r = checkExercise(ex({ type: 'fill_blank', payload: { sentence: 'Ich __ jeden Morgen.', blank: 'jogge', options: ['jogge', 'gehe'] } }))
    expect(levels(r)).toContain('warn')
    expect(levels(r)).not.toContain('blocker')
  })

  it('верного ответа нет среди вариантов — блокер', () => {
    const r = checkExercise(ex({ type: 'fill_blank', payload: { sentence: 'Ich ___ hier.', blank: 'Ukraine', options: ['Ukraina', 'Spanien'] } }))
    expect(r[0].text).toContain('нет среди вариантов')
  })

  it('корректное упражнение проходит', () => {
    expect(checkExercise(ex({ type: 'fill_blank', payload: { sentence: 'Die ___ trinkt Milch.', blank: 'Katze', options: ['Katze', 'Maus'] } }))).toHaveLength(0)
  })
})

describe('checkExercise — выбор ответа', () => {
  it('индекс вне списка — блокер', () => {
    const r = checkExercise(ex({ type: 'multiple_choice', payload: { options: ['а', 'б'], correct: 5 } }))
    expect(levels(r)).toContain('blocker')
  })

  it('повтор вариантов — замечание, не блокер', () => {
    const r = checkExercise(ex({ type: 'multiple_choice', payload: { options: ['замок', 'замок', 'дверь'], correct: 0 } }))
    expect(levels(r)).toEqual(['warn'])
  })
})

describe('checkExercise — язык курса', () => {
  it('немецкое предложение в испанском курсе — блокер', () => {
    const r = checkExercise({ id: 2, type: 'fill_blank', target_lang: 'es',
      payload: { sentence: 'Die ___ ist klein.', blank: 'abeja', options: ['abeja', 'flor'] } })
    expect(levels(r)).toContain('blocker')
  })

  it('испанское предложение в испанском курсе проходит', () => {
    const r = checkExercise({ id: 3, type: 'fill_blank', target_lang: 'es',
      payload: { sentence: 'La ___ bebe leche.', blank: 'gata', options: ['gata', 'flor'] } })
    expect(r).toHaveLength(0)
  })
})

describe('checkWord — немецкая грамматика', () => {
  it('род по суффиксу -ung', () => {
    expect(checkWord({ id: 1, word_de: 'der Wohnung', target_lang: 'de' })[0].text).toContain('die')
  })

  it('правильные слова НЕ трогаем (тут была ошибка первой версии)', () => {
    for (const w of ['das Papier', 'der Kuchen', 'der Skorpion', 'die Sprachen', 'das Ei']) {
      expect(checkWord({ id: 1, word_de: w, target_lang: 'de' })).toHaveLength(0)
    }
  })

  it('существительное со строчной буквы', () => {
    expect(checkWord({ id: 1, word_de: 'die fressmaschine', target_lang: 'de' })[0].kind).toBe('заглавная')
  })

  it('прилагательное во фразе строчным быть может', () => {
    expect(checkWord({ id: 1, word_de: 'der beste Freund', target_lang: 'de' })).toHaveLength(0)
  })

  it('чужой язык не проверяем немецкими правилами', () => {
    expect(checkWord({ id: 1, word_de: 'la mesa', target_lang: 'es' })).toHaveLength(0)
  })
})

describe('auditLesson — сводка по уроку', () => {
  const words = [{ id: 10, word_de: 'der Tisch', target_lang: 'de' }]
  const full = ['flashcard', 'fill_blank', 'multiple_choice', 'sentence_write', 'letter_fill']

  it('урок без проблем', () => {
    const exercises = full.map((t, i) => ({
      id: i, type: t, word_id: 10, target_lang: 'de',
      payload: t === 'letter_fill' ? { masked: 'der Ti_ch', answer: 'der Tisch' }
        : t === 'fill_blank' ? { sentence: 'Der ___ ist neu.', blank: 'Tisch', options: ['Tisch', 'Stuhl'] }
        : t === 'multiple_choice' ? { options: ['стол', 'стул'], correct: 0 }
        : t === 'flashcard' ? { question: 'der Tisch', answer: 'стол' } : { example: 'Der Tisch ist neu.' },
    }))
    const r = auditLesson({ exercises, words })
    expect(r.ok).toBe(true)
    expect(r.summary).toBe('проблем не найдено')
  })

  it('слово без полного набора упражнений попадает в отчёт', () => {
    const r = auditLesson({ exercises: [{ id: 1, type: 'flashcard', word_id: 10, target_lang: 'de', payload: { question: 'a', answer: 'б' } }], words })
    expect(r.ok).toBe(false)
    expect(r.uncovered).toHaveLength(1)
  })

  it('пустой урок не ломает проверку', () => {
    expect(auditLesson({}).ok).toBe(true)
  })
})
