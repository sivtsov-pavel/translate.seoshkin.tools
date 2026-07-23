# Промт для Sonnet (Соня) — переводы словаря + обложки курсов

Скопируй весь файл первым сообщением новой сессии Sonnet. Проект: **translate.seoshkin.tools / deutschlernen.ai**.

## Контекст
- Стек: Fastify 4 + React 18/Vite + PostgreSQL 16 + Docker Compose. БД-сервис `db`, юзер `german_app`, база `german_learning`.
- Деплой сам: `git push` → `ssh gcloud-seosite` → `cd /home/seosite/translate && git pull` → `docker compose -f docker-compose.prod.yml build backend frontend && up -d`.
- ⚠️ nginx `seoshkin_nginx` НЕ трогать. AiTrainer.jsx не трогать.

## 💸 ПРАВИЛО ПРО ДЕНЬГИ (строго!)
Баланс OpenAI Павла ~$6. Переводы — ТОЛЬКО дешёвой `gpt-4o-mini` батчами (как `translateWordsToAllLangs` в `backend/src/services/claude.js`). Картинки — `gpt-image-1`. **Обе задачи ниже Павел уже одобрил** (переводы ~$0.05–0.10, обложки ~$0.12). Больше ничего платного без отдельного спроса. Не переводить дорогими моделями, не гонять лишние пакеты.

---

## Задача A. Догенерировать переводы словаря (~$0.05–0.10, одобрено)
**Проблема:** у части слов `words.translations` пустой (`'{}'`) — только `translation_ru`. В разделе «Переводы» они светят «—». Нужно заполнить переводы на все локали.
- Немецкий (`target_lang='de'`): ~342 слова без переводов.
- Английский (`en`): ~508 слов.
- Испанский (`es`): уже все переведены — НЕ трогать.

**Как сделать (экономно):**
1. Проверь, нет ли уже готовой админ-операции/эндпоинта массового перевода (grep по `translateWordsToAllLangs`, `enrich`, admin routes). Если есть — используй её.
2. Иначе — напиши разовый node-скрипт (в `backend/`, запуск внутри контейнера backend), который:
   - `SELECT id, word_de, translation_ru FROM words w JOIN lessons l ON l.id=w.lesson_id WHERE (w.translations IS NULL OR w.translations='{}') AND l.target_lang IN ('de','en')`;
   - зовёт `translateWordsToAllLangs(batch, activeLocales)` (BATCH=20, `gpt-4o-mini`);
   - `UPDATE words SET translations=$1 WHERE id=$2`.
3. Прогони, проверь в разделе «Переводы» (под супер-админом — он видит все слова активного языка), что en/es/… заполнились.
4. Оцени фактический расход и напиши Павлу цифру.

## Задача B. Обложки 3 курсов (~$0.12, одобрено)
Нарисовать мультяшные обложки в стиле наших иконок-рисовашек для трёх курсов:
- id 2 «Deutsch А1» (немецкий), id 5 «Английский для ребенка» (англ.), id 7 «Español — Alfabetización» (исп.).

**Как:**
1. Через `gpt-image-1` сгенерь 3 обложки (тёплая палитра проекта: кремовый фон, синий/золотой акценты; дружелюбный мультяшный стиль, как аватар Pablo). Промт каждой — символ языка/культуры + буквы алфавита, без текста-надписей.
2. Сохрани в `/uploads/course-covers/` (или как хранятся word-images), пропиши URL в новую колонку `courses.cover_url` (миграция `backend/src/db/migrations/NNN_course_cover.sql`: `ALTER TABLE courses ADD COLUMN cover_url text`).
3. Выведи обложку на карточке выбора курса (`frontend/src/components/CourseGate.jsx`) и, если уместно, в шапке «Сегодня». Fallback — текущий флаг/градиент, если `cover_url` пуст.
4. Заодно **проверь визуально стиль испанских картинок словаря** (`/uploads/word-images/word_5935.jpg` … они реально в нашем мультяшном стиле?). Если стиль совпадает — ок, ничего не делай. Если нет — НЕ регенери массово, а напиши Павлу оценку стоимости и спроси.

## Правила
- Короткий план → делай → что проверить. Данные из БД не удалять. Тронь только то, что нужно для A и B (не пересекайся с Opus, который ведёт архитектуру).
- После правок: `graphify update .` если есть graphify-out.
- Отметь сделанное в `IDEAS.md` с датой.
