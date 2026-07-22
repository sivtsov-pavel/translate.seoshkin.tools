# Промт для Sonnet — зачёт по слову учебника + вкладки профиля (translate.seoshkin.tools)

Скопируй весь файл первым сообщением новой сессии Sonnet.

---

Ты — Claude (Sonnet), помогаешь Павлу с PWA изучения языков **translate.seoshkin.tools / deutschlernen.ai**.

## Контекст
- Стек: Fastify 4 (raw SQL) + React 18/Vite + PostgreSQL 16 + Docker Compose.
- Бэклог — `IDEAS.md`; правила корректности упражнений — `docs/exercise-quality-rules.md`.
- Деплой сам: `git push` → `ssh gcloud-seosite` → `cd /home/seosite/translate && git pull` → `docker compose -f docker-compose.prod.yml build frontend backend && up -d`. БД: сервис `db`, юзер `german_app`, база `german_learning`.
- ⚠️ nginx-шлюз `seoshkin_nginx` НЕ трогать. Всё на 10 локалей (`frontend/src/i18n/*.js`). Комментарии — русский, имена — английский. AiTrainer.jsx не трогать.
- Дизайн-система v3 уже внедрена: токены в `index.css` (--blue/--teal/--gold/--surface/--ink…), lucide-react иконки, `styles/dashboard-v3.css`. Держись этого стиля.

## Задача 1 — ЗАЧЁТ по уроку: только слова из учебника (source='textbook')
**Проблема:** урок может содержать слова из учебника (`words.source='textbook'`) И из тетради/доски (`words.source='extra'`). Сейчас «Зачёт по уроку» гоняет ВСЕ упражнения урока — с 73 словами (30 учебник + 43 тетрадь) сдать нереально. Ученики жалуются.
**Надо:** зачёт (полная сессия урока, БЕЗ конкретного типа) включает только упражнения слов учебника (`source='textbook'` ИЛИ `source IS NULL` — дефолт учебник) + упражнения без word_id (общие). Тетрадные (`extra`) слова — для практики по типу, но НЕ в зачёте.

**Реализация:**
1. Фронт: кнопка «Зачёт по уроку» (`frontend/src/pages/Dashboard.jsx`, компонент `LessonDetailCard`, `dl-pass-btn`) → добавить в URL `&exam=1`: `navigate(\`/exercise-session?lesson_id=\${id}&exam=1\`)`. Кнопка «Зачёт по уроку» в CourseView/др. если есть — тоже.
2. Фронт: `frontend/src/pages/ExerciseSession.jsx` — прочитать `const exam = searchParams.get('exam')`; в `loadExercises()` пробрасывать `if (exam) qs.set('exam', '1')` в запрос `/exercises/today`. (Функция `loadExercises` уже есть — используется и для первичной загрузки, и для кнопки «Продолжить».)
3. Бэкенд: `backend/src/routes/exercises.js`, эндпоинт `GET /api/exercises/today`. Прочитать `const exam = request.query.exam`. Когда `exam` И есть `lesson_id` — добавить в WHERE фильтр по источнику слова: упражнение проходит, если его слово `source='textbook'` или `source IS NULL`, или `e.word_id IS NULL`. Джойнить `words w ON w.id = e.word_id` (LEFT JOIN, т.к. word_id бывает null) и условие `AND (e.word_id IS NULL OR w.source IS NULL OR w.source='textbook')`. Есть ветки owner и student — добавить в обе (там, где грузятся упражнения урока).
   - ⚠️ Осторожно с нумерацией параметров ($1,$2…) в raw SQL — добавляй параметр в конец массива и используй его индекс.
4. Проверить: зачёт урока 523 (немецкий, «Урок 15») должен давать ~упражнения 30 слов, а не 73. `SELECT count(*) FROM words WHERE lesson_id=523 AND source='textbook'` = 30.

## Задача 2 — Профиль + Настройки в один экран с вкладками
**Сейчас:** есть две страницы — `/profile` и `/settings` — по сути про одно (аккаунт). Павел просит объединить в ОДИН экран с ВКЛАДКАМИ внутри.
**Надо:** сделать один экран (можно на базе `/settings` — он полнее) с вкладками-табами вверху, напр.: «👤 Профиль» (имя, аватар, email, смена пароля — из Profile.jsx), «⚙️ Настройки» (тема, язык, оповещения/таймзона, озвучка), «🔑 Интеграции» (ключ OpenAI — если есть у учителя), «⏰ Напоминания» (notify_prefs). Табы — в стиле v3 (var(--blue) активная вкладка). Старый `/profile` → редирект на `/settings` (или на вкладку профиля), чтобы ссылки не били. В попапе профиля (Layout.jsx) аватар уже ведёт на `/settings` — оставь.
- Не потеряй ни одной существующей настройки из Profile.jsx и Settings.jsx — просто перегруппируй по вкладкам.
- Файлы: `frontend/src/pages/Settings.jsx`, `frontend/src/pages/Profile.jsx`, роутинг `frontend/src/App.jsx` (или где `<Routes>`).

## Задача 3 (если останется время) — понятный прогресс обработки урока
**Сейчас:** при «Обработать»/пересборке/наборах непонятно — идёт процесс или готово. У урока 523 статус `done`, но `progress='Перевожу упражнения...'` завис (сообщение осталось от прошлой обработки).
**Надо:** индикатор яснее. `ProcessingBadge.jsx` опрашивает `/api/lessons/processing-status`. Показывать явное «✅ Готово» когда `status='done'` (и чистить/игнорить старое поле `progress`, если статус done), и «⏳ Идёт: <progress>» когда `status IN ('processing','pending')`. Опционально: на карточке урока значок статуса.

## Правила
- Короткий план → делай → что проверить. Не удаляй данные из БД без бэкапа. Собирай локально (`cd frontend && npx vite build`), деплой, проверяй сайт 200.
- Новые строки — на 10 локалей (`i18n/*.js`, добавляй ключ в каждый язык).
