# Наборы фраз — план реализации

> **Для агентов:** ОБЯЗАТЕЛЬНАЯ СУБ-СКИЛЛ: `superpowers:subagent-driven-development` или
> `superpowers:executing-plans` — выполнять задачу за задачей. Шаги отмечать чекбоксами.

**Цель:** в каждом уроке появляется набор из 8–12 фраз, собранных из слов этого урока;
фразы можно слушать подряд и отрабатывать по три шага (слушаю → собираю → говорю).

**Архитектура:** новые таблицы `phrase_topics` / `phrases` / `user_phrase_progress`
(миграция 062). Фразы пишет `gpt-4o` по промпту с эталонами уровня A0/A1, проходят
детерминированный валидатор уровня и существующие гейты. Набор — отдельная карточка
в ряду типов упражнений урока, вне `CORE_EXERCISE_TYPES`, чтобы не сломать зачёт.

**Стек:** Fastify 4 (raw SQL, без ORM), React 18 + Vite, PostgreSQL 16, vitest.
Спека: `docs/superpowers/specs/2026-08-12-nabory-fraz-design.md`.

## Глобальные ограничения

- Общение и комментарии в коде — русский, имена в коде — английский.
- Мультилокаль обязательна: 10 локалей `ru, en, uk, de, fr, ar, bg, tr, es, sq`.
  Строки интерфейса пишутся во все `frontend/src/i18n/*.js` сразу.
- Переводы контента — только `gpt-4o-mini` батчами. Генерация фраз — `gpt-4o`.
- **Любая операция, тратящая OpenAI, запускается только по явной команде Павла.**
  Скрипты по умолчанию печатают план и ничего не меняют.
- `sie/Sie`, `er/sie/es`, `mein/meine` — легитимные слова, не мусор. Не удалять.
- Новый тип НЕ добавлять в `CORE_EXERCISE_TYPES` (`backend/src/services/claude.js:604`).
- Тесты: `cd backend && npm test`, `cd frontend && npm test`.

---

## Структура файлов

**Создаются:**
- `backend/src/db/migrations/062_phrases.sql` — три таблицы.
- `backend/src/services/phraseLevel.js` — детерминированный валидатор уровня A0/A1.
- `backend/src/services/phraseLevel.test.js` — тесты валидатора.
- `backend/src/services/phrases.js` — промпт, разбор ответа модели, сохранение набора.
- `backend/src/services/phrases.test.js` — тесты промпта и разбора.
- `backend/src/routes/phrases.js` — API наборов и прогресса.
- `backend/scripts/backfill-lesson-phrases.mjs` — наборы к существующим урокам.
- `backend/scripts/classify-sentence-topics.mjs` — темы из тетради (отчёт, без записи в БД).
- `frontend/src/pages/PhraseSet.jsx` — экран набора (список + HÖREN/LESEN).
- `frontend/src/components/PhraseTrainer.jsx` — тренажёр из трёх шагов.
- `frontend/src/components/PhraseTrainer.test.jsx` — тест логики шагов.

**Изменяются:**
- `backend/src/index.js` — регистрация роутов.
- `backend/src/services/processor.js` — генерация набора при создании урока.
- `frontend/src/App.jsx` — маршруты `/phrases` и `/phrases/:id`.
- `frontend/src/pages/ExerciseSession.jsx` — карточка «Фразы урока» в ряду типов.
- `frontend/src/i18n/*.js` (10 файлов) — строки интерфейса.

---

### Task 1: Таблицы

**Файлы:**
- Создать: `backend/src/db/migrations/062_phrases.sql`

**Интерфейсы:**
- Отдаёт: таблицы `phrase_topics`, `phrases`, `user_phrase_progress` — на них опираются все
  последующие задачи.

- [ ] **Шаг 1: Написать миграцию**

```sql
-- Наборы фраз: тема (KOCHEN / A1) + её фразы + прогресс ученика по каждой фразе.
-- Существующие phrase_sets (011) — это сохранённые тексты из TextReader, к фразам
-- отношения не имеют и НЕ трогаются. Старый phrasebook (019) переносится отдельно.

CREATE TABLE IF NOT EXISTS phrase_topics (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80)  NOT NULL,
  lang        VARCHAR(5)   NOT NULL,               -- целевой язык: de | en | es
  level       VARCHAR(4)   NOT NULL DEFAULT 'A1',  -- A0 | A1 | A2 | B1 | B2
  title       VARCHAR(120) NOT NULL,               -- на целевом языке: «Kochen»
  title_i18n  JSONB        NOT NULL DEFAULT '{}',  -- переводы названия на 10 локалей
  emoji       VARCHAR(8),
  image_url   TEXT,
  source      VARCHAR(12)  NOT NULL,               -- catalog | lesson | teacher | student
  owner_id    INTEGER REFERENCES users(id)   ON DELETE CASCADE,  -- NULL = общий каталог
  school_id   INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  lesson_id   INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  published   BOOLEAN      NOT NULL DEFAULT FALSE, -- черновик, пока человек не вычитал
  created_at  TIMESTAMPTZ  DEFAULT now()
);
-- Один набор на урок: повторный прогон скрипта не плодит дубли.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phrase_topics_lesson
  ON phrase_topics(lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phrase_topics_owner ON phrase_topics(owner_id);

CREATE TABLE IF NOT EXISTS phrases (
  id           SERIAL PRIMARY KEY,
  topic_id     INTEGER NOT NULL REFERENCES phrase_topics(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  text         TEXT    NOT NULL,                   -- «Ich wasche meine Hände.»
  translations JSONB   NOT NULL DEFAULT '{}',      -- {ru: '…', en: '…'} — 10 локалей
  emoji        VARCHAR(8),
  word_ids     INTEGER[] NOT NULL DEFAULT '{}',    -- слова урока, задействованные во фразе
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phrases_topic ON phrases(topic_id);

CREATE TABLE IF NOT EXISTS user_phrase_progress (
  user_id          INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  phrase_id        INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  step_listen      BOOLEAN NOT NULL DEFAULT FALSE,
  step_build       BOOLEAN NOT NULL DEFAULT FALSE,
  step_speak       BOOLEAN NOT NULL DEFAULT FALSE,
  easiness_factor  NUMERIC(4,2) DEFAULT 2.5,
  interval_days    INTEGER      DEFAULT 0,
  repetitions      INTEGER      DEFAULT 0,
  next_review_date DATE         DEFAULT CURRENT_DATE,
  updated_at       TIMESTAMPTZ  DEFAULT now(),
  PRIMARY KEY (user_id, phrase_id)
);
CREATE INDEX IF NOT EXISTS idx_user_phrase_progress_review
  ON user_phrase_progress(user_id, next_review_date);
```

- [ ] **Шаг 2: Применить миграцию локально**

Запуск: `cd backend && npm run migrate`
Ожидается: в выводе строка про `062_phrases.sql`, без ошибок.

- [ ] **Шаг 3: Проверить, что таблицы созданы**

Запуск: `cd backend && node -e "import('./src/db/index.js').then(async ({db})=>{const r=await db.query(\"SELECT tablename FROM pg_tables WHERE tablename LIKE 'phrase%' OR tablename='user_phrase_progress' ORDER BY 1\");console.log(r.rows);process.exit(0)})"`
Ожидается: `phrase_sets`, `phrase_topics`, `phrases`, `user_phrase_progress`.

- [ ] **Шаг 4: Коммит**

