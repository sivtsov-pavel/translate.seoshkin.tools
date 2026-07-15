# Обложка курса — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Учитель может загрузить/сменить/убрать обложку курса (фото учебника); обложка красиво отображается в списке курсов и на странице курса, с плейсхолдером-заглушкой если её нет.

**Architecture:** Новая колонка `courses.cover_image_url`; два новых роута (`POST`/`DELETE /api/courses/:id/cover`, owner-only), переиспользуют существующий multipart-хелпер `saveUploadedFile` и sharp-пайплайн (по образцу `saveOptimizedImage` для картинок слов). Фронтенд — кликабельная обложка в `CourseView.jsx` (загрузка/удаление) и вертикальная обложка/плейсхолдер на карточках в `CourseList.jsx`.

**Tech Stack:** Fastify 4 + `@fastify/multipart` (уже подключён), `sharp` (уже используется), PostgreSQL 16 raw SQL, React 18 (inline styles, без CSS-фреймворков — как весь проект).

## Global Constraints

- Комментарии в коде — русский. Имена переменных/функций/классов — английский.
- НЕ трогать логику вне обложки курса (уроки, AI-тренер, Читалка и т.д.).
- Все новые роуты — `preHandler: [fastify.authenticate]`, доступ только `role === 'owner'` (403 иначе) — как остальные мутации `courses.js`.
- Один размер webp для обложки (без `_sm`-варианта, в отличие от картинок слов) — курсов мало.
- Ошибки на фронте — `alert()`, тот же паттерн, что в `LessonList.jsx`.
- Backend-тесты — vitest, паттерн `backend/test/*.test.js` (`createTestApp`, `registerAndLogin`, `app.inject`). Файловый апload у lessons-media тестами не покрыт (существующий пробел в проекте) — для этой задачи ОДИН реальный multipart round-trip тест всё же пишем (см. Task 3), т.к. это новая фича и стоит вложения.
- Фронтенд-тестов в проекте нет (`npm test` → "No test files found") — не заводить новый фреймворк ради этой задачи, проверка вручную через `npm run dev`.

---

## Task 1: Миграция — колонка `cover_image_url`

**Files:**
- Create: `backend/src/db/migrations/043_course_cover.sql`

**Interfaces:**
- Produces: колонка `courses.cover_image_url TEXT` (nullable), которую используют Task 2 и Task 3.

- [ ] **Step 1: Написать миграцию**

```sql
-- Обложка курса (фото учебника), загружается учителем. Nullable — старые
-- курсы без обложки получают плейсхолдер на фронте.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
```

- [ ] **Step 2: Применить миграцию локально**

Run: `cd backend && npm run migrate`
Expected: в выводе — применение `043_course_cover.sql` без ошибок.

- [ ] **Step 3: Проверить колонку**

Run: `docker compose exec -T db psql -U postgres -d translate -c "\d courses"` (или эквивалентная локальная команда подключения к БД проекта — сверься с `docker-compose.yml` за именем сервиса/базы, если отличается)
Expected: в списке колонок `courses` — `cover_image_url | text |`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/043_course_cover.sql
git commit -m "feat(courses): миграция — колонка cover_image_url"
```

---

## Task 2: Backend — `saveCourseCover` (sharp-обработка)

**Files:**
- Modify: `backend/src/services/imageOptimize.js`
- Test: `backend/test/imageOptimize.test.js` (новый файл)

**Interfaces:**
- Consumes: ничего нового (тот же `sharp`, `config.uploadDir`, что уже импортированы в файле).
- Produces: `saveCourseCover(buffer: Buffer, courseId: number|string): Promise<string>` — возвращает URL вида `/uploads/course-covers/course_<id>.webp`. Используется в Task 3.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/test/imageOptimize.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { saveCourseCover } from '../src/services/imageOptimize.js'
import { config } from '../src/config.js'

// Минимальный валидный PNG 2×2 (красный), достаточно для sharp
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mNk+M9QDwAChgGAWjR9awAAAABJRU5ErkJggg==',
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
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `cd backend && npx vitest run test/imageOptimize.test.js`
Expected: FAIL — `saveCourseCover is not a function` (функции ещё нет).

- [ ] **Step 3: Добавить `saveCourseCover` в `imageOptimize.js`**

Добавить в конец `backend/src/services/imageOptimize.js` (после существующей `saveOptimizedImage`, тот же файл/паттерн):

```js
// Обложка курса (фото учебника) — портретная, заполняет рамку карточки без
// letterbox-полей (fit: 'cover', в отличие от 'inside' у картинок слов).
// Один размер (без _sm) — курсов мало, доп. srcset не оправдан.
const COVER_WIDTH = 480
const COVER_HEIGHT = 640

