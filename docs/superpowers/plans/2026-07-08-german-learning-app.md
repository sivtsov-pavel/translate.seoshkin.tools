# German Learning App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить PWA-приложение для закрепления немецкого языка школьником уровня A1 — загрузка фото/аудио уроков, Claude vision для извлечения слов/грамматики, Whisper для транскрипции, SRS (SM-2) для интервального повторения.

**Architecture:** Fastify API (порт 8090) + PostgreSQL + локальное хранилище файлов, React+Vite PWA (порт 8091 через nginx), всё в Docker Compose. Nginx-proxy на поддомене translate.seoshkin.tools.

**Tech Stack:** Node.js 20, Fastify 4, pg (node-postgres), React 18, Vite 5, vite-plugin-pwa, Zustand, React Router 6, bcryptjs, @fastify/jwt, @fastify/multipart, vitest, @testing-library/react.

## Global Constraints

- Порты: backend 8090, frontend 8091. Порты 3000, 5678, 8080 заняты другими сервисами — не трогать.
- `.env` не коммитить — только `.env.example`.
- Переменные: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `JWT_SECRET`.
- Комментарии в коде — на русском. Имена переменных/функций/классов — английский.
- Роли пользователей: `owner` и `student`.
- SM-2 поля для каждого слова/упражнения: `easiness_factor` (default 2.5), `interval_days` (default 0), `repetitions` (default 0), `next_review_date`.
- Claude API: использовать `claude-sonnet-4-6` для vision и генерации упражнений.
- Whisper: `openai` SDK, модель `whisper-1`.
- PostgreSQL 16.
- Хранение загруженных файлов: `/data/uploads` внутри контейнера (volume `uploads_data`).

---

## File Structure

```
translate.seoshkin.tools/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vitest.config.js
│   ├── src/
│   │   ├── index.js                  # точка входа, Fastify setup
│   │   ├── config.js                 # конфиг из env
│   │   ├── db/
│   │   │   ├── index.js              # пул pg соединений
│   │   │   └── migrations/
│   │   │       ├── 001_users.sql
│   │   │       ├── 002_lessons.sql
│   │   │       ├── 003_words.sql
│   │   │       ├── 004_exercises.sql
│   │   │       └── run.js            # запускает миграции по порядку
│   │   ├── plugins/
│   │   │   ├── auth.js               # @fastify/jwt регистрация + декоратор authenticate
│   │   │   └── upload.js             # @fastify/multipart + сохранение на диск
│   │   ├── routes/
│   │   │   ├── auth.js               # POST /api/auth/register, /api/auth/login
│   │   │   ├── lessons.js            # CRUD + POST /api/lessons/:id/process
│   │   │   ├── words.js              # GET /api/words, PATCH /api/words/:id
│   │   │   ├── exercises.js          # GET /api/exercises/today, POST /api/exercises/:id/attempt
│   │   │   └── media.js              # GET /api/media/:filename (serve uploads)
│   │   └── services/
│   │       ├── claude.js             # vision + generation вызовы Anthropic API
│   │       ├── whisper.js            # транскрипция через OpenAI
│   │       ├── processor.js          # оркестрация обработки урока
│   │       └── srs.js                # SM-2 алгоритм
│   └── test/
│       ├── helpers.js                # тестовый Fastify инстанс + DB setup
│       ├── auth.test.js
│       ├── lessons.test.js
│       ├── srs.test.js
│       └── processor.test.js         # mock Claude/Whisper
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   └── icons/                    # PWA иконки (192x192, 512x512)
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                   # Router + ProtectedRoute
│       ├── api/
│       │   └── client.js             # fetch wrapper с JWT + refresh
│       ├── store/
│       │   └── auth.js               # Zustand: user, token, login/logout
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── Dashboard.jsx         # очередь SRS на сегодня
│       │   ├── NewLesson.jsx         # загрузка + кнопка "Обработать"
│       │   ├── LessonList.jsx
│       │   ├── ExerciseSession.jsx   # прохождение упражнений по очереди
│       │   └── Vocabulary.jsx        # личный словарь
│       └── components/
│           ├── Flashcard.jsx
│           ├── FillBlank.jsx
│           ├── MultipleChoice.jsx
│           ├── UploadZone.jsx        # drag-and-drop + camera
│           ├── ProgressBar.jsx
│           └── Layout.jsx            # навигация + обёртка
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-07-08-german-learning-app.md
```

---

## Task 1: Infrastructure — Docker Compose, Dockerfiles, nginx

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`

**Interfaces:**
- Produces: работающая инфраструктура — `docker compose up` поднимает 3 контейнера (db, backend, frontend)

- [ ] **Step 1: Создать `.gitignore`**

```
.env
node_modules/
dist/
*.log
uploads/
```

- [ ] **Step 2: Создать `.env.example`**

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
JWT_SECRET=change_me_in_production_min32chars
POSTGRES_USER=german_app
POSTGRES_PASSWORD=secret
POSTGRES_DB=german_learning
DATABASE_URL=postgresql://german_app:secret@db:5432/german_learning
```

- [ ] **Step 3: Создать `docker-compose.yml`**

```yaml
version: '3.9'

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "8090:8090"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      PORT: 8090
      HOST: 0.0.0.0
      UPLOAD_DIR: /data/uploads
    volumes:
      - uploads_data:/data/uploads
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "8091:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  uploads_data:
```

- [ ] **Step 4: Создать `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN mkdir -p /data/uploads
EXPOSE 8090
CMD ["node", "src/index.js"]
```

- [ ] **Step 5: Создать `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # PWA — все маршруты отдаём index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API проксируем на backend
    location /api/ {
        proxy_pass http://backend:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 50m;
    }

    # Загруженные медиафайлы
    location /media/ {
        proxy_pass http://backend:8090/api/media/;
        proxy_set_header Host $host;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
}
```

- [ ] **Step 6: Создать `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 7: Проверить инфраструктуру**

Создать `.env` из `.env.example` (заполнить реальные ключи позже).

```bash
# Убедиться что docker-compose валиден
docker compose config
```

Ожидаемый вывод: вся конфигурация без ошибок.

- [ ] **Step 8: Commit**

```bash
git init
git add docker-compose.yml .env.example .gitignore backend/Dockerfile frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: add Docker Compose infrastructure and Dockerfiles"
```

---

## Task 2: Backend — package.json, config, DB connection, migrations

**Files:**
- Create: `backend/package.json`
- Create: `backend/vitest.config.js`
- Create: `backend/src/config.js`
- Create: `backend/src/db/index.js`
- Create: `backend/src/db/migrations/001_users.sql`
- Create: `backend/src/db/migrations/002_lessons.sql`
- Create: `backend/src/db/migrations/003_words.sql`
- Create: `backend/src/db/migrations/004_exercises.sql`
- Create: `backend/src/db/migrations/run.js`
- Create: `backend/test/helpers.js`

**Interfaces:**
- Produces: `db.query(sql, params)` — промис с `{ rows }`; `runMigrations()` — идемпотентная функция; `createTestApp()` — тестовый Fastify инстанс.

- [ ] **Step 1: Создать `backend/package.json`**

```json
{
  "name": "german-learning-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "migrate": "node src/db/migrations/run.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/jwt": "^8.0.0",
    "@fastify/multipart": "^8.0.0",
    "@fastify/static": "^7.0.0",
    "bcryptjs": "^2.4.3",
    "fastify": "^4.28.0",
    "openai": "^4.67.0",
    "pg": "^8.13.0",
    "pump": "^3.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Создать `backend/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // тесты гоняем последовательно — общая БД
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
```

- [ ] **Step 3: Создать `backend/src/config.js`**

```js
// Централизованный конфиг — все env переменные только отсюда
export const config = {
  port: parseInt(process.env.PORT || '8090'),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://german_app:secret@localhost:5432/german_learning',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
}
```

- [ ] **Step 4: Создать `backend/src/db/index.js`**

```js
import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg

// Единый пул соединений для всего приложения
const pool = new Pool({ connectionString: config.databaseUrl })

pool.on('error', (err) => {
  console.error('Неожиданная ошибка пула PostgreSQL:', err)
})

export const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
}
```

- [ ] **Step 5: Создать миграции SQL**

`backend/src/db/migrations/001_users.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role        VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('owner', 'student')),
  class_id    INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