```bash
git add backend/src/db/migrations/062_phrases.sql
git commit -m "feat(db): таблицы наборов фраз (миграция 062)"
```

---

### Task 2: Валидатор уровня A0/A1

Модель на слово «A1» реагирует вольно и выдаёт придаточные и Perfekt. Проверка
детерминированная, без ИИ: не прошло — фраза не сохраняется.

**Файлы:**
- Создать: `backend/src/services/phraseLevel.js`
- Тест: `backend/src/services/phraseLevel.test.js`

**Интерфейсы:**
- Отдаёт: `checkPhraseLevel(text, level = 'A1') → string[]` (пустой массив = годится),
  `isAcceptablePhrase(text, level) → boolean`. Используется в Task 3 и Task 4.

- [ ] **Шаг 1: Написать падающий тест**

```javascript
// backend/src/services/phraseLevel.test.js
import { describe, it, expect } from 'vitest'
import { checkPhraseLevel, isAcceptablePhrase } from './phraseLevel.js'

describe('checkPhraseLevel A1', () => {
  it('пропускает простую фразу настоящего времени', () => {
    expect(checkPhraseLevel('Ich wasche meine Hände.', 'A1')).toEqual([])
    expect(checkPhraseLevel('Ich koche Suppe im Topf.', 'A1')).toEqual([])
  })

  it('бракует придаточное с союзом', () => {
    const r = checkPhraseLevel('Nachdem ich gekocht hatte, esse ich.', 'A1')
    expect(r.length).toBeGreaterThan(0)
    expect(r.join(' ')).toMatch(/придаточ/)
  })

  it('бракует запятую — на A1 фраза одна и простая', () => {
    expect(checkPhraseLevel('Ich koche, und du isst.', 'A1').join(' ')).toMatch(/запят/)
  })

  it('бракует прошедшее время (Perfekt)', () => {
    expect(checkPhraseLevel('Ich habe Suppe gekocht.', 'A1').join(' ')).toMatch(/прошед/)
  })

  it('бракует слишком длинную фразу', () => {
    const long = 'Ich gehe heute mit meiner Familie in die große Küche neben dem Garten.'
    expect(checkPhraseLevel(long, 'A1').join(' ')).toMatch(/длин/)
  })

  it('бракует пустую строку и текст без конечной точки', () => {
    expect(checkPhraseLevel('', 'A1').length).toBeGreaterThan(0)
    expect(checkPhraseLevel('Ich koche Suppe', 'A1').join(' ')).toMatch(/точк/)
  })

  it('на B1 придаточные разрешены', () => {
    expect(checkPhraseLevel('Ich glaube, dass er kommt.', 'B1')).toEqual([])
  })

  it('isAcceptablePhrase — короткая обёртка', () => {
    expect(isAcceptablePhrase('Ich koche Suppe im Topf.', 'A1')).toBe(true)
    expect(isAcceptablePhrase('Ich habe Suppe gekocht.', 'A1')).toBe(false)
  })
})
```

- [ ] **Шаг 2: Запустить тест — должен упасть**

Запуск: `cd backend && npx vitest run src/services/phraseLevel.test.js`
Ожидается: FAIL, `Cannot find module './phraseLevel.js'`.

- [ ] **Шаг 3: Написать реализацию**

```javascript
// backend/src/services/phraseLevel.js
// Проверка, что фраза соответствует уровню. Детерминированно, без ИИ: модель
// на слово «A1» реагирует вольно, поэтому рамки задаём кодом, а не просьбой в промпте.

// Союзы, вводящие придаточное — на A0/A1 их не бывает
const SUBORDINATE = /\b(dass|weil|wenn|obwohl|nachdem|bevor|während|damit|falls|sobald|seitdem|ob)\b/i
// Вспомогательные глаголы Perfekt/Präteritum рядом с причастием
const PAST = /\b(habe|hast|hat|haben|habt|bin|bist|ist|sind|seid|war|warst|waren|hatte|hatten)\b[^.!?]*\bge\w+(t|en)\b/i
const PAST_SIMPLE = /\b(war|waren|warst|hatte|hatten|hattest|ging|kam|machte|sagte)\b/i

const LIMITS = {
  A0: { maxWords: 6, allowSubordinate: false, allowPast: false, allowComma: false },
  A1: { maxWords: 9, allowSubordinate: false, allowPast: false, allowComma: false },
  A2: { maxWords: 12, allowSubordinate: false, allowPast: true,  allowComma: true  },
  B1: { maxWords: 18, allowSubordinate: true,  allowPast: true,  allowComma: true  },
  B2: { maxWords: 25, allowSubordinate: true,  allowPast: true,  allowComma: true  },
}

export function checkPhraseLevel(text, level = 'A1') {
  const problems = []
  const s = String(text || '').trim()
  const lim = LIMITS[level] || LIMITS.A1

  if (!s) return ['пустая фраза']
  if (!/[.!?]$/.test(s)) problems.push('нет точки в конце')
  if (/[Ѐ-ӿ]/.test(s)) problems.push('кириллица в целевом языке')

  const words = s.split(/\s+/).filter(Boolean)
  if (words.length > lim.maxWords) problems.push(`слишком длинная: ${words.length} слов при пределе ${lim.maxWords}`)
  if (words.length < 3) problems.push('слишком короткая: меньше трёх слов')

  if (!lim.allowSubordinate && SUBORDINATE.test(s)) problems.push('придаточное предложение — не для этого уровня')
  if (!lim.allowComma && s.includes(',')) problems.push('запятая: на этом уровне фраза одна и простая')
  if (!lim.allowPast && (PAST.test(s) || PAST_SIMPLE.test(s))) problems.push('прошедшее время — не для этого уровня')

  return problems
}

export function isAcceptablePhrase(text, level = 'A1') {
  return checkPhraseLevel(text, level).length === 0
}
```

- [ ] **Шаг 4: Запустить тест — должен пройти**

Запуск: `cd backend && npx vitest run src/services/phraseLevel.test.js`
Ожидается: PASS, 8 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add backend/src/services/phraseLevel.js backend/src/services/phraseLevel.test.js
git commit -m "feat(phrases): детерминированный валидатор уровня фразы"
```

---

### Task 3: Генерация набора фраз

**Файлы:**
- Создать: `backend/src/services/phrases.js`
- Тест: `backend/src/services/phrases.test.js`

**Интерфейсы:**
- Потребляет: `checkPhraseLevel` из Task 2; `ask`-подобный вызов OpenAI из
  `backend/src/services/claude.js` (`platformClient`, `trackUsage`).
- Отдаёт:
  - `buildPhrasePrompt({ words, level, langName }) → string`
  - `parsePhrasesResponse(text) → { title, emoji, phrases: [{text, emoji, words}] }`
  - `validatePhrases(parsed, { level, wordIndex }) → { good: [...], rejected: [{text, problems}] }`
  - `generateLessonPhrases(lessonId, { level = 'A1', client }) → { topicId, saved, rejected }`

- [ ] **Шаг 1: Написать падающий тест**

```javascript
// backend/src/services/phrases.test.js
import { describe, it, expect } from 'vitest'
import { buildPhrasePrompt, parsePhrasesResponse, validatePhrases } from './phrases.js'

