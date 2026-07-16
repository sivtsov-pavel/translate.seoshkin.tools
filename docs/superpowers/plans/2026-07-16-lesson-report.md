# Отчёт по уроку — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать учителю страницу отчёта по одному уроку: где буксует вся группа и как идёт каждый ученик.

**Architecture:** Один owner-only эндпоинт `GET /api/analytics/lesson/:lessonId` агрегирует данные из уже существующих таблиц (`exercise_attempts`, `exercises`, `words`, `user_word_status`, `users`) — ноль новых таблиц/миграций. Новая React-страница `LessonReport.jsx` рисует два блока (группа / ученики) и «не приступили». Кнопка входа — на карточке урока в `Dashboard.jsx`.

**Tech Stack:** Fastify 4 (raw SQL через `db.query`), vitest + `app.inject` для бэкенд-тестов, React 18 + react-router, `api` клиент (`frontend/src/api/client.js`).

## Global Constraints

- Общение/комментарии в коде — русский; имена в коде — английский.
- Эндпоинт только для `role === 'owner'`; ученик получает 403.
- Ноль новых таблиц и миграций (подтверждено спеком).
- Scope «не приступили» — только ученики школы владельца (`users.school_id = lesson.school_id AND role='student'`), owner-аккаунты не попадают в список учеников.
- Формула «слово завязло у ученика»: по его попыткам на слово `attempts >= 3 AND wrong/attempts >= 0.5`.
- UI отчёта — русскоязычные инлайн-подписи, как в сестринской `TeacherAnalytics.jsx` (та тоже RU-only); переиспользуем её карту `TYPE_LABELS` и цветовую логику точности.
- Перед стартом: `git pull --ff-only` (Fable влил свои задачи в main).

---

### Task 1: Backend — эндпоинт `GET /api/analytics/lesson/:lessonId`

**Files:**
- Modify: `backend/src/routes/analytics.js` (добавить роут внутри `analyticsRoutes`, после `/api/analytics/overview`)
- Test: `backend/test/lesson-report.test.js` (создать)

**Interfaces:**
- Consumes: `db` из `../db/index.js`; тест-хелперы `createTestApp`, `clearTestData`, `registerAndLogin` из `./helpers.js`; `db` из `../src/db/index.js`.
- Produces: HTTP `GET /api/analytics/lesson/:lessonId` → JSON:
  ```
  {
    lesson: { id:int, title:string },
    totals: { students_touched:int, students_total:int, attempts:int, accuracy:int },
    group: {
      hardWords: [ { word_de, translation, attempts:int, wrong_pct:int, students_stuck:int } ],
      byType:   [ { type:string, attempts:int, accuracy:int } ]
    },
    students: [ { id:int, name, attempts:int, accuracy:int, known:int, learning:int,
                  stuck_words:int, last_active, stuck_list:[{word_de, translation, wrong_pct:int}] } ],
    notStarted: [ { id:int, name } ]
  }
  ```

- [ ] **Step 1: Написать падающий тест**