`backend/src/db/migrations/002_lessons.sql`:
```sql
CREATE TABLE IF NOT EXISTS lessons (
  id         SERIAL PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  title      VARCHAR(255),
  status     VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_media (
  id              SERIAL PRIMARY KEY,
  lesson_id       INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type            VARCHAR(10) NOT NULL CHECK (type IN ('photo', 'audio')),
  file_path       VARCHAR(500) NOT NULL,
  processed       BOOLEAN DEFAULT FALSE,
  raw_extraction  JSONB
);
```

`backend/src/db/migrations/003_words.sql`:
```sql
CREATE TABLE IF NOT EXISTS words (
  id                SERIAL PRIMARY KEY,
  lesson_id         INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_de           VARCHAR(255) NOT NULL,
  translation_ru    VARCHAR(255) NOT NULL,
  example_sentence  TEXT,
  easiness_factor   NUMERIC(4,2) DEFAULT 2.5,
  interval_days     INTEGER DEFAULT 0,
  repetitions       INTEGER DEFAULT 0,
  next_review_date  DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'learning', 'known')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_de)
);

CREATE TABLE IF NOT EXISTS grammar_points (
  id          SERIAL PRIMARY KEY,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  example     TEXT
);
```

`backend/src/db/migrations/004_exercises.sql`:
```sql
CREATE TABLE IF NOT EXISTS exercises (
  id         SERIAL PRIMARY KEY,
  lesson_id  INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  word_id    INTEGER REFERENCES words(id) ON DELETE CASCADE,
  type       VARCHAR(30) NOT NULL CHECK (type IN ('flashcard', 'fill_blank', 'multiple_choice')),
  payload    JSONB NOT NULL,
  easiness_factor  NUMERIC(4,2) DEFAULT 2.5,
  interval_days    INTEGER DEFAULT 0,
  repetitions      INTEGER DEFAULT 0,
  next_review_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercise_attempts (
  id           SERIAL PRIMARY KEY,
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_answer  TEXT,
  is_correct   BOOLEAN NOT NULL,
  quality      INTEGER CHECK (quality BETWEEN 0 AND 5),
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 6: Создать `backend/src/db/migrations/run.js`**

```js
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'
import { config } from '../../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { Pool } = pg

async function runMigrations() {
  const pool = new Pool({ connectionString: config.databaseUrl })

  // Таблица для отслеживания выполненных миграций
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const files = readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [file]
    )
    if (rows.length > 0) {
      console.log(`Пропускаем уже применённую миграцию: ${file}`)
      continue
    }

    const sql = readFileSync(join(__dirname, file), 'utf8')
    await pool.query(sql)
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
    console.log(`Применена миграция: ${file}`)
  }

  await pool.end()
  console.log('Все миграции применены.')
}

runMigrations().catch(err => {
  console.error('Ошибка миграции:', err)
  process.exit(1)
})
```

- [ ] **Step 7: Создать `backend/test/helpers.js`**

```js
import Fastify from 'fastify'
import { db } from '../src/db/index.js'

// Создаём тестовый инстанс Fastify с теми же плагинами что и main
export async function createTestApp() {
  const app = Fastify({ logger: false })

  // Регистрируем плагины
  const { registerPlugins } = await import('../src/index.js')
  await registerPlugins(app)

  await app.ready()
  return app
}

// Очистка тестовых данных между тестами
export async function clearTestData() {
  await db.query('TRUNCATE exercise_attempts, exercises, grammar_points, words, lesson_media, lessons, users RESTART IDENTITY CASCADE')
}

// Регистрация тестового пользователя и возврат JWT токена
export async function registerAndLogin(app, role = 'owner') {
  const email = `test_${Date.now()}@example.com`
  const password = 'TestPass123!'

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password, role },
  })

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  })

  const { token, user } = JSON.parse(loginRes.body)
  return { token, user, email, password }
}
```

- [ ] **Step 8: Установить зависимости и проверить**

```bash
cd backend && npm install
```

Ожидаемый вывод: `added N packages, found 0 vulnerabilities`

- [ ] **Step 9: Commit**

```bash
git add backend/
git commit -m "feat: add backend scaffolding, DB connection, SQL migrations"
```

---

## Task 3: Backend — Auth (register/login/JWT)

**Files:**
- Create: `backend/src/plugins/auth.js`
- Create: `backend/src/routes/auth.js`
- Create: `backend/src/index.js`
- Create: `backend/test/auth.test.js`

**Interfaces:**
- Consumes: `db.query`, `config.jwtSecret`
- Produces: `app.authenticate` — Fastify декоратор (preHandler); `POST /api/auth/register` → `{ token, user: { id, email, role } }`; `POST /api/auth/login` → то же самое.

- [ ] **Step 1: Написать failing тест**

`backend/test/auth.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData } from './helpers.js'

let app

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await clearTestData() })

describe('POST /api/auth/register', () => {
  it('регистрирует нового пользователя и возвращает JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'owner@test.com', password: 'Pass1234!', role: 'owner' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.token).toBeTruthy()
    expect(body.user.email).toBe('owner@test.com')
    expect(body.user.role).toBe('owner')
    expect(body.user.password_hash).toBeUndefined()
  })

  it('возвращает 409 при дублирующемся email', async () => {
    const payload = { email: 'dup@test.com', password: 'Pass1234!', role: 'student' }
    await app.inject({ method: 'POST', url: '/api/auth/register', payload })
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload })
    expect(res.statusCode).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  it('возвращает JWT для зарегистрированного пользователя', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user@test.com', password: 'Pass1234!', role: 'student' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@test.com', password: 'Pass1234!' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).token).toBeTruthy()
  })

  it('возвращает 401 при неверном пароле', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user2@test.com', password: 'Pass1234!', role: 'student' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user2@test.com', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
cd backend && npm test test/auth.test.js
```

Ожидаемый вывод: `FAIL — cannot find module '../src/index.js'`

- [ ] **Step 3: Создать `backend/src/plugins/auth.js`**

```js
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { config } from '../config.js'

async function authPlugin(fastify) {
  fastify.register(jwt, { secret: config.jwtSecret })

  // Декоратор для защищённых маршрутов
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
}

export default fp(authPlugin)
```

Установить fastify-plugin: `npm install fastify-plugin` в `backend/`.

- [ ] **Step 4: Создать `backend/src/routes/auth.js`**

```js
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'

export async function authRoutes(fastify) {
  // Регистрация
  fastify.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['owner', 'student'], default: 'student' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, role = 'student' } = request.body

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'Email уже зарегистрирован' })
    }

    const password_hash = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, password_hash, role]
    )
    const user = rows[0]
    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })

    return reply.status(201).send({ token, user })
  })

  // Логин
  fastify.post('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body

    const { rows } = await db.query('SELECT id, email, role, password_hash FROM users WHERE email = $1', [email])
    if (rows.length === 0) {
      return reply.status(401).send({ error: 'Неверный email или пароль' })
    }

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'Неверный email или пароль' })
    }

    const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
  })
}
```

- [ ] **Step 5: Создать `backend/src/index.js`**

```js
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import authPlugin from './plugins/auth.js'
import { authRoutes } from './routes/auth.js'
import { runMigrationsOnStartup } from './db/migrations/run.js'

// Выделено в функцию для переиспользования в тестах
export async function registerPlugins(app) {
  await app.register(cors, { origin: true })
  await app.register(authPlugin)
}