describe('buildPhrasePrompt', () => {
  const words = [{ word_de: 'die Küche', translation_ru: 'кухня' }, { word_de: 'kochen', translation_ru: 'готовить' }]

  it('кладёт в промпт эталоны — пример сильнее инструкции', () => {
    const p = buildPhrasePrompt({ words, level: 'A1', langName: 'Deutsch' })
    expect(p).toContain('Ich wasche meine Hände.')
    expect(p).toContain('die Küche')
    expect(p).toContain('A1')
  })

  it('просит меньше фраз, когда слов мало', () => {
    const p = buildPhrasePrompt({ words: words.slice(0, 1), level: 'A1', langName: 'Deutsch' })
    expect(p).toMatch(/5|шесть|6/)
  })
})

describe('parsePhrasesResponse', () => {
  it('разбирает ответ модели', () => {
    const raw = JSON.stringify({
      title: 'Kochen', emoji: '🍲',
      phrases: [
        { text: 'Ich gehe in die Küche.', emoji: '🏠', words: ['die Küche'] },
        { text: 'Ich koche Suppe.', emoji: '🍲', words: ['kochen'] },
      ],
    })
    const r = parsePhrasesResponse(raw)
    expect(r.title).toBe('Kochen')
    expect(r.phrases).toHaveLength(2)
    expect(r.phrases[0].text).toBe('Ich gehe in die Küche.')
  })

  it('переживает обёртку в ```json', () => {
    const raw = '```json\n{"title":"Kochen","phrases":[{"text":"Ich koche Suppe."}]}\n```'
    expect(parsePhrasesResponse(raw).phrases).toHaveLength(1)
  })

  it('возвращает пустой набор на мусоре вместо падения', () => {
    expect(parsePhrasesResponse('не json').phrases).toEqual([])
  })
})

describe('validatePhrases', () => {
  const wordIndex = new Map([['die küche', 11], ['kochen', 22]])

  it('отбрасывает фразы не по уровню и связывает слова урока', () => {
    const parsed = { title: 'Kochen', phrases: [
      { text: 'Ich koche Suppe im Topf.', words: ['kochen'] },
      { text: 'Nachdem ich gekocht hatte, esse ich.', words: ['kochen'] },
    ]}
    const r = validatePhrases(parsed, { level: 'A1', wordIndex })
    expect(r.good).toHaveLength(1)
    expect(r.good[0].word_ids).toEqual([22])
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].problems.join(' ')).toMatch(/придаточ/)
  })

  it('не пропускает дубликаты фраз', () => {
    const parsed = { title: 'Kochen', phrases: [
      { text: 'Ich koche Suppe.', words: [] },
      { text: 'Ich koche Suppe.', words: [] },
    ]}
    expect(validatePhrases(parsed, { level: 'A1', wordIndex }).good).toHaveLength(1)
  })
})
```

- [ ] **Шаг 2: Запустить тест — должен упасть**

Запуск: `cd backend && npx vitest run src/services/phrases.test.js`
Ожидается: FAIL, `Cannot find module './phrases.js'`.

- [ ] **Шаг 3: Написать реализацию**

```javascript
// backend/src/services/phrases.js
// Наборы фраз к уроку: промпт с эталонами уровня, разбор ответа, валидация, сохранение.
// Генерация — gpt-4o (набор увидит вся школа, пишется один раз), переводы — gpt-4o-mini.
import { db } from '../db/index.js'
import { platformClient } from './openaiClient.js'
import { trackUsage } from './claude.js'
import { checkPhraseLevel } from './phraseLevel.js'

const MODEL = 'gpt-4o'

// Эталоны важнее инструкций: словом «A1» модель пренебрегает, примером — нет.
const EXAMPLES = [
  'Ich gehe in die Küche.',
  'Ich wasche meine Hände.',
  'Ich koche Suppe im Topf.',
]

export function buildPhrasePrompt({ words, level = 'A1', langName = 'Deutsch' }) {
  const count = words.length <= 4 ? 6 : words.length <= 8 ? 9 : 12
  const list = words.map(w => `- ${w.word_de} (${w.translation_ru})`).join('\n')
  return `Ты составляешь набор бытовых фраз для урока языка ${langName}, уровень ${level}.

Слова урока:
${list}

Сделай ${count} фраз. Каждая фраза:
- использует 1–3 слова из списка выше;
- настоящее время, одна грамматическая конструкция, БЕЗ придаточных и запятых;
- 4–7 слов, заканчивается точкой;
- бытовая, такая, какую человек реально скажет вслух;
- к каждой подбери один эмодзи, передающий смысл.

Вот образец нужного уровня и стиля — держись его:
${EXAMPLES.map(e => `- ${e}`).join('\n')}

Придумай короткое название темы на ${langName} (одно-два слова, как «Kochen») и эмодзи темы.

Верни СТРОГО JSON:
{"title":"…","emoji":"…","phrases":[{"text":"…","emoji":"…","words":["слово из списка"]}]}`
}

export function parsePhrasesResponse(text) {
  const clean = String(text || '').replace(/^```(json)?|```$/gm, '').trim()
  try {
    const obj = JSON.parse(clean)
    return {
      title: obj.title || '',
      emoji: obj.emoji || '',
      phrases: Array.isArray(obj.phrases) ? obj.phrases.filter(p => p && p.text) : [],
    }
  } catch {
    return { title: '', emoji: '', phrases: [] }
  }
}

// Ключ слова: без артикля и регистра — модель возвращает то «die Küche», то «Küche»
const wordKey = (s) => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine|the|el|la)\s+/, '').trim()

export function validatePhrases(parsed, { level = 'A1', wordIndex = new Map() } = {}) {
  const good = [], rejected = [], seen = new Set()
  for (const p of parsed.phrases || []) {
    const text = String(p.text || '').trim()
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const problems = checkPhraseLevel(text, level)
    if (problems.length) { rejected.push({ text, problems }); continue }

    // Связь со словами урока: и по тому, что назвала модель, и по вхождению в текст
    const ids = new Set()
    for (const w of p.words || []) {
      const id = wordIndex.get(wordKey(w))
      if (id) ids.add(id)
    }
    for (const [k, id] of wordIndex) {
      if (new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) ids.add(id)
    }
    good.push({ text, emoji: p.emoji || '', word_ids: [...ids] })
  }
  return { good, rejected }
}