// Сохраняет обложку курса в webp. Перезаписывает файл при повторной загрузке
// (имя файла детерминировано по courseId — не нужно чистить старый файл).
export async function saveCourseCover(buffer, courseId) {
  const dir = join(config.uploadDir, 'course-covers')
  mkdirSync(dir, { recursive: true })
  const filename = `course_${courseId}.webp`
  await sharp(buffer)
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
    .webp({ quality: 82 })
    .toFile(join(dir, filename))
  return `/uploads/course-covers/${filename}`
}
```

- [ ] **Step 4: Запустить тест снова, убедиться что проходит**

Run: `cd backend && npx vitest run test/imageOptimize.test.js`
Expected: PASS, 2/2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/imageOptimize.js backend/test/imageOptimize.test.js
git commit -m "feat(courses): saveCourseCover — sharp-обработка обложки курса (webp, cover-crop)"
```

---

## Task 3: Backend — роуты `POST`/`DELETE /api/courses/:id/cover` + `GET` с обложкой

**Files:**
- Modify: `backend/src/routes/courses.js`
- Test: `backend/test/courses.test.js` (новый файл)

**Interfaces:**
- Consumes: `saveCourseCover(buffer, courseId)` из Task 2; `fastify.saveUploadedFile(part)` (уже существует, `backend/src/plugins/upload.js:15` — сохраняет part во временный файл на диске и возвращает `{filename, filepath}`); `db` из `../db/index.js`.
- Produces: используется фронтендом (Task 4) через `POST /api/courses/:id/cover` (multipart, поле `file`) и `DELETE /api/courses/:id/cover`.

**Важно:** `saveUploadedFile` пишет part в файл на диске (не в буфер), а `saveCourseCover` ждёт `Buffer`. Нужно прочитать сохранённый файл в буфер (`readFileSync`) перед вызовом `saveCourseCover`, либо читать поток part напрямую в буфер. Ниже — вариант через чтение сохранённого файла (проще, переиспользует существующий хелпер как есть).

- [ ] **Step 1: Добавить `clearTestData` для `courses` в helpers, если не хватает**

Открыть `backend/test/helpers.js` — в `TRUNCATE` (строка ~13) `courses` ОТСУТСТВУЕТ в списке таблиц. Добавить:

```js
export async function clearTestData() {
  await db.query(
    'TRUNCATE exercise_attempts, exercises, grammar_points, words, lesson_media, lessons, courses, users RESTART IDENTITY CASCADE'
  )
}
```

- [ ] **Step 2: Написать падающие тесты**

Создать `backend/test/courses.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'

let app, ownerToken, studentToken

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await clearTestData()
  ownerToken = (await registerAndLogin(app, 'owner')).token
  studentToken = (await registerAndLogin(app, 'student')).token
})

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mNk+M9QDwAChgGAWjR9awAAAABJRU5ErkJggg==',
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
```

- [ ] **Step 3: Запустить тесты, убедиться что падают**

Run: `cd backend && npx vitest run test/courses.test.js`
Expected: FAIL — роутов `POST`/`DELETE /api/courses/:id/cover` не существует (404 на неверных путях/undefined), и `cover_image_url` отсутствует в ответе `GET /api/courses`.

- [ ] **Step 4: Добавить роуты и обновить `SELECT`**

В `backend/src/routes/courses.js`:

1. Добавить импорты в начало файла:

```js
import { readFileSync } from 'fs'
import { saveCourseCover } from '../services/imageOptimize.js'
```

2. В `GET /api/courses` (строка ~12-24) добавить `c.cover_image_url` в `SELECT`:

```js
    const { rows } = await db.query(`
      SELECT
        c.id, c.title, c.description, c.cover_image_url, c.sort_order, c.created_at,
        COUNT(l.id)::int                                                  AS lessons_total,
        COUNT(CASE WHEN l.status = 'done'       THEN 1 END)::int         AS lessons_done,
        COUNT(CASE WHEN l.status = 'processing' THEN 1 END)::int         AS lessons_processing
      FROM courses c
      LEFT JOIN lessons l ON l.course_id = c.id
      ${filter}
      GROUP BY c.id
      ORDER BY c.sort_order, c.created_at
    `, params)
```

3. Добавить два новых роута (после `PATCH /api/courses/:id`, перед `DELETE /api/courses/:id`):

