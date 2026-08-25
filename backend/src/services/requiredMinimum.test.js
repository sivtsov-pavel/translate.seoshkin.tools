// Обязательный минимум урока: гейт и счётчик виджета обязаны говорить одно и то же.
//
// LESSON_PASSED_HAVING теперь собирается из списка REQUIRED_TYPES, а не написан руками.
// Рефакторинг ради виджета не имеет права изменить правило открытия уроков — поэтому
// сгенерированный SQL сверяется здесь с эталонным текстом, работавшим до правки.
// Меняется REQUIRED_TYPES — тест обязан упасть, чтобы решение было осознанным.
import { describe, it, expect } from 'vitest'
import { REQUIRED_TYPES, LESSON_PASSED_HAVING, REQUIRED_PROGRESS_SELECT } from './drip.js'

// Дословно то, что стояло в drip.js до вынесения списка типов (25.08.2026).
const ЭТАЛОН = `count(DISTINCT e.word_id) FILTER (WHERE e.type IN ('flashcard', 'multiple_choice')) > 0
  AND count(DISTINCT e.word_id) FILTER (WHERE e.type = 'flashcard' AND uep.exercise_id IS NOT NULL)
    = count(DISTINCT e.word_id) FILTER (WHERE e.type = 'flashcard')
  AND count(DISTINCT e.word_id) FILTER (WHERE e.type = 'multiple_choice' AND uep.exercise_id IS NOT NULL)
    = count(DISTINCT e.word_id) FILTER (WHERE e.type = 'multiple_choice')`

describe('обязательный минимум урока', () => {
  it('минимум — карточка и «выбери ответ», ничего больше', () => {
    expect(REQUIRED_TYPES).toEqual(['flashcard', 'multiple_choice'])
  })

  it('РЕГРЕССИЯ: сгенерированный гейт совпадает с прежним SQL дословно', () => {
    expect(LESSON_PASSED_HAVING).toBe(ЭТАЛОН)
  })

  it('счётчик виджета считает по тем же типам, что и гейт', () => {
    for (const type of REQUIRED_TYPES) {
      expect(REQUIRED_PROGRESS_SELECT).toContain(`${type}_total`)
      expect(REQUIRED_PROGRESS_SELECT).toContain(`${type}_done`)
    }
  })

  it('счётчик виджета считает по прогрессу, а не по попыткам', () => {
    // user_exercise_progress — та же таблица, по которой открывается урок.
    // exercise_attempts (все попытки, включая повторные) дала бы другое число.
    expect(REQUIRED_PROGRESS_SELECT).toContain('uep.exercise_id IS NOT NULL')
    expect(REQUIRED_PROGRESS_SELECT).not.toContain('attempt')
  })

  it('счётчик виджета считает уникальные слова, а не упражнения', () => {
    expect(REQUIRED_PROGRESS_SELECT).not.toContain('count(e.id)')
    expect(REQUIRED_PROGRESS_SELECT).toContain('count(DISTINCT e.word_id)')
  })
})