// Полный проход по уроку: слова → фразы → валидация → сохранение черновиком.
export async function generateLessonPhrases(lessonId, { level = 'A1', client = platformClient } = {}) {
  const { rows: lessonRows } = await db.query(
    'SELECT id, target_lang, owner_id, school_id FROM lessons WHERE id = $1', [lessonId])
  const lesson = lessonRows[0]
  if (!lesson) throw new Error(`урок ${lessonId} не найден`)

  const { rows: words } = await db.query(
    'SELECT id, word_de, translation_ru FROM words WHERE lesson_id = $1 ORDER BY id', [lessonId])
  if (words.length < 2) return { topicId: null, saved: 0, rejected: [], reason: 'слишком мало слов' }

  const langName = { de: 'Deutsch', en: 'English', es: 'español' }[lesson.target_lang] || 'Deutsch'
  const prompt = buildPhrasePrompt({ words, level, langName })

  const res = await client.chat.completions.create({
    model: MODEL, max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  trackUsage(MODEL, res.usage || {})

  const parsed = parsePhrasesResponse(res.choices[0].message.content || '')
  const wordIndex = new Map(words.map(w => [wordKey(w.word_de), w.id]))
  const { good, rejected } = validatePhrases(parsed, { level, wordIndex })
  if (!good.length) return { topicId: null, saved: 0, rejected, reason: 'все фразы забракованы' }

  const slug = (parsed.title || `lesson-${lessonId}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const { rows: topicRows } = await db.query(
    `INSERT INTO phrase_topics (slug, lang, level, title, emoji, source, lesson_id, school_id, published)
     VALUES ($1, $2, $3, $4, $5, 'lesson', $6, $7, FALSE)
     ON CONFLICT (lesson_id) WHERE lesson_id IS NOT NULL DO UPDATE
       SET title = EXCLUDED.title, emoji = EXCLUDED.emoji, level = EXCLUDED.level
     RETURNING id`,
    [slug || `lesson-${lessonId}`, lesson.target_lang || 'de', level,
     parsed.title || `Lektion ${lessonId}`, parsed.emoji || '💬', lessonId, lesson.school_id])
  const topicId = topicRows[0].id

  // Перегенерация набора заменяет фразы целиком — прогресс по старым уходит вместе с ними
  await db.query('DELETE FROM phrases WHERE topic_id = $1', [topicId])
  let position = 1
  for (const p of good) {
    await db.query(
      'INSERT INTO phrases (topic_id, position, text, emoji, word_ids) VALUES ($1,$2,$3,$4,$5)',
      [topicId, position++, p.text, p.emoji, p.word_ids])
  }
  return { topicId, saved: good.length, rejected }
}
```

- [ ] **Шаг 4: Запустить тест — должен пройти**

Запуск: `cd backend && npx vitest run src/services/phrases.test.js`
Ожидается: PASS, 7 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add backend/src/services/phrases.js backend/src/services/phrases.test.js
git commit -m "feat(phrases): генерация набора фраз урока с валидацией уровня"
```

---

### Task 4: Скрипт наполнения существующих уроков

**Файлы:**
- Создать: `backend/scripts/backfill-lesson-phrases.mjs`

**Интерфейсы:**
- Потребляет: `generateLessonPhrases` из Task 3.
- Отдаёт: наборы у существующих уроков (черновиками, `published = false`).

- [ ] **Шаг 1: Написать скрипт**

```javascript
#!/usr/bin/env node
// Наборы фраз к существующим урокам. Идемпотентно: урок, у которого набор уже есть,
// пропускается — повторный запуск не платит второй раз.
//
// 💸 Тратит OpenAI (gpt-4o): один вызов на урок, ориентир $0.01 за урок.
//    Без --apply печатает только план и смету.
//
//   node scripts/backfill-lesson-phrases.mjs                  # план
//   node scripts/backfill-lesson-phrases.mjs --apply          # генерация
//   node scripts/backfill-lesson-phrases.mjs --apply --limit=3  # сначала три урока
import { db } from '../src/db/index.js'
import { generateLessonPhrases } from '../src/services/phrases.js'
import { resetUsage, usageCostUSD } from '../src/services/claude.js'
import { logOperation } from '../src/services/opLog.js'

const APPLY = process.argv.includes('--apply')
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10)
const LEVEL = process.argv.find(a => a.startsWith('--level='))?.split('=')[1] || 'A1'

const { rows: lessons } = await db.query(`
  SELECT l.id, l.lesson_number, l.title, l.target_lang,
         (SELECT count(*)::int FROM words w WHERE w.lesson_id = l.id) AS words
  FROM lessons l
  WHERE l.status = 'done'
    AND NOT EXISTS (SELECT 1 FROM phrase_topics t WHERE t.lesson_id = l.id)
    AND (SELECT count(*) FROM words w WHERE w.lesson_id = l.id) >= 2
  ORDER BY l.lesson_number NULLS LAST, l.id`)

const targets = LIMIT ? lessons.slice(0, LIMIT) : lessons
console.log(`\nУроков без набора фраз: ${lessons.length}${LIMIT ? `, берём ${targets.length}` : ''}`)
console.log(`Уровень: ${LEVEL}. Ориентир цены: $${(targets.length * 0.01).toFixed(2)}\n`)
for (const l of targets.slice(0, 20)) {
  console.log(`  урок ${l.lesson_number ?? '—'} (id ${l.id}) · ${l.words} слов · ${l.title || 'без названия'}`)
}
if (targets.length > 20) console.log(`  … и ещё ${targets.length - 20}`)

if (!APPLY) {
  console.log(`\nЭто только план — ничего не изменено и не потрачено.`)
  console.log(`  node scripts/backfill-lesson-phrases.mjs --apply`)
  process.exit(0)
}

resetUsage()
let done = 0, empty = 0
for (const l of targets) {
  try {
    const r = await generateLessonPhrases(l.id, { level: LEVEL })
    if (r.saved) { done++; console.log(`  ✓ урок ${l.lesson_number ?? l.id}: фраз ${r.saved}, забраковано ${r.rejected.length}`) }
    else { empty++; console.log(`  · урок ${l.lesson_number ?? l.id}: пусто (${r.reason})`) }
  } catch (e) {
    empty++
    console.error(`  ✗ урок ${l.id}: ${e.message}`)
  }
}
const cost = usageCostUSD()
await logOperation({
  kind: 'phrases', status: 'ok', costUsd: cost,
  message: `наборы фраз: уроков ${done}, пусто ${empty}`,
}).catch(() => {})
console.log(`\nГотово: наборов ${done}, пропущено ${empty}. Потрачено: $${cost.toFixed(4)}`)
console.log(`Наборы созданы черновиками — публикуются после вычитки.`)
process.exit(0)
```

- [ ] **Шаг 2: Проверить синтаксис**

Запуск: `cd backend && node --check scripts/backfill-lesson-phrases.mjs`
Ожидается: без вывода (успех).

- [ ] **Шаг 3: Прогнать план локально (без трат)**

Запуск: `cd backend && node scripts/backfill-lesson-phrases.mjs`
Ожидается: список уроков и смета, строка «Это только план».

- [ ] **Шаг 4: Коммит**

```bash
git add backend/scripts/backfill-lesson-phrases.mjs
git commit -m "feat(phrases): скрипт наборов фраз для существующих уроков"
```

---

### Task 5: API наборов и прогресса

**Файлы:**
- Создать: `backend/src/routes/phrases.js`
- Изменить: `backend/src/index.js` (импорт и регистрация рядом с `phrasebookRoutes`, строки 17 и ниже)
- Тест: `backend/src/services/phraseProgress.test.js`
- Создать: `backend/src/services/phraseProgress.js`

**Интерфейсы:**
- Отдаёт HTTP:
  - `GET /api/lessons/:id/phrases` → `{ topic: {id,title,emoji,level,image_url}, phrases: [{id,text,emoji,translation,position,progress:{listen,build,speak,done}}], stats: {total, done} }`
  - `GET /api/phrase-topics` → `[{id,title,emoji,level,image_url,total,done}]`
  - `GET /api/phrase-topics/:id` → как у урока
  - `POST /api/phrases/:id/step` body `{ step: 'listen'|'build'|'speak' }` → `{ listen, build, speak, done }`
- Отдаёт JS: `summarizePhraseProgress(rows) → { total, done }` (Task 8 использует для карточки).

- [ ] **Шаг 1: Написать падающий тест**

```javascript
// backend/src/services/phraseProgress.test.js
import { describe, it, expect } from 'vitest'
import { summarizePhraseProgress, isPhraseDone } from './phraseProgress.js'

describe('прогресс по набору', () => {
  it('фраза пройдена, когда закрыты слушаю и собираю (говорю необязателен)', () => {
    expect(isPhraseDone({ step_listen: true, step_build: true, step_speak: false })).toBe(true)
    expect(isPhraseDone({ step_listen: true, step_build: false, step_speak: true })).toBe(false)
    expect(isPhraseDone(null)).toBe(false)
  })

  it('считает пройденные из строк набора', () => {
    const rows = [
      { id: 1, step_listen: true,  step_build: true,  step_speak: true  },
      { id: 2, step_listen: true,  step_build: false, step_speak: false },
      { id: 3, step_listen: null,  step_build: null,  step_speak: null  },
    ]
    expect(summarizePhraseProgress(rows)).toEqual({ total: 3, done: 1 })
  })
})
```

- [ ] **Шаг 2: Запустить тест — должен упасть**

Запуск: `cd backend && npx vitest run src/services/phraseProgress.test.js`
Ожидается: FAIL, модуль не найден.

- [ ] **Шаг 3: Написать phraseProgress.js**

```javascript
// backend/src/services/phraseProgress.js
// Шаг «говорю» необязателен: микрофона нет в Safari/iOS и при офлайне, поэтому
// фраза считается пройденной по двум первым шагам.
export function isPhraseDone(p) {
  return Boolean(p && p.step_listen && p.step_build)
}

export function summarizePhraseProgress(rows = []) {
  return { total: rows.length, done: rows.filter(isPhraseDone).length }
}
```

- [ ] **Шаг 4: Запустить тест — должен пройти**

Запуск: `cd backend && npx vitest run src/services/phraseProgress.test.js`
Ожидается: PASS, 2 теста.

- [ ] **Шаг 5: Написать роуты**

```javascript
// backend/src/routes/phrases.js
// API наборов фраз: набор урока, каталог тем, отметка шага тренировки.
import { db } from '../db/index.js'
import { summarizePhraseProgress } from '../services/phraseProgress.js'

// Фразы темы вместе с прогрессом текущего ученика и переводом на его локаль
async function loadTopic(topicId, userId, lang) {
  const { rows: topicRows } = await db.query(
    `SELECT id, title, title_i18n, emoji, level, image_url, lang, published
     FROM phrase_topics WHERE id = $1`, [topicId])
  if (!topicRows[0]) return null

  const { rows } = await db.query(
    `SELECT p.id, p.text, p.emoji, p.position, p.translations,
            up.step_listen, up.step_build, up.step_speak
     FROM phrases p
     LEFT JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $2
     WHERE p.topic_id = $1 ORDER BY p.position`, [topicId, userId])

  const topic = topicRows[0]
  return {
    topic: {
      id: topic.id, emoji: topic.emoji, level: topic.level, image_url: topic.image_url,
      title: topic.title, title_local: topic.title_i18n?.[lang] || null, published: topic.published,
    },
    phrases: rows.map(r => ({
      id: r.id, text: r.text, emoji: r.emoji, position: r.position,
      translation: r.translations?.[lang] || r.translations?.ru || '',
      progress: { listen: !!r.step_listen, build: !!r.step_build, speak: !!r.step_speak },
    })),
    stats: summarizePhraseProgress(rows),
  }
}

export async function phrasesRoutes(fastify) {
  // Набор фраз урока
  fastify.get('/api/lessons/:id/phrases', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const lang = request.query.lang || 'ru'
    const { rows } = await db.query('SELECT id FROM phrase_topics WHERE lesson_id = $1', [parseInt(request.params.id)])
    if (!rows[0]) return reply.status(404).send({ error: 'У этого урока нет набора фраз' })
    return loadTopic(rows[0].id, request.user.id, lang)
  })

  // Каталог тем: общие + свои
  fastify.get('/api/phrase-topics', { preHandler: [fastify.authenticate] }, async (request) => {
    const lang = request.query.lang || 'ru'
    const { rows } = await db.query(
      `SELECT t.id, t.title, t.title_i18n, t.emoji, t.level, t.image_url,
              (SELECT count(*)::int FROM phrases p WHERE p.topic_id = t.id) AS total,
              (SELECT count(*)::int FROM phrases p
                 JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $1
                WHERE p.topic_id = t.id AND up.step_listen AND up.step_build) AS done
       FROM phrase_topics t
       WHERE (t.published OR t.owner_id = $1)
         AND EXISTS (SELECT 1 FROM phrases p WHERE p.topic_id = t.id)
       ORDER BY t.level, t.title`, [request.user.id])
    return rows.map(r => ({ ...r, title_local: r.title_i18n?.[lang] || null, title_i18n: undefined }))
  })

  // Набор по id
  fastify.get('/api/phrase-topics/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = await loadTopic(parseInt(request.params.id), request.user.id, request.query.lang || 'ru')
    if (!data) return reply.status(404).send({ error: 'Набор не найден' })
    return data
  })

  // Отметка пройденного шага
  fastify.post('/api/phrases/:id/step', {
    preHandler: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['step'],
      properties: { step: { type: 'string', enum: ['listen', 'build', 'speak'] } } } },
  }, async (request, reply) => {
    const phraseId = parseInt(request.params.id)
    const column = { listen: 'step_listen', build: 'step_build', speak: 'step_speak' }[request.body.step]
    const { rows } = await db.query(
      `INSERT INTO user_phrase_progress (user_id, phrase_id, ${column}, updated_at)
       VALUES ($1, $2, TRUE, now())
       ON CONFLICT (user_id, phrase_id) DO UPDATE SET ${column} = TRUE, updated_at = now()
       RETURNING step_listen, step_build, step_speak`, [request.user.id, phraseId])
    const p = rows[0]
    return reply.send({ listen: p.step_listen, build: p.step_build, speak: p.step_speak,
      done: Boolean(p.step_listen && p.step_build) })
  })
}
```

- [ ] **Шаг 6: Зарегистрировать роуты**

В `backend/src/index.js` рядом с импортом `phrasebookRoutes` (строка 17) добавить:

```javascript
import { phrasesRoutes } from './routes/phrases.js'
```

И в теле регистрации, где регистрируется `phrasebookRoutes`, добавить строкой ниже:

```javascript
  await app.register(phrasesRoutes)
