import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SentenceBuild from './SentenceBuild.jsx'
import { useI18nStore } from '../store/i18n.js'

// Озвучка и похвала лезут в SpeechSynthesis/Audio — в jsdom их нет и они тут не проверяются
vi.mock('../hooks/useSpeech.jsx', () => ({
  speak: vi.fn(),
  speakAuto: vi.fn(),
  uiLocale: () => 'ru-RU',
  targetLocale: () => 'de-DE',
  cancel: vi.fn(),
  // AvatarReaction ждёт onEnd, иначе реакция висит вечно
  speakWithEvents: vi.fn((text, lang, opts) => { opts?.onEnd?.() }),
}))
vi.mock('../utils/praise.js', () => ({ reactToAnswer: vi.fn() }))

const REF = 'Die Blume steht auf dem Tisch.'
const props = {
  payload: { word_de: 'die Blume' },
  task: 'Цветок стоит на столе.',
  reference: REF,
  translation: 'цветок',
}

// Слова банка перемешаны — собираем в порядке эталона, находя кнопку по тексту
const tapInOrder = (words) => words.forEach(w => fireEvent.click(screen.getByRole('button', { name: w })))

describe('SentenceBuild', () => {
  // В тестовой среде локаль определяется по браузеру и приезжает английская —
  // подписи проверяем на русской, как их видит Павел
  beforeEach(() => { vi.clearAllMocks(); useI18nStore.getState().setLang('ru') })

  it('показывает задание на языке ученика и все слова эталона', () => {
    render(<SentenceBuild {...props} onAnswer={vi.fn()} />)
    expect(screen.getByText('Цветок стоит на столе.')).toBeInTheDocument()
    for (const w of ['Die', 'Blume', 'steht', 'auf', 'dem', 'Tisch']) {
      expect(screen.getByRole('button', { name: w })).toBeInTheDocument()
    }
  })

  it('эталон целиком до ответа не показывает — иначе списывать', () => {
    render(<SentenceBuild {...props} onAnswer={vi.fn()} />)
    // «Tisch.» с точкой печатает только эталон: в банке слова без пунктуации
    expect(screen.queryByText('Tisch.')).not.toBeInTheDocument()
  })

  it('верно собранная фраза с первой попытки даёт оценку 5', () => {
    const onAnswer = vi.fn()
    render(<SentenceBuild {...props} onAnswer={onAnswer} />)
    tapInOrder(['Die', 'Blume', 'steht', 'auf', 'dem', 'Tisch'])
    fireEvent.click(screen.getByRole('button', { name: /Проверить/ }))
    fireEvent.click(screen.getByRole('button', { name: /Далее/ }))
    expect(onAnswer).toHaveBeenCalledWith(5, 'Die Blume steht auf dem Tisch')
  })

  it('со второй попытки — оценка 3, эталон показывается только после ответа', () => {
    const onAnswer = vi.fn()
    render(<SentenceBuild {...props} onAnswer={onAnswer} />)
    tapInOrder(['Blume', 'Die', 'steht', 'auf', 'dem', 'Tisch'])
    fireEvent.click(screen.getByRole('button', { name: /Проверить/ }))
    // Слова вернулись в банк — собираем заново, теперь верно
    tapInOrder(['Die', 'Blume', 'steht', 'auf', 'dem', 'Tisch'])
    fireEvent.click(screen.getByRole('button', { name: /Проверить/ }))
    fireEvent.click(screen.getByRole('button', { name: /Далее/ }))
    expect(onAnswer).toHaveBeenCalledWith(3, 'Die Blume steht auf dem Tisch')
  })

  it('две ошибки — показываем эталон и ставим 1, третьей попытки нет', () => {
    const onAnswer = vi.fn()
    render(<SentenceBuild {...props} onAnswer={onAnswer} />)
    for (let i = 0; i < 2; i++) {
      tapInOrder(['Blume', 'Die', 'steht', 'auf', 'dem', 'Tisch'])
      fireEvent.click(screen.getByRole('button', { name: /Проверить/ }))
    }
    // Эталон печатает TapText — каждое слово отдельным span-ом, целиком строку не найти
    expect(screen.getByText('Tisch.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Далее/ }))
    expect(onAnswer).toHaveBeenCalledWith(1, expect.any(String))
  })

  it('«Проверить» недоступна, пока использованы не все слова', () => {
    render(<SentenceBuild {...props} onAnswer={vi.fn()} />)
    tapInOrder(['Die', 'Blume'])
    expect(screen.getByRole('button', { name: /Проверить/ })).toBeDisabled()
  })

  it('слово из ответа возвращается в банк по нажатию', () => {
    render(<SentenceBuild {...props} onAnswer={vi.fn()} />)
    tapInOrder(['Die', 'Blume', 'steht', 'auf', 'dem', 'Tisch'])
    expect(screen.getByRole('button', { name: /Проверить/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tisch' }))
    expect(screen.getByRole('button', { name: /Проверить/ })).toBeDisabled()
  })

  it('«написать самому» уводит в свободный ввод', () => {
    const onManual = vi.fn()
    render(<SentenceBuild {...props} onAnswer={vi.fn()} onManual={onManual} />)
    fireEvent.click(screen.getByRole('button', { name: /Написать самому/ }))
    expect(onManual).toHaveBeenCalled()
  })
})
