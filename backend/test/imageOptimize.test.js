import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { saveCourseCover } from '../src/services/imageOptimize.js'
import { config } from '../src/config.js'

// Минимальный валидный PNG 2×2 (красный), достаточно для sharp.
// Примечание: PNG из исходного брифа оказался с повреждённым потоком пиксельных
// данных (валидные заголовки, но libspng падает при декодировании) — заменён на
// сгенерированный через sharp({ create: ... }).png() эквивалент 2×2 красный.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVR4nGP4z8DwnwGM/zMwAAAf7gP9NRsAMwAAAABJRU5ErkJggg==',
  'base64'
)

describe('saveCourseCover', () => {
  it('сохраняет webp-обложку и возвращает URL с id курса', async () => {
    const url = await saveCourseCover(TINY_PNG, 999)
    expect(url).toBe('/uploads/course-covers/course_999.webp')

    const filepath = join(config.uploadDir, 'course-covers', 'course_999.webp')
    expect(existsSync(filepath)).toBe(true)

    // Проверяем что файл реально webp (магический байты RIFF....WEBP)
    const bytes = readFileSync(filepath)
    expect(bytes.slice(0, 4).toString('ascii')).toBe('RIFF')
    expect(bytes.slice(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('перезаписывает файл при повторном вызове с тем же courseId', async () => {
    await saveCourseCover(TINY_PNG, 998)
    const url = await saveCourseCover(TINY_PNG, 998)
    expect(url).toBe('/uploads/course-covers/course_998.webp')
  })
})