```

- [ ] **Шаг 7: Проверить, что сервер поднимается и роут отвечает**

Запуск: `cd backend && npm start` (в отдельном терминале), затем
`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/api/phrase-topics`
Ожидается: `401` (роут есть, требует авторизации). Код `404` означает, что регистрация не сработала.

- [ ] **Шаг 8: Коммит**

```bash
git add backend/src/routes/phrases.js backend/src/services/phraseProgress.js backend/src/services/phraseProgress.test.js backend/src/index.js
git commit -m "feat(phrases): API наборов фраз и прогресса по шагам"
```

---

### Task 6: Экран набора

**Файлы:**
- Создать: `frontend/src/pages/PhraseSet.jsx`
- Изменить: `frontend/src/App.jsx` (маршруты рядом со строкой 89)
- Изменить: `frontend/src/i18n/ru.js` и остальные девять файлов локалей

**Интерфейсы:**
- Потребляет: `GET /api/phrase-topics/:id`, `GET /api/lessons/:id/phrases` из Task 5;
  `speak()` из `frontend/src/hooks/useSpeech.jsx`.
- Отдаёт: маршруты `/phrases/:id` и `/phrases/lesson/:lessonId`; кнопку «Тренировать»,
  открывающую `PhraseTrainer` из Task 7.

- [ ] **Шаг 1: Добавить строки интерфейса**

В `frontend/src/i18n/ru.js` после блока `exercise: {` (строка 187) добавить новый блок:

```javascript
  phrases: {
    title: 'Фразы',
    lessonSet: 'Фразы урока',
    listen: 'Слушать всё',
    stop: 'Стоп',
    showTranslation: 'Показать перевод',
    hideTranslation: 'Скрыть перевод',
    train: 'Тренировать',
    stepListen: 'Слушаю',
    stepBuild: 'Собираю',
    stepSpeak: 'Говорю',
    listenTask: 'Послушай и выбери перевод',
    buildTask: 'Собери фразу',
    speakTask: 'Произнеси вслух',
    repeat: 'Ещё раз',
    slower: 'Медленнее',
    skip: 'Пропустить',
    next: 'Дальше',
    done: 'Набор пройден!',
    progress: '{done} из {total}',
    empty: 'У этого урока пока нет фраз',
  },
```

Те же ключи с переводами добавить в `en.js`, `uk.js`, `de.js`, `fr.js`, `ar.js`, `bg.js`,
`tr.js`, `es.js`, `sq.js` — значения на соответствующем языке.

- [ ] **Шаг 2: Написать экран**

```jsx
// frontend/src/pages/PhraseSet.jsx
// Экран набора фраз: тема, картинка, нумерованный список с эмодзи, озвучка.
// Перевод по умолчанию скрыт — если он на виду, глаз читает родной язык,
// а целевой не запоминается.
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { speak } from '../hooks/useSpeech.jsx'
import PhraseTrainer from '../components/PhraseTrainer.jsx'

export default function PhraseSet() {
  const { id, lessonId } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const [data, setData] = useState(null)
  const [showTr, setShowTr] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [training, setTraining] = useState(false)
  const stopRef = useRef(false)

  const load = async () => {
    const url = lessonId ? `/lessons/${lessonId}/phrases` : `/phrase-topics/${id}`
    try { setData(await api.get(`${url}?lang=${lang}`)) } catch { setData({ error: true }) }
  }
  useEffect(() => { load() }, [id, lessonId, lang])

  // «Слушать всё»: фразы подряд с паузой — можно слушать, не глядя в экран
  const playAll = async () => {
    if (playing) { stopRef.current = true; setPlaying(false); return }
    setPlaying(true); stopRef.current = false
    for (const p of data.phrases) {
      if (stopRef.current) break
      speak(p.text)
      await new Promise(r => setTimeout(r, Math.max(1800, p.text.length * 90)))
    }
    setPlaying(false)
  }

  if (!data) return <div style={{ padding: 20 }}>…</div>
  if (data.error || !data.phrases?.length) return <div style={{ padding: 20 }}>{t.phrases.empty}</div>
  if (training) return <PhraseTrainer phrases={data.phrases} onExit={() => { setTraining(false); load() }} />

  const { topic, phrases, stats } = data
  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>
          {topic.emoji} {topic.title.toUpperCase()}
        </div>
        <div style={{ display: 'inline-block', marginTop: 6, padding: '2px 12px', borderRadius: 12,
          background: 'var(--surface-2)', fontSize: 13, fontWeight: 700 }}>{topic.level}</div>
      </div>

      {topic.image_url && (
        <img src={topic.image_url} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 14 }} />
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button onClick={playAll} style={btn}>{playing ? `⏹ ${t.phrases.stop}` : `🎧 ${t.phrases.listen}`}</button>
        <button onClick={() => setShowTr(v => !v)} style={btn}>
          📖 {showTr ? t.phrases.hideTranslation : t.phrases.showTranslation}
        </button>
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {phrases.map((p, i) => (
          <li key={p.id} onClick={() => speak(p.text)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px',
              borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-2)',
              display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ fontSize: 20 }}>{p.emoji}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 16 }}>{p.text}</div>
              {showTr && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{p.translation}</div>}
            </span>
            {p.progress.listen && p.progress.build && <span style={{ color: 'var(--green)' }}>✓</span>}
          </li>
        ))}
      </ol>

      <button onClick={() => setTraining(true)}
        style={{ ...btn, width: '100%', marginTop: 18, padding: 14, fontSize: 16,
          background: 'var(--accent)', color: 'var(--accent-ink)' }}>
        {t.phrases.train} · {t.phrases.progress.replace('{done}', stats.done).replace('{total}', stats.total)}
      </button>
    </div>
  )
}