Создать `backend/test/lesson-report.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'
import { db } from '../src/db/index.js'

let app, ownerToken, ownerId, lessonId, stuckStudentId, freshStudentId

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })

beforeEach(async () => {
  await clearTestData()

  // Учитель
  const owner = await registerAndLogin(app, 'owner')
  ownerToken = owner.token
  ownerId = owner.user.id

  // Школа + привязка учителя и двух учеников к ней (детерминированно, без опоры на авто-создание)
  const { rows: sch } = await db.query(
    `INSERT INTO schools (name) VALUES ('Test School') RETURNING id`)
  const schoolId = sch[0].id
  await db.query('UPDATE users SET school_id = $1 WHERE id = $2', [schoolId, ownerId])

  const stuck = await registerAndLogin(app, 'student')
  stuckStudentId = stuck.user.id
  const fresh = await registerAndLogin(app, 'student')
  freshStudentId = fresh.user.id
  await db.query('UPDATE users SET school_id = $1 WHERE id = ANY($2::int[])',
    [schoolId, [stuckStudentId, freshStudentId]])

  // Урок учителя (school_id явно) + слово + упражнение
  const { rows: les } = await db.query(
    `INSERT INTO lessons (owner_id, school_id, title, status, target_lang)
     VALUES ($1, $2, 'Урок 1: Тест', 'done', 'de') RETURNING id`, [ownerId, schoolId])
  lessonId = les[0].id
  const { rows: wrd } = await db.query(
    `INSERT INTO words (lesson_id, user_id, word_de, translation_ru)
     VALUES ($1, $2, 'der Tisch', 'стол') RETURNING id`, [lessonId, ownerId])
  const wordId = wrd[0].id
  const { rows: ex } = await db.query(
    `INSERT INTO exercises (lesson_id, word_id, type, payload)
     VALUES ($1, $2, 'flashcard', '{}'::jsonb) RETURNING id`, [lessonId, wordId])
  const exId = ex[0].id

  // Завязший ученик: 4 попытки, 3 неверных (att>=3, wrong/att=0.75 -> stuck)
  for (const ok of [false, false, false, true]) {
    await db.query(
      `INSERT INTO exercise_attempts (exercise_id, user_id, is_correct) VALUES ($1, $2, $3)`,
      [exId, stuckStudentId, ok])
  }
  // freshStudent — без попыток (должен попасть в notStarted)
})

describe('GET /api/analytics/lesson/:lessonId', () => {
  it('owner получает отчёт: группа буксует на слове, ученик завис, второй — не приступил', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/${lessonId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const r = JSON.parse(res.body)

    expect(r.lesson.id).toBe(lessonId)
    expect(r.totals.students_touched).toBe(1)
    expect(r.totals.students_total).toBe(2)

    // Блок А
    const hw = r.group.hardWords.find(w => w.word_de === 'der Tisch')
    expect(hw).toBeTruthy()
    expect(hw.wrong_pct).toBe(75)
    expect(hw.students_stuck).toBe(1)
    expect(r.group.byType.find(t => t.type === 'flashcard').attempts).toBe(4)

    // Блок Б
    const st = r.students.find(s => s.id === stuckStudentId)
    expect(st.attempts).toBe(4)
    expect(st.accuracy).toBe(25)
    expect(st.stuck_words).toBe(1)
    expect(st.stuck_list[0].word_de).toBe('der Tisch')

    // Не приступил
    expect(r.notStarted.map(s => s.id)).toContain(freshStudentId)
    expect(r.notStarted.map(s => s.id)).not.toContain(stuckStudentId)
  })

  it('ученику — 403', async () => {
    const student = await registerAndLogin(app, 'student')
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/${lessonId}`,
      headers: { authorization: `Bearer ${student.token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('чужой/несуществующий урок — 404', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/analytics/lesson/999999`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd backend && npx vitest run test/lesson-report.test.js`
Expected: FAIL — эндпоинт отвечает 404/не тем (роута ещё нет), ассерты не проходят.

- [ ] **Step 3: Реализовать эндпоинт**

В `backend/src/routes/analytics.js` добавить внутри `export async function analyticsRoutes(fastify) {`, сразу после закрытия обработчика `/api/analytics/overview` (перед блоком «Личный кабинет ученика»):

```js
  // ── Отчёт по одному уроку: где буксует группа + как идёт каждый ученик ──
  fastify.get('/api/analytics/lesson/:lessonId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'owner') return reply.status(403).send({ error: 'Только для учителя' })
    const ownerId = request.user.id
    const lessonId = parseInt(request.params.lessonId, 10)
    if (!Number.isInteger(lessonId)) return reply.status(400).send({ error: 'Некорректный урок' })

    // Урок принадлежит этому учителю?
    const { rows: lrows } = await db.query(
      'SELECT id, title, school_id FROM lessons WHERE id = $1 AND owner_id = $2', [lessonId, ownerId])
    if (!lrows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    const lesson = lrows[0]

    // Блок А: трудные слова урока по классу (+ сколько учеников завязло на слове)
    const { rows: hardRows } = await db.query(`
      WITH per AS (
        SELECT e.word_id, ea.user_id,
               COUNT(*)::int AS att,
               COUNT(*) FILTER (WHERE NOT ea.is_correct)::int AS wrong
        FROM exercise_attempts ea
        JOIN exercises e ON e.id = ea.exercise_id
        WHERE e.lesson_id = $1 AND e.word_id IS NOT NULL
        GROUP BY e.word_id, ea.user_id
      )
      SELECT w.word_de, w.translation_ru AS translation,
             SUM(per.att)::int AS attempts,
             SUM(per.wrong)::int AS wrong,
             COUNT(*) FILTER (WHERE per.att >= 3 AND per.wrong::float / per.att >= 0.5)::int AS students_stuck
      FROM per JOIN words w ON w.id = per.word_id
      GROUP BY w.id, w.word_de, w.translation_ru
      HAVING SUM(per.att) >= 3
      ORDER BY SUM(per.wrong)::float / NULLIF(SUM(per.att),0) DESC, wrong DESC
      LIMIT 20`, [lessonId])
    const hardWords = hardRows.map(w => ({
      word_de: w.word_de, translation: w.translation,
      attempts: w.attempts, wrong_pct: Math.round(w.wrong / w.attempts * 100),
      students_stuck: w.students_stuck,
    }))

    // Блок А: разрез по типу упражнения этого урока
    const { rows: byTypeRows } = await db.query(`
      SELECT e.type,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE ea.is_correct)::int AS correct
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      WHERE e.lesson_id = $1
      GROUP BY e.type
      ORDER BY attempts DESC`, [lessonId])
    const byType = byTypeRows.map(x => ({
      type: x.type, attempts: x.attempts,
      accuracy: x.attempts ? Math.round(x.correct / x.attempts * 100) : 0,
    }))

    // Блок Б: агрегат по ученикам, трогавшим урок
    const { rows: agg } = await db.query(`
      SELECT ea.user_id AS id, COALESCE(u.full_name, u.email) AS name,
             COUNT(ea.id)::int AS attempts,
             COUNT(*) FILTER (WHERE ea.is_correct)::int AS correct,
             MAX(ea.attempted_at) AS last_active
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN users u ON u.id = ea.user_id
      WHERE e.lesson_id = $1 AND u.role = 'student'
      GROUP BY ea.user_id, name`, [lessonId])

    // known/learning по словам урока
    const { rows: wsRows } = await db.query(`
      SELECT uws.user_id,
             COUNT(*) FILTER (WHERE uws.status='known')::int AS known,
             COUNT(*) FILTER (WHERE uws.status='learning')::int AS learning
      FROM user_word_status uws
      JOIN words w ON w.id = uws.word_id
      WHERE w.lesson_id = $1
      GROUP BY uws.user_id`, [lessonId])
    const wsMap = Object.fromEntries(wsRows.map(r => [r.user_id, r]))

    // Завязшие слова по (ученик, слово): att>=3 и wrong/att>=0.5
    const { rows: pw } = await db.query(`
      SELECT ea.user_id, w.word_de, w.translation_ru AS translation,
             COUNT(*)::int AS att,
             COUNT(*) FILTER (WHERE NOT ea.is_correct)::int AS wrong
      FROM exercise_attempts ea
      JOIN exercises e ON e.id = ea.exercise_id
      JOIN words w ON w.id = e.word_id
      WHERE e.lesson_id = $1 AND e.word_id IS NOT NULL
      GROUP BY ea.user_id, w.word_de, w.translation_ru`, [lessonId])
    const stuckByUser = {}
    for (const r of pw) {
      if (r.att >= 3 && r.wrong / r.att >= 0.5) {
        (stuckByUser[r.user_id] ||= []).push({
          word_de: r.word_de, translation: r.translation,
          wrong_pct: Math.round(r.wrong / r.att * 100),
        })
      }
    }

    const students = agg.map(s => {
      const stuck = stuckByUser[s.id] || []
      return {
        id: s.id, name: s.name, attempts: s.attempts, correct: s.correct,
        accuracy: s.attempts ? Math.round(s.correct / s.attempts * 100) : 0,
        known: wsMap[s.id]?.known || 0, learning: wsMap[s.id]?.learning || 0,
        stuck_words: stuck.length, stuck_list: stuck, last_active: s.last_active,
      }
    })

    // Не приступили: ученики школы владельца без попыток по этому уроку
    const { rows: notStarted } = await db.query(`
      SELECT u.id, COALESCE(u.full_name, u.email) AS name
      FROM users u
      WHERE u.role = 'student' AND u.school_id = $2
        AND u.id NOT IN (
          SELECT DISTINCT ea.user_id FROM exercise_attempts ea
          JOIN exercises e ON e.id = ea.exercise_id WHERE e.lesson_id = $1
        )
      ORDER BY name`, [lessonId, lesson.school_id])

    const totalAttempts = students.reduce((a, s) => a + s.attempts, 0)
    const totalCorrect = students.reduce((a, s) => a + s.correct, 0)

    return {
      lesson: { id: lesson.id, title: lesson.title },
      totals: {
        students_touched: students.length,
        students_total: students.length + notStarted.length,
        attempts: totalAttempts,
        accuracy: totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0,
      },
      group: { hardWords, byType },
      students,
      notStarted,
    }
  })
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd backend && npx vitest run test/lesson-report.test.js`
Expected: PASS (3 теста).

- [ ] **Step 5: Прогнать весь бэкенд-набор (регрессия)**

Run: `cd backend && npm test`
Expected: PASS — новые тесты зелёные, старые не сломаны.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/analytics.js backend/test/lesson-report.test.js
git commit -m "feat(analytics): эндпоинт GET /api/analytics/lesson/:id — отчёт по уроку (группа + ученики + не приступили)"
```

---

### Task 2: Frontend — страница `LessonReport` + роут + кнопка входа

**Files:**
- Create: `frontend/src/pages/LessonReport.jsx`
- Modify: `frontend/src/App.jsx` (import + `<Route>`)
- Modify: `frontend/src/pages/Dashboard.jsx` (кнопка «📊 Отчёт» на карточке урока)

**Interfaces:**
- Consumes: `GET /api/analytics/lesson/:lessonId` (см. Task 1) через `api.get`; `useParams`, `useNavigate` из react-router; `useAuthStore` из `../store/auth.js`.
- Produces: маршрут `/lesson-report/:id`; на карточке урока кнопка навигации к нему.

- [ ] **Step 1: Создать страницу `frontend/src/pages/LessonReport.jsx`**

```jsx
import { useEffect, useState, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

// Отчёт по одному уроку: где буксует группа + как идёт каждый ученик.
const TYPE_LABELS = {
  flashcard: 'Флеш-карта', fill_blank: 'Пропуск', multiple_choice: 'Выбор ответа',
  sentence_write: 'Напиши предложение', letter_fill: 'Добавь букву',
  dictation: 'Диктант', speech: 'Произношение',
}
const card = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 16 }
const th = { padding: '8px 10px', textAlign: 'left', color: 'var(--ink-soft)', fontWeight: 600, fontSize: 12 }
const td = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' }
const accColor = (p) => p < 60 ? 'var(--red, #d64545)' : p < 80 ? '#B07D1B' : 'var(--good, #16a34a)'

export default function LessonReport() {
  const { id } = useParams()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [openStudent, setOpenStudent] = useState(null)

  useEffect(() => { api.get(`/analytics/lesson/${id}`).then(setData).catch(e => setErr(e.message)) }, [id])

  if (user?.role !== 'owner') return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 44 }}>🔒</div><h2>Только для учителя</h2>
    </div>
  )
  if (err) return <div style={{ maxWidth: 720, margin: '40px auto', color: 'var(--red, #d64545)' }}>Ошибка: {err}</div>
  if (!data) return <div style={{ maxWidth: 720, margin: '40px auto', color: 'var(--ink-soft)' }}>Загрузка…</div>

  const { lesson, totals, group, students, notStarted } = data

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 12px 60px' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>← Назад</button>
      <h2 style={{ margin: '0 0 4px' }}>📊 Отчёт: {lesson.title}</h2>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 16 }}>
        Учеников работало: {totals.students_touched} из {totals.students_total} · попыток: {totals.attempts} · средняя точность:{' '}
        <b style={{ color: accColor(totals.accuracy) }}>{totals.accuracy}%</b>
      </div>

      {/* Блок А — группа буксует здесь */}
      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>🔥 Группа буксует здесь</h3>
        {group.hardWords.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Пока нет слов с массовыми ошибками — класс справляется 👍</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Слово</th><th style={th}>Ошибок</th><th style={th}>Завязло учеников</th></tr></thead>
            <tbody>
              {group.hardWords.map((w, i) => (
                <tr key={i}>
                  <td style={td}><b>{w.word_de}</b> <span style={{ color: 'var(--ink-soft)' }}>— {w.translation}</span></td>
                  <td style={{ ...td, color: accColor(100 - w.wrong_pct) }}>{w.wrong_pct}%</td>
                  <td style={td}>{w.students_stuck}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {group.byType.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {group.byType.map((t, i) => (
              <span key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                {TYPE_LABELS[t.type] || t.type}: <b style={{ color: accColor(t.accuracy) }}>{t.accuracy}%</b>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Блок Б — по ученикам */}
      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>👤 По ученикам</h3>
        {students.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Урок ещё никто не проходил.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Ученик</th><th style={th}>Точность</th><th style={th}>Знаю/Учу</th><th style={th}>Завис</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <Fragment key={s.id}>
                  <tr onClick={() => setOpenStudent(openStudent === s.id ? null : s.id)} style={{ cursor: s.stuck_list.length ? 'pointer' : 'default' }}>
                    <td style={td}>{s.stuck_list.length ? (openStudent === s.id ? '▾ ' : '▸ ') : ''}{s.name}</td>
                    <td style={{ ...td, color: accColor(s.accuracy) }}>{s.accuracy}%</td>
                    <td style={td}>{s.known}/{s.learning}</td>
                    <td style={td}>{s.stuck_words > 0 ? <b style={{ color: 'var(--red, #d64545)' }}>{s.stuck_words}</b> : '—'}</td>
                  </tr>
                  {openStudent === s.id && s.stuck_list.map((w, j) => (
                    <tr key={`${s.id}-${j}`}>
                      <td style={{ ...td, paddingLeft: 24, color: 'var(--ink-soft)', fontSize: 12 }} colSpan={4}>
                        {w.word_de} — {w.translation} · ошибок {w.wrong_pct}%
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Не приступили */}
      {notStarted.length > 0 && (
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>⏳ Не приступили ({notStarted.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {notStarted.map((s) => (
              <span key={s.id} style={{ fontSize: 12.5, padding: '4px 10px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>{s.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Зарегистрировать роут в `frontend/src/App.jsx`**

Добавить импорт рядом с прочими импортами страниц (после строки `import TeacherAnalytics ...`):

```jsx
import LessonReport from './pages/LessonReport.jsx'
```

И `<Route>` рядом с `/analytics` (после строки с `path="/analytics"`):

```jsx
        <Route path="/lesson-report/:id" element={<ProtectedRoute><Layout><LessonReport /></Layout></ProtectedRoute>} />
```

- [ ] **Step 3: Добавить кнопку «📊 Отчёт» на карточку урока в `frontend/src/pages/Dashboard.jsx`**

Сразу ПОСЛЕ закрывающего `)}` кнопки «Игра класса» (owner + `wordsCount > 0`, около строки 528, перед закрытием `</div>` блока кнопок) вставить:

```jsx
        {/* Учитель: отчёт по уроку — где буксует группа + как идут ученики */}
        {user?.role === 'owner' && wordsCount > 0 && (
          <button onClick={() => navigate(`/lesson-report/${lesson.lesson_id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface-2)',
              border: '1px solid var(--accent)', borderRadius: 12, padding: '10px', fontSize: 13,
              color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', minWidth: 0, overflow: 'hidden',
            }}>
            <span style={{ flexShrink: 0, fontSize: 15 }}>📊</span>
            <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              Отчёт по уроку
            </span>
          </button>
        )}
```

(Проверить, что в компоненте карточки доступны `user`, `navigate`, `lesson.lesson_id`, `wordsCount` — они используются соседними кнопками, напр. `makeClassGame` и строкой `navigate(\`/class-game/...\`)`.)

- [ ] **Step 4: Вторичный вход — селектор урока в `frontend/src/pages/TeacherAnalytics.jsx`**

Добавить состояние списка уроков и `useNavigate` уже импортирован. После существующего `useEffect(() => { api.get('/analytics/overview')... }, [])` добавить второй эффект и состояние (рядом с `const [data, setData] = useState(null)`):

```jsx
  const [lessons, setLessons] = useState([])
  useEffect(() => {
    api.get('/lessons')
      .then(d => setLessons(Array.isArray(d) ? d : (d.lessons || [])))
      .catch(() => {})
  }, [])
```

И в разметке, сразу под заголовком страницы (перед первым блоком со сводкой/таблицами), вставить селектор:

```jsx
      {lessons.length > 0 && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>📊 Отчёт по уроку:</span>
          <select defaultValue="" onChange={(e) => e.target.value && navigate(`/lesson-report/${e.target.value}`)}
            style={{ padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 13, maxWidth: '100%' }}>
            <option value="" disabled>— выбери урок —</option>
            {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>
      )}
```

(`card` и `navigate` уже определены в этом файле; проверить, что поля урока — `l.id` и `l.title` — совпадают с ответом `/lessons`.)

- [ ] **Step 5: Сборка фронта — убедиться, что компилируется**

Run: `cd frontend && npm run build`
Expected: сборка проходит без ошибок (нет неразрешённых импортов/JSX-ошибок).

- [ ] **Step 6: Проверка в приложении (runtime)**

Поднять локально (`docker compose up` или dev-сервер по README проекта), войти учителем, на карточке урока с активностью нажать «📊 Отчёт». Убедиться:
- страница открывается на `/lesson-report/:id`, видны 3 блока;
- у слова с ошибками виден % и «завязло учеников»;
- тап по ученику со «завис > 0» раскрывает его трудные слова;
- вход учеником на тот же URL → «🔒 Только для учителя».

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/LessonReport.jsx frontend/src/App.jsx frontend/src/pages/Dashboard.jsx frontend/src/pages/TeacherAnalytics.jsx
git commit -m "feat(report): страница «Отчёт по уроку» + кнопка на карточке + селектор в /analytics"
```

---

## Отметить в IDEAS.md после внедрения

- Отметить п.1 (resume-state «МОИ задачи») как сделанный по части «Отчёт по уроку»; печать — за Fable.
- Зафиксировать отдельным пунктом обмолвку Павла: «стабилизировать количество упражнений в уроке (бывает мало / очень много)» — не смешивать с этим спринтом.

## Деплой (после мержа)

`git push origin main` → `ssh gcloud-seosite "cd /home/seosite/translate && git pull --ff-only && docker compose -f docker-compose.prod.yml build backend frontend && docker compose -f docker-compose.prod.yml up -d backend frontend"`. Миграции не требуются.
