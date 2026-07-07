import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'

// Мокируем внешние API — не тратим деньги в тестах
vi.mock('../src/services/claude.js', () => ({
  extractFromPhoto: vi.fn().mockResolvedValue({
    words: [{ word_de: 'Hallo', translation_ru: 'Привет', example_sentence: 'Hallo, wie geht es dir?' }],
    grammar_points: [{ description: 'Приветствие', example: 'Hallo!' }],
    example_sentences: ['Hallo, wie geht es dir?'],
    raw_text: 'Hallo = Привет',
  }),
  mergeLesson: vi.fn().mockResolvedValue({
    words: [{ word_de: 'Hallo', translation_ru: 'Привет', example_sentence: 'Hallo, wie geht es dir?' }],
    grammar_points: [{ description: 'Приветствие', example: 'Hallo!' }],
  }),
  generateExercises: vi.fn().mockResolvedValue([
    { type: 'flashcard', word_de: 'Hallo', payload: { question: 'Hallo', answer: 'Привет' } },
    { type: 'fill_blank', word_de: 'Hallo', payload: { sentence: '___, wie geht es dir?', blank: 'Hallo', options: [] } },
    { type: 'multiple_choice', word_de: 'Hallo', payload: { question: 'Переведи: Hallo', options: ['Привет', 'Пока', 'Спасибо', 'Да'], correct: 0 } },
  ]),
}))

vi.mock('../src/services/whisper.js', () => ({
  transcribeAudio: vi.fn().mockResolvedValue('Heute lernen wir Begrüßungen.'),
}))

let app, ownerToken, ownerId

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await clearTestData()
  const auth = await registerAndLogin(app, 'owner')
  ownerToken = auth.token
  ownerId = auth.user.id
})

it('обрабатывает урок: создаёт слова и упражнения в БД', async () => {
  // Создаём урок
  const lessonRes = await app.inject({
    method: 'POST',
    url: '/api/lessons',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { title: 'Урок 1: Приветствия' },
  })
  const lesson = JSON.parse(lessonRes.body)

  // Добавляем медиафайл напрямую (имитируем загрузку)
  const { db } = await import('../src/db/index.js')
  await db.query(
    'INSERT INTO lesson_media (lesson_id, type, file_path) VALUES ($1, $2, $3)',
    [lesson.id, 'photo', 'test_photo.jpg']
  )

  // Запускаем обработку
  const res = await app.inject({
    method: 'POST',
    url: `/api/lessons/${lesson.id}/process`,
    headers: { authorization: `Bearer ${ownerToken}` },
  })

  expect(res.statusCode).toBe(200)
  const result = JSON.parse(res.body)
  expect(result.wordsCount).toBe(1)
  expect(result.exercisesCount).toBe(3)

  // Проверяем что слова сохранились
  const { rows: words } = await db.query('SELECT * FROM words WHERE user_id = $1', [ownerId])
  expect(words).toHaveLength(1)
  expect(words[0].word_de).toBe('Hallo')

  // Проверяем что упражнения сохранились
  const { rows: exercises } = await db.query('SELECT * FROM exercises WHERE lesson_id = $1', [lesson.id])
  expect(exercises).toHaveLength(3)
})