const btn = {
  flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--surface)', cursor: 'pointer', fontWeight: 700, fontSize: 14,
}
```

- [ ] **Шаг 3: Добавить маршруты**

В `frontend/src/App.jsx` рядом со строкой 89 (`/phrasebook`) добавить:

```jsx
        <Route path="/phrases/:id"                element={<ProtectedRoute><Layout><PhraseSet /></Layout></ProtectedRoute>} />
        <Route path="/phrases/lesson/:lessonId"   element={<ProtectedRoute><Layout><PhraseSet /></Layout></ProtectedRoute>} />
```

И импорт рядом с остальными импортами страниц:

```jsx
import PhraseSet from './pages/PhraseSet.jsx'
```

- [ ] **Шаг 4: Проверить сборку**

Запуск: `cd frontend && npm run build`
Ожидается: сборка без ошибок.

- [ ] **Шаг 5: Коммит**

```bash
git add frontend/src/pages/PhraseSet.jsx frontend/src/App.jsx frontend/src/i18n/
git commit -m "feat(phrases): экран набора со списком, озвучкой и переводом по кнопке"
```

---

### Task 7: Тренажёр из трёх шагов

**Файлы:**
- Создать: `frontend/src/components/PhraseTrainer.jsx`
- Тест: `frontend/src/components/PhraseTrainer.test.jsx`

**Интерфейсы:**
- Потребляет: `POST /api/phrases/:id/step` из Task 5; `speak()` из `hooks/useSpeech.jsx`;
  `useSpeechRecognition`, `isSpeechRecognitionSupported` из `hooks/useSpeechRecognition.jsx`;
  `speechSimilarity` из `utils/speechMatch.js`.
- Отдаёт: компонент `<PhraseTrainer phrases={[]} onExit={fn} />`; чистые функции
  `buildOptions(phrases, index) → string[]` и `shuffleWords(text) → string[]` — они
  тестируются отдельно.

- [ ] **Шаг 1: Написать падающий тест**

```jsx
// frontend/src/components/PhraseTrainer.test.jsx
import { describe, it, expect } from 'vitest'
import { buildOptions, shuffleWords, checkBuilt } from './PhraseTrainer.jsx'

describe('шаг «слушаю»', () => {
  const phrases = [
    { id: 1, text: 'Ich koche Suppe.', translation: 'Я варю суп.' },
    { id: 2, text: 'Ich gehe in die Küche.', translation: 'Я иду на кухню.' },
    { id: 3, text: 'Ich wasche meine Hände.', translation: 'Я мою руки.' },
  ]

  it('даёт три варианта, среди них верный', () => {
    const opts = buildOptions(phrases, 0)
    expect(opts).toHaveLength(3)
    expect(opts).toContain('Я варю суп.')
  })

  it('не повторяет варианты', () => {
    expect(new Set(buildOptions(phrases, 1)).size).toBe(3)
  })
})