async function registerRoutes(app) {
  await app.register(authRoutes)
}

async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })
  await registerPlugins(app)
  await registerRoutes(app)
  return app
}

// Точка входа — только при прямом запуске (не при импорте в тестах)
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = await buildApp()
  await runMigrationsOnStartup()
  await app.listen({ port: config.port, host: config.host })
  console.log(`Backend запущен на http://${config.host}:${config.port}`)
}
```

Обновить `backend/src/db/migrations/run.js` — экспортировать `runMigrationsOnStartup`:

Добавить в конец файла `run.js`:
```js
export async function runMigrationsOnStartup() {
  await runMigrations()
}
```

И изменить секцию внизу `run.js` на:
```js
// Запуск напрямую: node run.js
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runMigrations().catch(err => {
    console.error('Ошибка миграции:', err)
    process.exit(1)
  })
}
```

- [ ] **Step 6: Запустить тест — убедиться что проходит**

```bash
cd backend && npm test test/auth.test.js
```

Ожидаемый вывод: `✓ auth.test.js (4 tests) — PASS`

- [ ] **Step 7: Commit**

```bash
git add backend/src/ backend/test/auth.test.js
git commit -m "feat: add JWT auth (register/login)"
```

---

## Task 4: Backend — Загрузка файлов + CRUD уроков

**Files:**
- Create: `backend/src/plugins/upload.js`
- Create: `backend/src/routes/lessons.js`
- Create: `backend/src/routes/media.js`
- Modify: `backend/src/index.js` — добавить регистрацию новых маршрутов
- Create: `backend/test/lessons.test.js`

**Interfaces:**
- Consumes: `app.authenticate`, `db.query`, `config.uploadDir`
- Produces: `POST /api/lessons` → `{ id, title, date, status }`; `POST /api/lessons/:id/media` (multipart) → `{ mediaId, fileName }`; `GET /api/lessons` → массив уроков; `GET /api/media/:filename` → файл.

- [ ] **Step 1: Написать failing тест**

`backend/test/lessons.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'
import { createReadStream } from 'fs'
import { writeFileSync, unlinkSync } from 'fs'

let app, ownerToken

beforeAll(async () => { app = await createTestApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await clearTestData()
  const { token } = await registerAndLogin(app, 'owner')
  ownerToken = token
})

describe('POST /api/lessons', () => {
  it('создаёт урок для авторизованного owner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/lessons',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { title: 'Урок 1: Приветствия', date: '2026-07-08' },
    })
    expect(res.statusCode).toBe(201)
    const lesson = JSON.parse(res.body)
    expect(lesson.id).toBeTruthy()
    expect(lesson.status).toBe('pending')
  })

  it('возвращает 401 без токена', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/lessons', payload: { title: 'test' } })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/lessons', () => {
  it('возвращает список уроков пользователя', async () => {
    await app.inject({
      method: 'POST', url: '/api/lessons',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { title: 'Урок 1' },
    })
    const res = await app.inject({
      method: 'GET', url: '/api/lessons',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const lessons = JSON.parse(res.body)
    expect(lessons).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
cd backend && npm test test/lessons.test.js
```

Ожидаемый вывод: `FAIL — routes not registered`

- [ ] **Step 3: Создать `backend/src/plugins/upload.js`**

```js
import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'
import { createWriteStream, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { config } from '../config.js'

// Убеждаемся что директория загрузок существует
mkdirSync(config.uploadDir, { recursive: true })

async function uploadPlugin(fastify) {
  fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB

  // Хелпер для сохранения файла из multipart части
  fastify.decorate('saveUploadedFile', async function (part) {
    const ext = extname(part.filename) || '.bin'
    const filename = `${randomUUID()}${ext}`
    const filepath = join(config.uploadDir, filename)

    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filepath)
      part.file.pipe(stream)
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    return { filename, filepath }
  })
}

export default fp(uploadPlugin)
```

- [ ] **Step 4: Создать `backend/src/routes/lessons.js`**

```js
import { db } from '../db/index.js'

export async function lessonsRoutes(fastify) {
  // Создание урока
  fastify.post('/api/lessons', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: 'string', format: 'date' },
        },
      },
    },
  }, async (request, reply) => {
    const { title, date } = request.body
    const ownerId = request.user.id

    const { rows } = await db.query(
      'INSERT INTO lessons (owner_id, title, date) VALUES ($1, $2, $3) RETURNING *',
      [ownerId, title || null, date || new Date().toISOString().slice(0, 10)]
    )
    return reply.status(201).send(rows[0])
  })

  // Список уроков
  fastify.get('/api/lessons', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const { rows } = await db.query(
      'SELECT l.*, COUNT(lm.id)::int AS media_count FROM lessons l LEFT JOIN lesson_media lm ON lm.lesson_id = l.id WHERE l.owner_id = $1 GROUP BY l.id ORDER BY l.date DESC',
      [userId]
    )
    return rows
  })

  // Получить один урок
  fastify.get('/api/lessons/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params
    const { rows } = await db.query(
      'SELECT * FROM lessons WHERE id = $1 AND owner_id = $2',
      [id, request.user.id]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Урок не найден' })
    return rows[0]
  })

  // Загрузка медиафайлов к уроку
  fastify.post('/api/lessons/:id/media', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = request.params.id

    // Проверяем что урок принадлежит пользователю
    const { rows: lessonRows } = await db.query(
      'SELECT id FROM lessons WHERE id = $1 AND owner_id = $2',
      [lessonId, request.user.id]
    )
    if (!lessonRows[0]) return reply.status(404).send({ error: 'Урок не найден' })

    const parts = request.parts()
    const savedFiles = []

    for await (const part of parts) {
      if (part.type !== 'file') continue

      const mimeType = part.mimetype || ''
      const mediaType = mimeType.startsWith('audio') ? 'audio' : 'photo'

      const { filename } = await fastify.saveUploadedFile(part)

      const { rows } = await db.query(
        'INSERT INTO lesson_media (lesson_id, type, file_path) VALUES ($1, $2, $3) RETURNING id',
        [lessonId, mediaType, filename]
      )
      savedFiles.push({ mediaId: rows[0].id, filename, type: mediaType })
    }

    return reply.status(201).send(savedFiles)
  })
}
```

- [ ] **Step 5: Создать `backend/src/routes/media.js`**

```js
import { join } from 'path'
import { config } from '../config.js'

export async function mediaRoutes(fastify) {
  fastify.get('/api/media/:filename', async (request, reply) => {
    const { filename } = request.params
    // Защита от path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return reply.status(400).send({ error: 'Invalid filename' })
    }
    return reply.sendFile(filename, config.uploadDir)
  })
}
```

- [ ] **Step 6: Обновить `backend/src/index.js` — добавить новые плагины и маршруты**

Изменить функции `registerPlugins` и `registerRoutes`:

```js
import Fastify from 'fastify'
import cors from '@fastify/cors'
import staticFiles from '@fastify/static'
import { config } from './config.js'
import authPlugin from './plugins/auth.js'
import uploadPlugin from './plugins/upload.js'
import { authRoutes } from './routes/auth.js'
import { lessonsRoutes } from './routes/lessons.js'
import { mediaRoutes } from './routes/media.js'
import { runMigrationsOnStartup } from './db/migrations/run.js'

export async function registerPlugins(app) {
  await app.register(cors, { origin: true })
  await app.register(authPlugin)
  await app.register(uploadPlugin)
  await app.register(staticFiles, { root: config.uploadDir, prefix: '/uploads/' })
}

async function registerRoutes(app) {
  await app.register(authRoutes)
  await app.register(lessonsRoutes)
  await app.register(mediaRoutes)
}

