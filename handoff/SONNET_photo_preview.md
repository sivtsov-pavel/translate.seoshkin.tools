# Промт для Sonnet (Соня) — превью распознанного ПЕРЕД созданием урока (#5)

Скопируй весь файл первым сообщением новой сессии Sonnet. Проект: **translate.seoshkin.tools / deutschlernen.ai**. Делать ПОСЛЕ задачи по числам/обложкам.

## Контекст
- Fastify 4 + React 18/Vite + PostgreSQL 16 + Docker. Деплой сам: `git push` → `ssh gcloud-seosite` → `cd /home/seosite/translate && git pull` → `docker compose -f docker-compose.prod.yml build backend frontend && up -d`.
- ⚠️ nginx НЕ трогать. AiTrainer.jsx не трогать.

## 💸 ПРАВИЛО ПРО ДЕНЬГИ
Vision-разбор (`gpt-4o`) идёт РОВНО ОДИН раз — на превью. На подтверждении картинки/переводы/упражнения генерятся `gpt-4o-mini`/`gpt-image-1` как сейчас (не дороже). Никаких лишних vision-вызовов. Не переводить дорогими моделями.

## Задача — превью распознанного ПЕРЕД коммитом урока
**Проблема (Павел):** сейчас фото → сразу разбор и создание урока «вслепую»; часть слов/предложений теряется, и это видно только постфактум.
**Дизайн УЖЕ согласован с Павлом (не менять):**
- Превью **после всех фото — один объединённый список** (учебник+тетрадь, дедуп уже применён `mergeLesson`).
- Правка: **галочки «оставить/убрать»** у каждого слова и предложения + **ручное добавление** слова (`word_de` + перевод) и предложения. Редактировать сам перевод существующих — НЕ надо (простой вариант).
- Vision-разбор — один раз (на превью). Подтверждение — коммитит только отмеченные + добавленные.

### Бэкенд (backend/src)
Референс — `services/processor.js` → `processNewMedia(lessonId)` (строки ~407–455): он делает extract(`extractFromPhoto`)→merge(`mergeLesson`)→INSERT words→`saveSentences`→`generateExercises`. Нужно **разбить на два шага**:

1. **`extractLessonPreview(lessonId)`** (новая функция в processor.js): выполняет ТОЛЬКО extract+merge (как строки 417–431 processNewMedia, включая пометку `lesson_media.processed=true` + `raw_extraction`), и **возвращает** `{ words:[{word_de, translation_ru, example_sentence}], sentences:[{text, translation_ru}], grammar_points:[] }`. **НЕ** вставляет words/exercises.
2. **`commitLessonWords(lessonId, words, sentences)`** (новая функция): принимает отредактированный список, делает INSERT words (как строки 432–440, `ON CONFLICT` оставить), `saveSentences`, затем `generateExercises` для новых слов (строки 444+) и `enrichLesson(lessonId)` (переводы/картинки).
3. `processNewMedia` можно оставить (обратная совместимость) или переписать как `commitLessonWords(lessonId, (await extractLessonPreview(lessonId)).words, ...sentences)`.

Эндпоинты (`routes/lessons.js`):
- **`POST /api/lessons/:id/extract-preview`** (owner) → `{ words, sentences, grammar_points }`. Внутри — `extractLessonPreview`. Ставит `lessons.status='processing'` на время разбора, потом обратно (или отдельный статус `preview_ready`).
- **`POST /api/lessons/:id/confirm`** (owner, body `{ words:[...], sentences:[...] }`) → запускает `commitLessonWords` в фоне (как сейчас `status='processing'`→`done`, с прогрессом). Возвращает `{ processing:true }`.
- В `POST /api/lessons/:id/media` (строки ~403–419) — **убрать авто-коммит для owner** (`autoProcess`), чтобы вместо мгновенного `processNewMedia`+`enrichLesson` фронт шёл через превью. (Оставь фолбэк-флаг, если просто, но по умолчанию — превью.)

### Фронтенд (`frontend/src/pages/NewLesson.jsx`)
Текущий флоу: создать урок → `uploadFiles(/lessons/:id/media)` → `POST /lessons/:id/process`. Новый:
1. После загрузки медиа — вызвать `POST /lessons/:id/extract-preview`, показать **экран превью**:
   - Список слов: каждая строка — чекбокс (по умолчанию ✔) + `word_de — перевод`. Снял галочку = не создавать.
   - Кнопка «+ добавить слово» → инлайн-поля `word_de` и `перевод` (добавляется отмеченным).
   - Список предложений: чекбоксы + «+ добавить предложение».
   - Кнопки: **«Подтвердить разбор →»** и «Отмена».
2. По «Подтвердить» → `POST /lessons/:id/confirm` с отмеченными+добавленными словами/предложениями → далее как сейчас (поллинг `status`/`processing-status` до `done`).
3. Тексты — через i18n (новая секция или существующая), с русскими фолбэками.

### Проверить
- Загрузить 1–2 фото страницы → увидеть превью со словами/предложениями → снять пару галочек, дописать слово → подтвердить → урок создаётся только из отмеченного+добавленного, упражнения генерятся.
- Vision-вызов ровно один (на превью), не повторяется на подтверждении.

## Правила
- Короткий план → делай → проверь. Данные не удалять. Отметь в `IDEAS.md` и допиши фичу в `docs/promt-cowork-why-our-app.md` (превью разбора — сильный аргумент «учитель контролирует, ничего не теряется»).