```js
  // Загрузить/сменить обложку курса (фото учебника)
  fastify.post('/api/courses/:id/cover', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)

    const { rows: existing } = await db.query('SELECT id FROM courses WHERE id = $1', [courseId])
    if (!existing[0]) return reply.status(404).send({ error: 'Курс не найден' })

    const parts = request.parts()
    let filePart = null
    for await (const part of parts) {
      if (part.type === 'file') { filePart = part; break }
    }
    if (!filePart) return reply.status(400).send({ error: 'Файл не передан' })
    if (!filePart.mimetype?.startsWith('image/')) {
      return reply.status(400).send({ error: 'Обложка должна быть изображением' })
    }

    const { filepath } = await fastify.saveUploadedFile(filePart)
    const buffer = readFileSync(filepath)
    const coverUrl = await saveCourseCover(buffer, courseId)

    const { rows } = await db.query(
      'UPDATE courses SET cover_image_url = $1 WHERE id = $2 AND owner_id = $3 RETURNING *',
      [coverUrl, courseId, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Курс не найден' })
    return rows[0]
  })

  // Убрать обложку курса
  fastify.delete('/api/courses/:id/cover', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const courseId = parseInt(request.params.id)
    await db.query(
      'UPDATE courses SET cover_image_url = NULL WHERE id = $1 AND owner_id = $2',
      [courseId, request.user.id]
    )
    return reply.status(204).send()
  })
```

- [ ] **Step 5: Запустить тесты снова, убедиться что проходят**

Run: `cd backend && npx vitest run test/courses.test.js`
Expected: PASS, все тесты зелёные.

- [ ] **Step 6: Запустить весь backend-набор тестов — убедиться что ничего не сломано**

Run: `cd backend && npx vitest run`
Expected: PASS, все существующие тесты (auth, lessons, srs, processor, imageOptimize, courses) зелёные.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/courses.js backend/test/courses.test.js backend/test/helpers.js
git commit -m "feat(courses): роуты загрузки/удаления обложки курса + cover_image_url в GET"
```

---

## Task 4: Frontend — `CoursePlaceholder` + загрузка/удаление обложки в `CourseView.jsx`

**Files:**
- Create: `frontend/src/components/CoursePlaceholder.jsx`
- Modify: `frontend/src/pages/CourseView.jsx`

**Interfaces:**
- Consumes: `uploadFiles(url, formData)` и `api` из `frontend/src/api/client.js` (уже импортированы в `CourseView.jsx`).
- Produces: `CoursePlaceholder({ title })` — React-компонент, экспорт по умолчанию. Используется в Task 4 (здесь) и Task 5 (`CourseList.jsx`).

- [ ] **Step 1: Создать `CoursePlaceholder.jsx`**

```jsx
// Заглушка обложки курса — градиент + иконка книги + первая буква названия.
// Используется и в CourseView (крупно), и в CourseList (на карточке).
export default function CoursePlaceholder({ title, style }) {
  const letter = (title || '?').trim().charAt(0).toUpperCase()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, var(--accent-soft), var(--surface-2))',
      color: 'var(--accent)', width: '100%', height: '100%',
      ...style,
    }}>
      <div style={{ fontSize: 32, marginBottom: 4 }}>📕</div>
      <div style={{ fontSize: 28, fontWeight: 700, opacity: 0.7 }}>{letter}</div>
    </div>
  )
}
```

- [ ] **Step 2: Добавить блок обложки в `CourseView.jsx`**

Добавить импорты в начало файла (после существующих импортов):

```js
import { useRef } from 'react'
import { uploadFiles } from '../api/client.js'
import CoursePlaceholder from '../components/CoursePlaceholder.jsx'
```

(`useState`/`useEffect` уже импортированы из `react` в строке 1 — добавить `useRef` в тот же импорт, не дублировать строку.)

Добавить состояние загрузки рядом с остальными `useState` в компоненте (после `const [attachId, setAttachId] = useState('')`, строка ~17):

```js
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef()
```

Добавить обработчики (после `handleDelete`, перед `if (loading)`):

```js
  const handleCoverPick = () => coverInputRef.current?.click()

  const handleCoverUpload = async (file) => {
    if (!file) return
    setUploadingCover(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const updated = await uploadFiles(`/courses/${id}/cover`, form)
      setData(d => ({ ...d, course: { ...d.course, cover_image_url: updated.cover_image_url } }))
    } catch (e) {
      alert('Ошибка загрузки: ' + e.message)
    } finally {
      setUploadingCover(false)
    }
  }

  const handleCoverRemove = async () => {
    await api.delete(`/courses/${id}/cover`)
    setData(d => ({ ...d, course: { ...d.course, cover_image_url: null } }))
  }