async function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })
  await registerPlugins(app)
  await registerRoutes(app)
  return app
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = await buildApp()
  await runMigrationsOnStartup()
  await app.listen({ port: config.port, host: config.host })
  console.log(`Backend запущен на http://${config.host}:${config.port}`)
}
```

- [ ] **Step 7: Запустить тест — убедиться что проходит**

```bash
cd backend && npm test test/lessons.test.js
```

Ожидаемый вывод: `✓ lessons.test.js (3 tests) — PASS`

- [ ] **Step 8: Commit**

```bash
git add backend/src/plugins/upload.js backend/src/routes/lessons.js backend/src/routes/media.js backend/src/index.js backend/test/lessons.test.js
git commit -m "feat: add lesson CRUD and file upload"
```

---

## Task 5: Backend — Claude vision + генерация упражнений

**Files:**
- Create: `backend/src/services/claude.js`
- Create: `backend/src/services/whisper.js`
- Create: `backend/src/services/processor.js`
- Create: `backend/src/routes/process.js`
- Create: `backend/test/processor.test.js`
- Modify: `backend/src/index.js` — добавить маршрут process

**Interfaces:**
- Consumes: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `lesson_media` rows, `lessons` row
- Produces: `POST /api/lessons/:id/process` → `{ lessonId, wordsCount, exercisesCount }`; `extractFromPhoto(base64, mimeType)` → `{ words, grammar_points, example_sentences, raw_text }`; `transcribeAudio(filepath)` → `string`; `generateExercises(words, grammar_points)` → `Exercise[]`

- [ ] **Step 1: Написать failing тест с mock**

`backend/test/processor.test.js`:
```js
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestApp, clearTestData, registerAndLogin } from './helpers.js'

// Мокируем внешние API
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
    { type: 'flashcard', payload: { question: 'Hallo', answer: 'Привет' } },
    { type: 'fill_blank', payload: { sentence: '___, wie geht es dir?', blank: 'Hallo', options: [] } },
    { type: 'multiple_choice', payload: { question: 'Переведи: Hallo', options: ['Привет', 'Пока', 'Спасибо'], correct: 0 } },
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
    method: 'POST', url: '/api/lessons',
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { title: 'Урок 1' },
  })
  const lesson = JSON.parse(lessonRes.body)

  // Добавляем медиафайл вручную в БД (имитируем загрузку)
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
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
cd backend && npm test test/processor.test.js
```

Ожидаемый вывод: `FAIL — route /api/lessons/:id/process not found`

- [ ] **Step 3: Создать `backend/src/services/claude.js`**

```js
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { config } from '../config.js'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

const VISION_PROMPT = `Это фото страницы учебника или тетради школьника, изучающего немецкий язык на уровне A1. 
Распознай весь текст, включая рукописный. 
Верни ТОЛЬКО валидный JSON без markdown-обёртки в формате:
{
  "words": [{"word_de": "слово", "translation_ru": "перевод", "example_sentence": "пример или null"}],
  "grammar_points": [{"description": "правило", "example": "пример или null"}],
  "example_sentences": ["предложение1"],
  "raw_text": "весь распознанный текст"
}`

// Извлечение слов и грамматики из фото
export async function extractFromPhoto(filepath, mimeType = 'image/jpeg') {
  const imageData = readFileSync(filepath)
  const base64 = imageData.toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
  })

  const text = response.content[0].text.trim()
  return JSON.parse(text)
}

// Объединение результатов нескольких фото и транскрипции в единый конспект
export async function mergeLesson(extractions, transcription = null) {
  const input = JSON.stringify({ extractions, transcription })
  const prompt = `Объедини эти данные из нескольких фото урока немецкого в единый конспект. Убери дубли, нормализуй формы слов (существительные — с артиклем и множественным числом если известно). Верни ТОЛЬКО JSON: {"words": [...], "grammar_points": [...]}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: `${prompt}\n\nДанные:\n${input}` }],
  })

  return JSON.parse(response.content[0].text.trim())
}

const EXERCISES_PROMPT = `На основе слов и грамматики урока немецкого (A1) создай упражнения. Верни ТОЛЬКО JSON массив:
[
  {"type": "flashcard", "word_de": "слово", "payload": {"question": "нем. слово", "answer": "рус. перевод"}},
  {"type": "fill_blank", "word_de": "слово", "payload": {"sentence": "предложение с ___", "blank": "слово", "options": ["вариант1","вариант2","вариант3"]}},
  {"type": "multiple_choice", "word_de": "слово", "payload": {"question": "Переведи: слово", "options": ["вар1","вар2","вар3","вар4"], "correct": 0}}
]
Создай минимум по 1 упражнению каждого типа для каждого слова.`

// Генерация упражнений на основе конспекта урока
export async function generateExercises(words, grammar_points) {
  const input = JSON.stringify({ words, grammar_points })
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: `${EXERCISES_PROMPT}\n\nКонспект:\n${input}` }],
  })

  return JSON.parse(response.content[0].text.trim())
}
```

- [ ] **Step 4: Создать `backend/src/services/whisper.js`**

```js
import OpenAI from 'openai'
import { createReadStream } from 'fs'
import { config } from '../config.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

// Транскрипция аудиофайла — поддерживает микс немецкого и русского
export async function transcribeAudio(filepath) {
  const response = await openai.audio.transcriptions.create({
    file: createReadStream(filepath),
    model: 'whisper-1',
    language: 'de', // основной язык немецкий, Whisper сам справится с русскими вставками
    response_format: 'text',
  })
  return response
}
```

- [ ] **Step 5: Создать `backend/src/services/processor.js`**

```js
import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises } from './claude.js'
import { transcribeAudio } from './whisper.js'

// Главная функция оркестрации обработки урока
export async function processLesson(lessonId, ownerId) {
  // Помечаем урок как "в обработке"
  await db.query("UPDATE lessons SET status = 'processing' WHERE id = $1", [lessonId])

  try {
    const { rows: mediaFiles } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1',
      [lessonId]
    )

    const photos = mediaFiles.filter(m => m.type === 'photo')
    const audios = mediaFiles.filter(m => m.type === 'audio')

    // 1. Обрабатываем каждое фото через Claude vision
    const photoExtractions = []
    for (const photo of photos) {
      const filepath = join(config.uploadDir, photo.file_path)
      const extraction = await extractFromPhoto(filepath)
      photoExtractions.push(extraction)

      await db.query(
        'UPDATE lesson_media SET processed = true, raw_extraction = $1 WHERE id = $2',
        [JSON.stringify(extraction), photo.id]
      )
    }

    // 2. Транскрипция аудио
    let transcription = null
    for (const audio of audios) {
      const filepath = join(config.uploadDir, audio.file_path)
      transcription = await transcribeAudio(filepath)
      await db.query('UPDATE lesson_media SET processed = true WHERE id = $1', [audio.id])
    }

    // 3. Объединяем в единый конспект
    const consolidated = await mergeLesson(photoExtractions, transcription)

    // 4. Сохраняем слова в БД (ON CONFLICT — обновляем пример если новый)
    for (const word of consolidated.words) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, word_de) DO UPDATE SET example_sentence = EXCLUDED.example_sentence`,
        [lessonId, ownerId, word.word_de, word.translation_ru, word.example_sentence || null]
      )
    }

    // Сохраняем грамматику
    for (const gp of consolidated.grammar_points) {
      await db.query(
        'INSERT INTO grammar_points (lesson_id, description, example) VALUES ($1, $2, $3)',
        [lessonId, gp.description, gp.example || null]
      )
    }

    // 5. Генерируем упражнения
    const exercises = await generateExercises(consolidated.words, consolidated.grammar_points)

    // Получаем id слов для привязки
    const { rows: wordRows } = await db.query(
      'SELECT id, word_de FROM words WHERE user_id = $1 AND lesson_id = $2',
      [ownerId, lessonId]
    )
    const wordMap = Object.fromEntries(wordRows.map(w => [w.word_de, w.id]))

    for (const ex of exercises) {
      const wordId = wordMap[ex.word_de] || null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
    }

    await db.query("UPDATE lessons SET status = 'done' WHERE id = $1", [lessonId])

    return {
      lessonId,
      wordsCount: consolidated.words.length,
      exercisesCount: exercises.length,
    }
  } catch (err) {
    await db.query("UPDATE lessons SET status = 'error' WHERE id = $1", [lessonId])
    throw err
  }
}
```

- [ ] **Step 6: Создать `backend/src/routes/process.js`**

```js
import { processLesson } from '../services/processor.js'

