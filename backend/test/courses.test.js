import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'
import { config } from '../src/config.js'

let app, ownerToken, studentToken

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await clearTestData()
  ownerToken = (await registerAndLogin(app, 'owner')).token
  studentToken = (await registerAndLogin(app, 'student')).token
})

// Минимальный валидный PNG 2×2 (красный), сгенерирован через sharp({create:...}).png()
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVR4nGP4z8DwnwGM/zMwAAAf7gP9NRsAMwAAAABJRU5ErkJggg==',
  'base64'
)

function multipartPayload(fileBuffer, filename = 'cover.png', mimetype = 'image/png') {
  const boundary = '----vitestBoundary123'
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function createCourse(token) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: { authorization: `Bearer ${token}` },
    payload: { title: 'Курс для теста' },
  })
  return JSON.parse(res.body)
}

describe('POST /api/courses/:id/cover', () => {
  it('owner загружает обложку — курс получает cover_image_url', async () => {
    const course = await createCourse(ownerToken)
    const { payload, contentType } = multipartPayload(TINY_PNG)

    const res = await app.inject({
      method: 'POST',
      url: `/api/courses/${course.id}/cover`,
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentType },
      payload,
    })

    expect(res.statusCode).toBe(200)
    const updated = JSON.parse(res.body)
    expect(updated.cover_image_url).toBe(`/uploads/course-covers/course_${course.id}.webp`)
  })

  it('403 для student', async () => {
    const course = await createCourse(ownerToken)
    const { payload, contentType } = multipartPayload(TINY_PNG)

    const res = await app.inject({
      method: 'POST',
      url: `/api/courses/${course.id}/cover`,
      headers: { authorization: `Bearer ${studentToken}`, 'content-type': contentType },
      payload,
    })

    expect(res.statusCode).toBe(403)
  })

  it('404 для несуществующего курса', async () => {
    const { payload, contentType } = multipartPayload(TINY_PNG)

    const res = await app.inject({
      method: 'POST',
      url: '/api/courses/999999/cover',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentType },
      payload,
    })

    expect(res.statusCode).toBe(404)
  })

  it('404 для чужого курса — обложка владельца A не подменяется владельцем B, файл не пишется на диск', async () => {
    const course = await createCourse(ownerToken)
    const otherOwner = await registerAndLogin(app, 'owner')
    const { payload, contentType } = multipartPayload(TINY_PNG)

    // Из-за RESTART IDENTITY id курса в тестах повторяется (напр. 1) — снимаем
    // возможный «хвостовой» файл от предыдущего теста, чтобы проверка existsSync
    // ниже реально доказывала отсутствие записи, а не совпадение по имени файла.
    const coverPath = join(config.uploadDir, 'course-covers', `course_${course.id}.webp`)
    rmSync(coverPath, { force: true })

    const res = await app.inject({
      method: 'POST',
      url: `/api/courses/${course.id}/cover`,
      headers: { authorization: `Bearer ${otherOwner.token}`, 'content-type': contentType },
      payload,
    })
    expect(res.statusCode).toBe(404)

    const list = await app.inject({
      method: 'GET',
      url: '/api/courses',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    const found = JSON.parse(list.body).find(c => c.id === course.id)
    expect(found.cover_image_url).toBeNull()
    expect(existsSync(coverPath)).toBe(false)
  })
})

describe('DELETE /api/courses/:id/cover', () => {
  it('owner убирает обложку — cover_image_url становится null', async () => {
    const course = await createCourse(ownerToken)
    const { payload, contentType } = multipartPayload(TINY_PNG)
    await app.inject({
      method: 'POST',
      url: `/api/courses/${course.id}/cover`,
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentType },
      payload,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/courses/${course.id}/cover`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(204)

    const list = await app.inject({
      method: 'GET',
      url: '/api/courses',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    const found = JSON.parse(list.body).find(c => c.id === course.id)
    expect(found.cover_image_url).toBeNull()
  })

  it('404 для чужого курса', async () => {
    const course = await createCourse(ownerToken)
    const otherOwner = await registerAndLogin(app, 'owner')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/courses/${course.id}/cover`,
      headers: { authorization: `Bearer ${otherOwner.token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /api/courses — включает cover_image_url', () => {
  it('поле присутствует и null у курса без обложки', async () => {
    await createCourse(ownerToken)
    const res = await app.inject({
      method: 'GET',
      url: '/api/courses',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    const courses = JSON.parse(res.body)
    expect(courses[0]).toHaveProperty('cover_image_url')
    expect(courses[0].cover_image_url).toBeNull()
  })
})