```

Добавить сам блок обложки в JSX — сразу после строки `<Link to="/courses" ...>{c.back}</Link>` (строка ~46), перед блоком заголовка (`<div style={{ display: 'flex', ... }}>`):

```jsx
      <div style={{
        position: 'relative', width: 160, aspectRatio: '3/4', borderRadius: 14,
        overflow: 'hidden', margin: '16px 0', boxShadow: '0 4px 16px rgba(0,0,0,.15)',
        cursor: user?.role === 'owner' ? 'pointer' : 'default',
      }}
        onClick={user?.role === 'owner' ? handleCoverPick : undefined}>
        {course.cover_image_url ? (
          <img src={course.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <CoursePlaceholder title={course.title} />
        )}
        {uploadingCover && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13 }}>
            ⏳
          </div>
        )}
      </div>
      {user?.role === 'owner' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button type="button" onClick={handleCoverPick} disabled={uploadingCover} style={btnSecondary}>
            {course.cover_image_url ? '🖼 Сменить обложку' : '🖼 Загрузить обложку'}
          </button>
          {course.cover_image_url && (
            <button type="button" onClick={handleCoverRemove} style={btnSecondary}>Убрать обложку</button>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => handleCoverUpload(e.target.files[0])} />
        </div>
      )}
```

- [ ] **Step 3: Проверить визуально**

Run: `cd frontend && npm run dev`, открыть `/courses/:id` под owner-аккаунтом.
Expected: под ссылкой «Назад» — блок 160×213px (портрет 3:4) с плейсхолдером (градиент, иконка книги, первая буква названия), кнопка «🖼 Загрузить обложку». Клик → выбор файла → после загрузки на месте плейсхолдера появляется картинка, кнопка меняется на «🖼 Сменить обложку» + «Убрать обложку». Под аккаунтом student — блок виден, но не кликабелен, кнопок нет.

- [ ] **Step 4: Собрать фронтенд, убедиться что нет ошибок сборки**

Run: `cd frontend && npx vite build`
Expected: сборка проходит без ошибок.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CoursePlaceholder.jsx frontend/src/pages/CourseView.jsx
git commit -m "feat(courses): загрузка/смена/удаление обложки на странице курса"
```

---

## Task 5: Frontend — обложка на карточках в `CourseList.jsx`

**Files:**
- Modify: `frontend/src/pages/CourseList.jsx`

**Interfaces:**
- Consumes: `CoursePlaceholder` из Task 4.

- [ ] **Step 1: Добавить импорт**

В начало `CourseList.jsx` (после существующих импортов):

```js
import CoursePlaceholder from '../components/CoursePlaceholder.jsx'
```

- [ ] **Step 2: Добавить блок обложки на карточку**

В `CourseList.jsx`, внутри `.map(course => ...)` (строка ~73-89), сразу после открывающего `<div style={{ border: '1px solid var(--line)', ... }}>` и перед `<div style={{ fontSize: 18, ...}}>{course.title}</div>`, добавить:

```jsx
                <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                  {course.cover_image_url ? (
                    <img src={course.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <CoursePlaceholder title={course.title} />
                  )}
                </div>
```

Карточка при этом теряет фиксированный `padding` только сверху для картинки — обложка должна визуально доходить до краёв карточки сверху. Оставить существующий `padding: '20px 22px'` на карточке как есть (обложка будет с отступом как остальной контент) — это самый безопасный вариант, не трогающий остальную вёрстку карточки; если Павлу не понравится (захочет обложку строго во всю ширину без отступов сверху) — доработать отдельным пунктом после визуальной проверки.

- [ ] **Step 3: Проверить визуально**

Run: `cd frontend && npm run dev`, открыть `/courses`.
Expected: сетка карточек курсов, у каждой — портретная обложка/плейсхолдер сверху (одинаковая высота у всех карточек в ряду за счёт `aspect-ratio`), под ней — название/описание/чипы как раньше. Курсы без обложки выглядят опрятно (плейсхолдер, не пустота).

- [ ] **Step 4: Собрать фронтенд**

Run: `cd frontend && npx vite build`
Expected: сборка проходит без ошибок.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CourseList.jsx
git commit -m "feat(courses): вертикальная обложка/плейсхолдер на карточках списка курсов"
```

---

## После всех задач

Отдельный коммит на каждую задачу (уже соблюдено по шагам выше). Работа остаётся в ветке `worktree-sonnet-ui-tasks`, НЕ мержится в `main` до отдельного подтверждения (как и с предыдущим раундом задач A/B).