export async function processRoutes(fastify) {
  fastify.post('/api/lessons/:id/process', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const lessonId = parseInt(request.params.id)
    const ownerId = request.user.id

    // Запускаем обработку синхронно для MVP (для больших уроков можно сделать async с polling)
    const result = await processLesson(lessonId, ownerId)
    return result
  })
}
```

- [ ] **Step 7: Обновить `backend/src/index.js`** — добавить импорт и регистрацию `processRoutes`:

В функцию `registerRoutes` добавить:
```js
import { processRoutes } from './routes/process.js'
// ...в registerRoutes:
await app.register(processRoutes)
```

- [ ] **Step 8: Запустить тест — убедиться что проходит**

```bash
cd backend && npm test test/processor.test.js
```

Ожидаемый вывод: `✓ processor.test.js (1 test) — PASS`

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/ backend/src/routes/process.js backend/test/processor.test.js backend/src/index.js
git commit -m "feat: add Claude vision + Whisper + lesson processor"
```

---

## Task 6: Backend — SRS (SM-2) + упражнения на сегодня

**Files:**
- Create: `backend/src/services/srs.js`
- Create: `backend/src/routes/exercises.js`
- Create: `backend/test/srs.test.js`
- Modify: `backend/src/index.js` — добавить exercises routes

**Interfaces:**
- Consumes: `exercise_attempts`, `exercises` (поля SM-2)
- Produces: `sm2(quality, ef, interval, reps)` → `{ newEf, newInterval, newReps }`; `GET /api/exercises/today` → массив упражнений; `POST /api/exercises/:id/attempt` → `{ correct, nextReviewDate }`

- [ ] **Step 1: Написать failing тест**

`backend/test/srs.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { sm2 } from '../src/services/srs.js'

describe('SM-2 алгоритм', () => {
  it('первое правильное повторение (quality=5): interval=1, reps=1', () => {
    const result = sm2(5, 2.5, 0, 0)
    expect(result.newReps).toBe(1)
    expect(result.newInterval).toBe(1)
    expect(result.newEf).toBeGreaterThanOrEqual(2.5)
  })

  it('второе правильное повторение: interval=6', () => {
    const result = sm2(5, 2.5, 1, 1)
    expect(result.newReps).toBe(2)
    expect(result.newInterval).toBe(6)
  })

  it('третье повторение: interval = предыдущий * EF', () => {
    const result = sm2(4, 2.5, 6, 2)
    expect(result.newReps).toBe(3)
    expect(result.newInterval).toBe(Math.round(6 * 2.5))
  })

  it('неправильный ответ (quality < 3): сброс reps, interval=1', () => {
    const result = sm2(1, 2.5, 6, 3)
    expect(result.newReps).toBe(0)
    expect(result.newInterval).toBe(1)
  })

  it('EF не опускается ниже 1.3', () => {
    const result = sm2(0, 1.3, 0, 0)
    expect(result.newEf).toBeGreaterThanOrEqual(1.3)
  })
})
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

```bash
cd backend && npm test test/srs.test.js
```

Ожидаемый вывод: `FAIL — cannot find module '../src/services/srs.js'`

- [ ] **Step 3: Создать `backend/src/services/srs.js`**

```js
// Реализация алгоритма SuperMemo SM-2
// quality: 0-5 (0-2 = неверно/тяжело, 3-5 = верно с разной лёгкостью)
export function sm2(quality, easinessFactor, interval, repetitions) {
  let newEf = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEf < 1.3) newEf = 1.3

  let newReps, newInterval

  if (quality < 3) {
    // Неверный ответ — начинаем сначала
    newReps = 0
    newInterval = 1
  } else {
    newReps = repetitions + 1
    if (newReps === 1) {
      newInterval = 1
    } else if (newReps === 2) {
      newInterval = 6
    } else {
      newInterval = Math.round(interval * newEf)
    }
  }

  return { newEf: parseFloat(newEf.toFixed(2)), newInterval, newReps }
}
```

- [ ] **Step 4: Запустить unit-тест SM-2**

```bash
cd backend && npm test test/srs.test.js
```

Ожидаемый вывод: `✓ srs.test.js (5 tests) — PASS`

- [ ] **Step 5: Создать `backend/src/routes/exercises.js`**

```js
import { db } from '../db/index.js'
import { sm2 } from '../services/srs.js'

export async function exercisesRoutes(fastify) {
  // Упражнения на сегодня (из SRS очереди)
  fastify.get('/api/exercises/today', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const today = new Date().toISOString().slice(0, 10)

    // Упражнения привязаны к урокам пользователя (owner) или к студенту
    const { rows } = await db.query(
      `SELECT e.*, w.word_de, w.translation_ru
       FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       LEFT JOIN words w ON w.id = e.word_id
       WHERE l.owner_id = $1
         AND e.next_review_date <= $2
       ORDER BY e.next_review_date ASC
       LIMIT 50`,
      [userId, today]
    )
    return rows
  })

  // Личный словарь
  fastify.get('/api/words', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const { status } = request.query

    let query = 'SELECT w.*, l.title AS lesson_title FROM words w LEFT JOIN lessons l ON l.id = w.lesson_id WHERE w.user_id = $1'
    const params = [userId]

    if (status) {
      query += ' AND w.status = $2'
      params.push(status)
    }

    query += ' ORDER BY w.next_review_date ASC, w.created_at DESC'
    const { rows } = await db.query(query, params)
    return rows
  })

  // Обновить статус слова вручную
  fastify.patch('/api/words/:id', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['new', 'learning', 'known'] } },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const { status } = request.body
    const userId = request.user.id

    const { rows } = await db.query(
      'UPDATE words SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [status, id, userId]
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Слово не найдено' })
    return rows[0]
  })

  // Ответ на упражнение + обновление SRS
  fastify.post('/api/exercises/:id/attempt', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['userAnswer', 'quality'],
        properties: {
          userAnswer: { type: 'string' },
          quality: { type: 'integer', minimum: 0, maximum: 5 },
        },
      },
    },
  }, async (request, reply) => {
    const exerciseId = parseInt(request.params.id)
    const { userAnswer, quality } = request.body
    const userId = request.user.id

    const { rows: exRows } = await db.query(
      'SELECT * FROM exercises WHERE id = $1',
      [exerciseId]
    )
    if (!exRows[0]) return reply.status(404).send({ error: 'Упражнение не найдено' })

    const ex = exRows[0]
    const isCorrect = quality >= 3

    // Обновляем SRS для упражнения
    const { newEf, newInterval, newReps } = sm2(
      quality,
      parseFloat(ex.easiness_factor),
      ex.interval_days,
      ex.repetitions
    )

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + newInterval)
    const nextReviewDate = nextReview.toISOString().slice(0, 10)

    await db.query(
      `UPDATE exercises
       SET easiness_factor = $1, interval_days = $2, repetitions = $3, next_review_date = $4
       WHERE id = $5`,
      [newEf, newInterval, newReps, nextReviewDate, exerciseId]
    )

    // Также обновляем слово если оно привязано
    if (ex.word_id) {
      const wordStatus = newReps >= 5 ? 'known' : newReps >= 1 ? 'learning' : 'new'
      await db.query(
        `UPDATE words
         SET easiness_factor = $1, interval_days = $2, repetitions = $3,
             next_review_date = $4, status = $5
         WHERE id = $6`,
        [newEf, newInterval, newReps, nextReviewDate, wordStatus, ex.word_id]
      )
    }

    // Записываем попытку
    await db.query(
      'INSERT INTO exercise_attempts (exercise_id, user_id, user_answer, is_correct, quality) VALUES ($1, $2, $3, $4, $5)',
      [exerciseId, userId, userAnswer, isCorrect, quality]
    )

    return { correct: isCorrect, nextReviewDate }
  })
}
```

- [ ] **Step 6: Обновить `backend/src/index.js`** — добавить exercises routes:

```js
import { exercisesRoutes } from './routes/exercises.js'
// в registerRoutes:
await app.register(exercisesRoutes)
```

- [ ] **Step 7: Запустить все тесты**

```bash
cd backend && npm test
```

Ожидаемый вывод: `✓ 4 test files passed`

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/srs.js backend/src/routes/exercises.js backend/test/srs.test.js backend/src/index.js
git commit -m "feat: add SM-2 SRS algorithm and exercise routes"
```

