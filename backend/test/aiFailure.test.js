import { describe, it, expect } from 'vitest'
import { aiFailure } from '../src/services/aiFailure.js'

// Путь ошибки: попасть в него трудно (нужно, чтобы провайдер реально отказал),
// поэтому проверяем разбором настоящих ответов OpenAI, а не выдуманных.
// Базу тест не трогает и в сеть не ходит.

describe('aiFailure', () => {
  it('кончившийся баланс отличает от поломки фото', () => {
    const e = Object.assign(new Error('429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/...'),
      { status: 429, code: 'credit_balance_exhausted', type: 'insufficient_quota' })
    const r = aiFailure(e)
    expect(r.body.code).toBe('ai_quota')
    expect(r.status).toBe(503)
  })

  it('исчерпанный баланс НЕ выдаёт за перегрузку, хотя статус тоже 429', () => {
    // Самая вероятная ошибка в этом коде: проверить 429 раньше квоты и советовать
    // «подождите минуту» там, где ждать бесполезно — деньги сами не появятся.
    const e = Object.assign(new Error('insufficient_quota'), { status: 429 })
    expect(aiFailure(e).body.code).toBe('ai_quota')
  })

  it('перегрузку провайдера зовёт перегрузкой', () => {
    const e = Object.assign(new Error('Rate limit reached for gpt-4o'), { status: 429, code: 'rate_limit_exceeded' })
    expect(aiFailure(e).body.code).toBe('ai_busy')
  })

  it('всё прочее — «переснимите фото»', () => {
    expect(aiFailure(new Error('Unexpected token < in JSON')).body.code).toBe('ai_failed')
    expect(aiFailure(new Error('socket hang up')).body.code).toBe('ai_failed')
  })

  it('не падает на пустом и на строке вместо ошибки', () => {
    expect(aiFailure(undefined).body.code).toBe('ai_failed')
    expect(aiFailure(null).body.code).toBe('ai_failed')
    expect(aiFailure('что-то пошло не так').body.code).toBe('ai_failed')
  })

  it('у каждого ответа есть код и текст', () => {
    for (const e of [new Error('insufficient_quota'), new Error('rate limit'), new Error('прочее')]) {
      const r = aiFailure(e)
      expect(r.body.code).toBeTruthy()
      expect(r.body.error.length).toBeGreaterThan(10)
      expect([500, 503]).toContain(r.status)
    }
  })
})