describe('шаг «собираю»', () => {
  it('разбивает фразу на слова', () => {
    expect(shuffleWords('Ich koche Suppe.').sort()).toEqual(['Ich', 'Suppe.', 'koche'])
  })

  it('сверяет собранное с эталоном, не придираясь к пробелам', () => {
    expect(checkBuilt(['Ich', 'koche', 'Suppe.'], 'Ich koche Suppe.')).toBe(true)
    expect(checkBuilt(['koche', 'Ich', 'Suppe.'], 'Ich koche Suppe.')).toBe(false)
  })
})
```

- [ ] **Шаг 2: Запустить тест — должен упасть**

Запуск: `cd frontend && npx vitest run src/components/PhraseTrainer.test.jsx`
Ожидается: FAIL, модуль не найден.

- [ ] **Шаг 3: Написать компонент**

```jsx
// frontend/src/components/PhraseTrainer.jsx
// Тренажёр фразы в три шага: 🎧 слушаю (понять на слух) → 🧩 собираю (порядок слов)
// → 🎤 говорю (произношение). Шаг «говорю» необязателен: в Safari/iOS распознавания
// нет вовсе, поэтому он скрывается, а фраза засчитывается по двум первым шагам.
import { useState, useEffect } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { speak } from '../hooks/useSpeech.jsx'
import { useSpeechRecognition, isSpeechRecognitionSupported } from '../hooks/useSpeechRecognition.jsx'
import { speechSimilarity } from '../utils/speechMatch.js'
import { playCorrect, playWrong } from '../utils/sound.js'

// Три варианта перевода: верный плюс два соседних из этого же набора
export function buildOptions(phrases, index) {
  const correct = phrases[index].translation
  const others = phrases.filter((_, i) => i !== index).map(p => p.translation).filter(Boolean)
  const picked = []
  for (const o of others) {
    if (picked.length >= 2) break
    if (o !== correct && !picked.includes(o)) picked.push(o)
  }
  const opts = [correct, ...picked]
  // перемешиваем детерминированно по индексу, чтобы верный не всегда стоял первым
  return opts.sort((a, b) => ((a.length + index) % 3) - ((b.length + index) % 3))
}

export function shuffleWords(text) {
  const words = String(text || '').trim().split(/\s+/)
  return [...words].sort((a, b) => (a.charCodeAt(0) % 7) - (b.charCodeAt(0) % 7))
}

export function checkBuilt(picked, text) {
  return picked.join(' ').trim() === String(text || '').trim()
}

export default function PhraseTrainer({ phrases, onExit }) {
  const { t } = useI18nStore()
  const [i, setI] = useState(0)
  const [step, setStep] = useState('listen')
  const [pool, setPool] = useState([])
  const [picked, setPicked] = useState([])
  const [wrong, setWrong] = useState(false)
  const [heard, setHeard] = useState('')

  const phrase = phrases[i]
  const micAvailable = isSpeechRecognitionSupported()

  const { listening, start } = useSpeechRecognition({
    lang: 'de-DE',
    onResult: (transcript) => {
      setHeard(transcript)
      // Порог 0.55 — тот же, что в SpeechExercise:161-163 считается «почти верно».
      // Это тренажёр, а не экзамен: придираться к акценту здесь незачем.
      const ok = speechSimilarity(transcript, phrase.text) >= 0.55
      if (ok) { playCorrect(); mark('speak'); next() } else { playWrong(); setWrong(true) }
    },
  })

  useEffect(() => {
    setStep('listen'); setPicked([]); setWrong(false); setHeard('')
    setPool(shuffleWords(phrases[i]?.text || ''))
    if (phrases[i]) speak(phrases[i].text)
  }, [i])

  const mark = (name) => { api.post(`/phrases/${phrase.id}/step`, { step: name }).catch(() => {}) }

  const next = () => {
    if (i + 1 < phrases.length) setI(i + 1)
    else onExit()
  }

  const answerListen = (opt) => {
    if (opt === phrase.translation) { playCorrect(); mark('listen'); setStep('build') }
    else { playWrong(); setWrong(true) }
  }

  const tapWord = (w, idx) => {
    const nextPicked = [...picked, w]
    setPicked(nextPicked)
    setPool(pool.filter((_, k) => k !== idx))
    if (nextPicked.length === shuffleWords(phrase.text).length) {
      if (checkBuilt(nextPicked, phrase.text)) {
        playCorrect(); mark('build')
        setStep(micAvailable ? 'speak' : 'done')
        if (!micAvailable) next()
      } else {
        playWrong(); setWrong(true)
        setPicked([]); setPool(shuffleWords(phrase.text))
      }
    }
  }

  if (!phrase) return null

  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
        <span>{t.phrases.progress.replace('{done}', i + 1).replace('{total}', phrases.length)}</span>
        <button onClick={onExit} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
      </div>

      {step === 'listen' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🎧 {t.phrases.listenTask}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => speak(phrase.text)} style={btn}>🔊 {t.phrases.repeat}</button>
            {/* сигнатура speak(text, lang, rate) — третьим параметром скорость */}
            <button onClick={() => speak(phrase.text, undefined, 0.6)} style={btn}>🐢 {t.phrases.slower}</button>
          </div>
          {buildOptions(phrases, i).map(opt => (
            <button key={opt} onClick={() => answerListen(opt)}
              style={{ ...btn, width: '100%', marginBottom: 8, textAlign: 'left' }}>{opt}</button>
          ))}
        </div>
      )}

      {step === 'build' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🧩 {t.phrases.buildTask}</div>
          <div style={{ minHeight: 54, padding: 10, border: '1px dashed var(--line)', borderRadius: 10, marginBottom: 12 }}>
            {picked.join(' ')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pool.map((w, idx) => (
              <button key={`${w}-${idx}`} onClick={() => tapWord(w, idx)} style={btn}>{w}</button>
            ))}
          </div>
        </div>
      )}

      {step === 'speak' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🎤 {t.phrases.speakTask}</div>
          <div style={{ fontSize: 18, marginBottom: 12 }}>{phrase.text}</div>
          <button onClick={start} style={{ ...btn, width: '100%', marginBottom: 8 }}>
            {listening ? '🎙 …' : `🎤 ${t.phrases.speakTask}`}
          </button>
          {heard && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{heard}</div>}
          <button onClick={() => { mark('speak'); next() }} style={{ ...btn, width: '100%', marginTop: 8 }}>
            {t.phrases.skip}
          </button>
        </div>
      )}

      {wrong && <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 13 }}>✗</div>}
    </div>
  )
}

const btn = {
  padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--surface)', cursor: 'pointer', fontWeight: 600, fontSize: 15,
}
```

- [ ] **Шаг 4: Запустить тест — должен пройти**

Запуск: `cd frontend && npx vitest run src/components/PhraseTrainer.test.jsx`
Ожидается: PASS, 4 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add frontend/src/components/PhraseTrainer.jsx frontend/src/components/PhraseTrainer.test.jsx
git commit -m "feat(phrases): тренажёр фразы — слушаю, собираю, говорю"
```

---

### Task 8: Карточка «Фразы урока» в ряду типов

**Файлы:**
- Изменить: `frontend/src/pages/ExerciseSession.jsx` (`TYPE_LABELS`, строка 366; ряд типов, строка ~415)
- Тест: `backend/src/services/examSize.test.js`

**Интерфейсы:**
- Потребляет: `GET /api/lessons/:id/phrases` из Task 5.
- Отдаёт: переход на `/phrases/lesson/:lessonId` из ряда типов урока.