---

## Task 7: Frontend — scaffolding, auth, API client

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/store/auth.js`
- Create: `frontend/src/pages/Login.jsx`
- Create: `frontend/src/pages/Register.jsx`
- Create: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Produces: `api.get/post/patch(url, body?)` → данные; `useAuthStore()` → `{ user, token, login, logout }`; `<ProtectedRoute>` — редирект на /login если нет токена.

- [ ] **Step 1: Создать `frontend/package.json`**

```json
{
  "name": "german-learning-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.21.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Создать `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Немецкий — учебные упражнения',
        short_name: 'Deutsch',
        description: 'Закрепление немецкого языка',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8090',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
})
```

- [ ] **Step 3: Создать `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Немецкий — упражнения</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Создать `frontend/src/api/client.js`**

```js
// Централизованный API клиент с автоматической подстановкой JWT
const BASE = '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Ошибка сервера')
  }

  return res.json()
}

// Загрузка файлов — отдельная функция без Content-Type (браузер выставит multipart)
export async function uploadFiles(url, formData) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Ошибка загрузки')
  }
  return res.json()
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
}
```

- [ ] **Step 5: Создать `frontend/src/store/auth.js`**

```js
import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  login: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
  },
}))
```

- [ ] **Step 6: Создать `frontend/src/pages/Login.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await api.post('/auth/login', { email, password })
      login(token, user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Войти</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email<br />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Пароль<br />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 12, fontSize: 16, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {loading ? 'Вход...' : 'Войти'}
        </button>
      </form>
      <p>Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
    </div>
  )
}
```

- [ ] **Step 7: Создать `frontend/src/pages/Register.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await api.post('/auth/register', { email, password, role })
      login(token, user)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Регистрация</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email<br />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Пароль (мин. 8 символов)<br />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} style={{ width: '100%', padding: 8, fontSize: 16 }} />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Роль<br />
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width: '100%', padding: 8, fontSize: 16 }}>
              <option value="student">Ученик</option>
              <option value="owner">Учитель / Родитель</option>
            </select>
          </label>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 12, fontSize: 16, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
      </form>
      <p>Уже есть аккаунт? <Link to="/login">Войти</Link></p>
    </div>
  )
}
```

- [ ] **Step 8: Создать `frontend/src/components/Layout.jsx`**

```jsx
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

const navStyle = { display: 'flex', gap: 16, padding: '12px 24px', backgroundColor: '#4f46e5', alignItems: 'center' }
const linkStyle = { color: '#fff', textDecoration: 'none', fontSize: 15 }

export default function Layout({ children }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div>
      <nav style={navStyle}>
        <Link to="/" style={{ ...linkStyle, fontWeight: 700, marginRight: 'auto' }}>Deutsch 🇩🇪</Link>
        <Link to="/" style={linkStyle}>Сегодня</Link>
        <Link to="/lessons" style={linkStyle}>Уроки</Link>
        <Link to="/vocabulary" style={linkStyle}>Словарь</Link>
        {user?.role === 'owner' && <Link to="/lessons/new" style={linkStyle}>+ Урок</Link>}
        <button onClick={handleLogout}
          style={{ background: 'none', border: '1px solid #fff', color: '#fff', padding: '4px 12px', borderRadius: 4, cursor: 'pointer' }}>
          Выйти
        </button>
      </nav>
      <main style={{ maxWidth: 800, margin: '24px auto', padding: '0 16px' }}>
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 9: Создать `frontend/src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.js'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LessonList from './pages/LessonList.jsx'
import NewLesson from './pages/NewLesson.jsx'
import ExerciseSession from './pages/ExerciseSession.jsx'
import Vocabulary from './pages/Vocabulary.jsx'
import Layout from './components/Layout.jsx'

function ProtectedRoute({ children }) {
  const { token } = useAuthStore()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/lessons" element={<ProtectedRoute><Layout><LessonList /></Layout></ProtectedRoute>} />
        <Route path="/lessons/new" element={<ProtectedRoute><Layout><NewLesson /></Layout></ProtectedRoute>} />
        <Route path="/exercise-session" element={<ProtectedRoute><Layout><ExerciseSession /></Layout></ProtectedRoute>} />
        <Route path="/vocabulary" element={<ProtectedRoute><Layout><Vocabulary /></Layout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 10: Создать `frontend/src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 11: Создать `frontend/src/test-setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 12: Установить зависимости**

```bash
cd frontend && npm install
```

- [ ] **Step 13: Проверить что сборка работает**

```bash
cd frontend && npm run build
```

Ожидаемый вывод: `✓ built in Xs`, файлы в `dist/`

- [ ] **Step 14: Commit**

```bash
git add frontend/
git commit -m "feat: add React PWA scaffolding with auth pages and API client"
```

---

## Task 8: Frontend — Dashboard + ExerciseSession

**Files:**
- Create: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/pages/ExerciseSession.jsx`
- Create: `frontend/src/components/Flashcard.jsx`
- Create: `frontend/src/components/FillBlank.jsx`
- Create: `frontend/src/components/MultipleChoice.jsx`
- Create: `frontend/src/components/ProgressBar.jsx`

**Interfaces:**
- Consumes: `GET /api/exercises/today`, `POST /api/exercises/:id/attempt`
- Produces: полный цикл прохождения упражнения на сегодня

- [ ] **Step 1: Создать `frontend/src/components/ProgressBar.jsx`**

```jsx
export default function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#666' }}>
        <span>{current} из {total}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#4f46e5', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Создать `frontend/src/components/Flashcard.jsx`**

```jsx
import { useState } from 'react'

const cardStyle = {
  minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', border: '2px solid #e5e7eb', borderRadius: 12,
  padding: 32, cursor: 'pointer', backgroundColor: '#fafafa', marginBottom: 16,
}

export default function Flashcard({ payload, onAnswer }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div>
      <div style={cardStyle} onClick={() => setRevealed(true)}>
        <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{payload.question}</div>
        {revealed
          ? <div style={{ fontSize: 24, color: '#4f46e5' }}>{payload.answer}</div>
          : <div style={{ color: '#9ca3af', fontSize: 14 }}>Нажмите чтобы показать ответ</div>}
      </div>
      {revealed && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onAnswer(1)} style={{ flex: 1, padding: 12, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>Не помню</button>
          <button onClick={() => onAnswer(3)} style={{ flex: 1, padding: 12, backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>С трудом</button>
          <button onClick={() => onAnswer(5)} style={{ flex: 1, padding: 12, backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>Помню!</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Создать `frontend/src/components/FillBlank.jsx`**

```jsx
import { useState } from 'react'

export default function FillBlank({ payload, onAnswer }) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const correct = answer.trim().toLowerCase() === payload.blank.toLowerCase()

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!answer.trim()) return
    setSubmitted(true)
  }

  const handleNext = () => {
    onAnswer(correct ? 5 : 1, answer)
  }

  const parts = payload.sentence.split('___')

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <p style={{ fontSize: 20, marginBottom: 16 }}>
        {parts[0]}<strong style={{ color: submitted ? (correct ? '#10b981' : '#ef4444') : '#4f46e5' }}>
          {submitted ? answer || '___' : '___'}
        </strong>{parts[1]}
      </p>
      {!submitted ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
          <input value={answer} onChange={e => setAnswer(e.target.value)}
            placeholder="Введите слово..."
            autoFocus
            style={{ flex: 1, padding: 10, fontSize: 16, border: '1px solid #d1d5db', borderRadius: 6 }} />
          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Проверить
          </button>
        </form>
      ) : (
        <div>
          {correct
            ? <p style={{ color: '#10b981', fontWeight: 600 }}>Верно! ✓</p>
            : <p style={{ color: '#ef4444' }}>Неверно. Правильно: <strong>{payload.blank}</strong></p>}
          <button onClick={handleNext} style={{ marginTop: 8, padding: '10px 24px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Далее →
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Создать `frontend/src/components/MultipleChoice.jsx`**

```jsx
import { useState } from 'react'

export default function MultipleChoice({ payload, onAnswer }) {
  const [selected, setSelected] = useState(null)

  const handleSelect = (idx) => {
    if (selected !== null) return
    setSelected(idx)
    setTimeout(() => onAnswer(idx === payload.correct ? 5 : 1), 1000)
  }

  const getStyle = (idx) => {
    const base = { padding: 12, marginBottom: 8, borderRadius: 8, cursor: 'pointer', border: '2px solid', width: '100%', textAlign: 'left', fontSize: 16 }
    if (selected === null) return { ...base, borderColor: '#d1d5db', backgroundColor: '#fff' }
    if (idx === payload.correct) return { ...base, borderColor: '#10b981', backgroundColor: '#d1fae5' }
    if (idx === selected) return { ...base, borderColor: '#ef4444', backgroundColor: '#fee2e2' }
    return { ...base, borderColor: '#d1d5db', backgroundColor: '#f9fafb' }
  }

  return (
    <div style={{ border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <p style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{payload.question}</p>
      {payload.options.map((opt, idx) => (
        <button key={idx} style={getStyle(idx)} onClick={() => handleSelect(idx)}>
          {opt}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Создать `frontend/src/pages/Dashboard.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'

export default function Dashboard() {
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/exercises/today')
      .then(setExercises)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Загрузка...</p>

  return (
    <div>
      <h1>На сегодня</h1>
      {exercises.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <p style={{ fontSize: 24 }}>🎉 Всё выучено на сегодня!</p>
          <p style={{ color: '#666' }}>Возвращайся завтра для повторения.</p>
        </div>
      ) : (
        <div>
          <p style={{ color: '#666', marginBottom: 24 }}>
            {exercises.length} упражнений ждут повторения
          </p>
          <button
            onClick={() => navigate('/exercise-session')}
            style={{ padding: '16px 32px', fontSize: 18, backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Начать повторение →
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Создать `frontend/src/pages/ExerciseSession.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import Flashcard from '../components/Flashcard.jsx'
import FillBlank from '../components/FillBlank.jsx'
import MultipleChoice from '../components/MultipleChoice.jsx'
import ProgressBar from '../components/ProgressBar.jsx'

export default function ExerciseSession() {
  const [exercises, setExercises] = useState([])
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/exercises/today')
      .then(setExercises)
      .finally(() => setLoading(false))
  }, [])

  const handleAnswer = async (quality, userAnswer = '') => {
    const ex = exercises[current]
    await api.post(`/exercises/${ex.id}/attempt`, { userAnswer: String(userAnswer), quality })

    const next = current + 1
    if (next >= exercises.length) {
      navigate('/')
    } else {
      setCurrent(next)
      setDone(d => d + 1)
    }
  }

  if (loading) return <p>Загрузка упражнений...</p>
  if (exercises.length === 0) { navigate('/'); return null }

  const ex = exercises[current]

  return (
    <div>
      <ProgressBar current={done} total={exercises.length} />
      <div style={{ marginBottom: 8, color: '#888', fontSize: 13 }}>
        {ex.type === 'flashcard' ? 'Флеш-карта' : ex.type === 'fill_blank' ? 'Заполни пропуск' : 'Выбери ответ'}
      </div>
      {ex.type === 'flashcard' && <Flashcard payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'fill_blank' && <FillBlank payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'multiple_choice' && <MultipleChoice payload={ex.payload} onAnswer={handleAnswer} />}
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/ExerciseSession.jsx frontend/src/components/
git commit -m "feat: add exercise session UI with flashcard/fill-blank/multiple-choice"
```

---

## Task 9: Frontend — NewLesson + LessonList + Vocabulary

**Files:**
- Create: `frontend/src/pages/NewLesson.jsx`
- Create: `frontend/src/pages/LessonList.jsx`
- Create: `frontend/src/pages/Vocabulary.jsx`
- Create: `frontend/src/components/UploadZone.jsx`

**Interfaces:**
- Consumes: `POST /api/lessons`, `POST /api/lessons/:id/media`, `POST /api/lessons/:id/process`, `GET /api/lessons`, `GET /api/words`, `PATCH /api/words/:id`

- [ ] **Step 1: Создать `frontend/src/components/UploadZone.jsx`**

```jsx
import { useRef, useState } from 'react'

export default function UploadZone({ onFilesSelected, accept = 'image/*', multiple = true, label = 'Перетащите файлы или нажмите для выбора' }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    onFilesSelected(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? '#4f46e5' : '#d1d5db'}`,
        borderRadius: 12, padding: 40, textAlign: 'center',
        cursor: 'pointer', backgroundColor: dragging ? '#eef2ff' : '#fafafa',
        marginBottom: 16, transition: 'all 0.2s',
      }}>
      <p style={{ margin: 0, color: '#6b7280' }}>{label}</p>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => onFilesSelected(Array.from(e.target.files))} />
    </div>
  )
}
```

- [ ] **Step 2: Создать `frontend/src/pages/NewLesson.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import UploadZone from '../components/UploadZone.jsx'

export default function NewLesson() {
  const [title, setTitle] = useState('')
  const [photos, setPhotos] = useState([])
  const [audios, setAudios] = useState([])
  const [status, setStatus] = useState('idle') // idle | creating | uploading | processing | done | error
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      // 1. Создаём урок
      setStatus('creating')
      const lesson = await api.post('/lessons', {
        title: title || `Урок ${new Date().toLocaleDateString('ru')}`,
        date: new Date().toISOString().slice(0, 10),
      })

      // 2. Загружаем фото
      setStatus('uploading')
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(f => fd.append('files', f))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }

      // 3. Загружаем аудио
      if (audios.length > 0) {
        const fd = new FormData()
        audios.forEach(f => fd.append('files', f))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }

      // 4. Запускаем обработку
      setStatus('processing')
      await api.post(`/lessons/${lesson.id}/process`, {})

      setStatus('done')
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const statusMessages = {
    creating: 'Создаём урок...',
    uploading: 'Загружаем файлы...',
    processing: 'Claude обрабатывает урок... (может занять 1-2 минуты)',
    done: '✓ Готово! Упражнения созданы.',
    error: '',
  }

  return (
    <div>
      <h1>Новый урок</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label>Тема урока (необязательно)<br />
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Например: Приветствия, числа 1-10..."
              style={{ width: '100%', padding: 8, fontSize: 16, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 6 }} />
          </label>
        </div>

        <h3>Фото учебника / тетради</h3>
        <UploadZone
          onFilesSelected={setPhotos}
          accept="image/*"
          label="Перетащите фото или нажмите для выбора (можно несколько)" />
        {photos.length > 0 && (
          <p style={{ color: '#4f46e5', marginBottom: 8 }}>Выбрано фото: {photos.length}</p>
        )}

        <h3>Аудиозапись урока (необязательно)</h3>
        <UploadZone
          onFilesSelected={setAudios}
          accept="audio/*"
          multiple={false}
          label="Перетащите аудиофайл или нажмите для выбора" />
        {audios.length > 0 && (
          <p style={{ color: '#4f46e5', marginBottom: 8 }}>Аудио: {audios[0].name}</p>
        )}

        {status !== 'idle' && status !== 'error' && (
          <p style={{ color: status === 'done' ? '#10b981' : '#4f46e5', fontWeight: 600 }}>
            {statusMessages[status]}
          </p>
        )}
        {error && <p style={{ color: '#ef4444' }}>{error}</p>}

        <button type="submit" disabled={photos.length === 0 || status !== 'idle'}
          style={{ padding: '14px 32px', fontSize: 16, backgroundColor: photos.length === 0 ? '#d1d5db' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: photos.length === 0 ? 'not-allowed' : 'pointer' }}>
          Обработать урок
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Создать `frontend/src/pages/LessonList.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const statusLabel = { pending: 'Ожидает', processing: '⏳ Обработка...', done: '✓ Готов', error: '✗ Ошибка' }
const statusColor = { pending: '#9ca3af', processing: '#f59e0b', done: '#10b981', error: '#ef4444' }

export default function LessonList() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/lessons').then(setLessons).finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Загрузка...</p>

  return (
    <div>
      <h1>Уроки</h1>
      {lessons.length === 0 ? (
        <p style={{ color: '#666' }}>Уроков пока нет. Загрузите первый урок!</p>
      ) : (
        <div>
          {lessons.map(lesson => (
            <div key={lesson.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{lesson.title || `Урок от ${new Date(lesson.date).toLocaleDateString('ru')}`}</h3>
                  <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                    {new Date(lesson.date).toLocaleDateString('ru')} · {lesson.media_count} файлов
                  </p>
                </div>
                <span style={{ color: statusColor[lesson.status], fontWeight: 600, fontSize: 13 }}>
                  {statusLabel[lesson.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Создать `frontend/src/pages/Vocabulary.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

const STATUS_LABELS = { new: 'Новое', learning: 'Изучается', known: 'Выучено' }
const STATUS_COLORS = { new: '#6b7280', learning: '#f59e0b', known: '#10b981' }

export default function Vocabulary() {
  const [words, setWords] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = filter ? `/words?status=${filter}` : '/words'
    api.get(url).then(setWords).finally(() => setLoading(false))
  }, [filter])

  const updateStatus = async (wordId, status) => {
    const updated = await api.patch(`/words/${wordId}`, { status })
    setWords(ws => ws.map(w => w.id === updated.id ? updated : w))
  }

  if (loading) return <p>Загрузка словаря...</p>

  return (
    <div>
      <h1>Словарь</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['', 'new', 'learning', 'known'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '6px 16px', borderRadius: 20, border: '1px solid #d1d5db',
              backgroundColor: filter === s ? '#4f46e5' : '#fff',
              color: filter === s ? '#fff' : '#374151', cursor: 'pointer' }}>
            {s === '' ? 'Все' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <p style={{ color: '#666', marginBottom: 16 }}>{words.length} слов</p>
      <div>
        {words.map(word => (
          <div key={word.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ flex: 1 }}>
              <strong>{word.word_de}</strong>
              <span style={{ color: '#6b7280', marginLeft: 12 }}>{word.translation_ru}</span>
              {word.example_sentence && (
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}><em>{word.example_sentence}</em></div>
              )}
            </div>
            <select
              value={word.status}
              onChange={e => updateStatus(word.id, e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db',
                color: STATUS_COLORS[word.status], fontWeight: 600, fontSize: 13 }}>
              <option value="new">Новое</option>
              <option value="learning">Изучается</option>
              <option value="known">Выучено</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Проверить сборку**

```bash
cd frontend && npm run build
```

Ожидаемый вывод: без ошибок TypeScript/build.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ frontend/src/components/UploadZone.jsx
git commit -m "feat: add NewLesson, LessonList, Vocabulary pages"
```

---

## Task 10: Интеграционный запуск + финальная проверка

**Files:**
- Create: `.env` (из `.env.example` — не коммитить!)
- Modify: `backend/src/db/migrations/run.js` — убедиться что `export` корректен

**Interfaces:**
- Produces: работающее приложение на http://localhost:8090 (backend) и http://localhost:8091 (frontend)

- [ ] **Step 1: Создать `.env` с реальными ключами**

```bash
cp .env.example .env
# Отредактировать .env — вставить реальные ANTHROPIC_API_KEY, OPENAI_API_KEY, JWT_SECRET
```

- [ ] **Step 2: Поднять приложение**

```bash
docker compose up --build -d
```

Ожидаемый вывод: все 3 контейнера `started`.

- [ ] **Step 3: Проверить миграции**

```bash
docker compose logs backend | grep -E "миграц|applied|error"
```

Ожидаемый вывод: `Применена миграция: 001_users.sql` ... `Все миграции применены.`

- [ ] **Step 4: Smoke test backend**

```bash
curl -s http://localhost:8090/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@test.com","password":"TestPass123!","role":"owner"}' | jq .
```

Ожидаемый вывод: `{ "token": "eyJ...", "user": { "id": 1, "email": "owner@test.com", "role": "owner" } }`

- [ ] **Step 5: Проверить frontend**

Открыть в браузере: http://localhost:8091

Ожидаемый результат: страница логина, навигация работает, форма регистрации принимает данные.

- [ ] **Step 6: Запустить все backend тесты**

```bash
docker compose exec backend npm test
```

Ожидаемый вывод: `✓ 4 test files, все PASS`

- [ ] **Step 7: Финальный commit**

```bash
git add .
git status  # убедиться что .env НЕ в списке
git commit -m "feat: complete MVP — german learning app with Docker, backend, frontend, SRS"
```

---

## Self-Review против ТЗ

**Spec coverage check:**

| Требование ТЗ | Задача |
|---|---|
| Docker Compose, порты 8090/8091 | Task 1 |
| Порты 3000/5678/8080 не заняты | Task 1 — docker-compose.yml |
| PostgreSQL 16 | Task 1 |
| Регистрация/логин owner+student | Task 3 |
| Загрузка фото/аудио | Task 4 |
| Claude vision → слова/грамматика | Task 5 |
| Whisper транскрипция | Task 5 |
| Объединение конспекта | Task 5 (mergeLesson) |
| Генерация упражнений | Task 5 (generateExercises) |
| Flashcard тип | Task 8 |
| Fill blank тип | Task 8 |
| Multiple choice тип | Task 8 |
| SM-2 алгоритм | Task 6 |
| Очередь SRS на сегодня | Task 6 + 8 |
| Личный словарь | Task 6 + 9 |
| .env не в git | Task 1 + 10 |
| PWA (vite-plugin-pwa) | Task 7 |
| nginx для frontend | Task 1 |
| Файлы в /data/uploads volume | Task 1 + 4 |

**Открытые вопросы из ТЗ (п. 11) — решения в плане:**
1. Backend: Node.js + Fastify ✓
2. Structured output от Claude: промпт "верни ТОЛЬКО JSON" (MVP, достаточно) ✓
3. Оригинальные фото хранятся после обработки ✓ (file_path сохраняется)
4. Один owner + ученики (мультитенантность не нужна) ✓ — `class_id` в схеме есть, но не используется в MVP

**Что НЕ входит в этот план (v1/v2 из ТЗ):**
- Диктант по аудио
- Устный ответ
- Статистика прогресса
- Drag-n-drop составление предложений