Ключевое ограничение: набор **не** входит в `CORE_EXERCISE_TYPES`, поэтому размер зачётной
сессии не меняется. Это закрепляется тестом.

- [ ] **Шаг 1: Написать тест регрессии зачёта**

```javascript
// backend/src/services/examSize.test.js
import { describe, it, expect } from 'vitest'
import { CORE_EXERCISE_TYPES } from './claude.js'

describe('размер зачёта не зависит от наборов фраз', () => {
  it('в CORE_EXERCISE_TYPES ровно пять типов и среди них нет phrases', () => {
    expect(CORE_EXERCISE_TYPES).toEqual(['flashcard', 'fill_blank', 'multiple_choice', 'sentence_write', 'letter_fill'])
    expect(CORE_EXERCISE_TYPES).not.toContain('phrases')
  })
})
```

- [ ] **Шаг 2: Запустить тест — должен пройти сразу**

Запуск: `cd backend && npx vitest run src/services/examSize.test.js`
Ожидается: PASS. Тест страхует от того, что кто-то потом добавит тип в этот список.

- [ ] **Шаг 3: Добавить подпись типа**

В `frontend/src/pages/ExerciseSession.jsx:366` в объект `TYPE_LABELS` добавить в конец:

```javascript
, phrases: t.phrases?.lessonSet || 'Фразы урока'
```

- [ ] **Шаг 4: Показать карточку в ряду типов**

В `ExerciseSession.jsx` рядом с местом, где рендерится ряд типов (строка ~415, элемент со
`{finished ? '✓ ' : ''}{TYPE_LABELS[r.type] || r.type}`), добавить после списка типов
отдельную карточку:

```jsx
{phraseSet && (
  <button onClick={() => navigate(`/phrases/lesson/${lessonId}`)}
    style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px',
      borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)',
      cursor: 'pointer', fontWeight: 600 }}>
    <span>🗣</span>
    <span>{t.phrases.lessonSet}</span>
    <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
      {phraseSet.stats.done}/{phraseSet.stats.total}
    </span>
  </button>
)}
```

Загрузка данных карточки — рядом с остальными загрузками страницы:

```jsx
const [phraseSet, setPhraseSet] = useState(null)
useEffect(() => {
  if (!lessonId) return
  api.get(`/lessons/${lessonId}/phrases?lang=${lang}`).then(setPhraseSet).catch(() => setPhraseSet(null))
}, [lessonId, lang])
```

- [ ] **Шаг 5: Проверить сборку и тесты**

Запуск: `cd frontend && npm run build && npm test`
Ожидается: сборка успешна, тесты проходят.

- [ ] **Шаг 6: Коммит**

```bash
git add frontend/src/pages/ExerciseSession.jsx backend/src/services/examSize.test.js
git commit -m "feat(phrases): карточка «Фразы урока» в ряду типов, зачёт не затронут"
```

---

### Task 9: Генерация набора при создании нового урока

**Файлы:**
- Изменить: `backend/src/services/processor.js` (в `enrichLesson`, после блока догенерации
  упражнений — рядом со строкой 440, перед блоком переводов упражнений)

**Интерфейсы:**
- Потребляет: `generateLessonPhrases` из Task 3.

- [ ] **Шаг 1: Добавить шаг в конвейер**

В `backend/src/services/processor.js` добавить импорт рядом с остальными:

```javascript
import { generateLessonPhrases } from './phrases.js'
```

И после блока догенерации упражнений вставить:

```javascript
  // 3.5) Набор фраз урока. Мягкая деградация: нет кредитов или модель молчит —
  // урок остаётся без набора и добивается скриптом позже, но сам урок не ломается.
  try {
    const has = await db.query('SELECT 1 FROM phrase_topics WHERE lesson_id = $1', [lessonId])
    if (!has.rowCount) {
      await setProgress(lessonId, 'Собираю фразы урока...')
      const r = await generateLessonPhrases(lessonId, { level: 'A1', client })
      await logOperation({
        kind: 'phrases', lessonId, items: r.saved,
        message: `набор фраз: сохранено ${r.saved}, забраковано ${r.rejected?.length || 0}`,
      }).catch(() => {})
    }
  } catch (e) { console.error('enrichLesson phrases:', e.message) }
```

- [ ] **Шаг 2: Проверить, что тесты бэкенда проходят**

Запуск: `cd backend && npm test`
Ожидается: PASS, падений нет.

- [ ] **Шаг 3: Коммит**

```bash
git add backend/src/services/processor.js
git commit -m "feat(phrases): набор фраз создаётся вместе с новым уроком"
```

---

### Task 10: Выкатка и наполнение на бою

**Файлы:** изменений в коде нет — только деплой и запуск скриптов.

- [ ] **Шаг 1: Задеплоить**

```bash
git push origin main
ssh seoshkin-tools-core "cd /home/seosite/translate && git pull && \
  docker compose -f docker-compose.prod.yml build frontend backend && \
  docker compose -f docker-compose.prod.yml up -d && \
  docker compose -f docker-compose.prod.yml exec -T backend npm run migrate && \
  docker exec ecosystem_router nginx -s reload"
```

Ожидается: миграция 062 применилась, `nginx -s reload` без ошибок (без него шлюз отдаёт 502).

- [ ] **Шаг 2: Прогнать план наполнения (без трат)**

```bash
ssh seoshkin-tools-core "cd /home/seosite/translate && \
  docker compose -f docker-compose.prod.yml exec -T backend node scripts/backfill-lesson-phrases.mjs"
```

Ожидается: список уроков и смета. Ничего не потрачено.

- [ ] **Шаг 3: Спросить Павла и сгенерировать на трёх уроках**

Показать Павлу смету из шага 2 и дождаться подтверждения. После «да»:

```bash
ssh seoshkin-tools-core "cd /home/seosite/translate && \
  docker compose -f docker-compose.prod.yml exec -T backend node scripts/backfill-lesson-phrases.mjs --apply --limit=3"
```

Ожидается: три набора, цена порядка $0.03.

- [ ] **Шаг 4: Проверить глазами**

Открыть урок на `https://deutschlernen.ai`, увидеть карточку «🗣 Фразы урока», зайти,
прослушать набор целиком, пройти одну фразу тремя шагами. Проверить, что размер зачётной
сессии не изменился.

- [ ] **Шаг 5: Запустить на всех уроках после одобрения Павлом**

```bash
ssh seoshkin-tools-core "cd /home/seosite/translate && \
  docker compose -f docker-compose.prod.yml exec -T backend node scripts/backfill-lesson-phrases.mjs --apply"
```

- [ ] **Шаг 6: Записать результат в IDEAS.md и закоммитить**

---

## Отложено на после теста Павлом

Эти задачи в спеке есть, но в первую выкатку не входят — сначала Павел смотрит на живом:

- **Переводы фраз на 10 локалей** — `translateSentencesAllLangs` батчами, ~$0.25 на 1000 фраз.
  Пока фразы показываются с переводом из генерации (только целевой язык + русский).
- **Картинки тем** — воркер картинок, $0.
- **Каталог тем из тетради** — `classify-sentence-topics.mjs`, отчёт в `docs/audits/`.
- **SRS-повтор фраз** — подмешивание в общую сессию, на повторе только шаг «слушаю».
- **Перенос старого `phrasebook`** в новую модель.
- **Раздел «Фразы»** в меню (сейчас вход только из урока).
- **Офлайн-кеш** фраз.
