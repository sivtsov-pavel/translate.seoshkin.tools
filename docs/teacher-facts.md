# Фактура для методички учителя (из кода)

Собрано по коду репозитория `translate.seoshkin.tools` (German-learning PWA, Fastify+Postgres backend,
React 18/Vite frontend). Каждый факт — с указанием `path:line`. Без оценок и рекламы.

---

## 1. Типы упражнений

В коде реально существует **7 типов упражнений**. Свитч по типу в сессии упражнений:
`frontend/src/pages/ExerciseSession.jsx:118-124` (маппинг `ex.type` → компонент), UI-подписи —
`frontend/src/pages/ExerciseSession.jsx:85` (`typeLabel`) и `frontend/src/i18n/ru.js:55-61`.

1. **`flashcard`** — «Флеш-карта» (`frontend/src/i18n/ru.js:55`).
   Компонент `frontend/src/components/Flashcard.jsx`. Ученик видит слово изучаемого языка
   (`payload.question`), система сразу озвучивает его (`speakAuto`, `Flashcard.jsx:16`).
   Клик по карточке открывает перевод (`reveal()`, `Flashcard.jsx:20`). После этого ученик сам
   оценивает память тремя кнопками: «Не помню» (quality=1), «С трудом» (quality=3), «Помню!»
   (quality=5) — `Flashcard.jsx:73-81`, `t.exercise.forgot/hard/remembered` (`ru.js:64-66`). Оценка
   идёт в SM-2 (see `handleAnswer`/`/exercises/:id/attempt`, `ExerciseSession.jsx:61-77`).

2. **`fill_blank`** — «Заполни пропуск» (`ru.js:56`). Компонент
   `frontend/src/components/FillBlank.jsx`. Предложение на изучаемом языке с пропуском `___`
   (`payload.sentence`, `payload.blank`); ученик либо печатает слово в поле ввода, либо нажимает
   одну из подсказок-кнопок с перемешанными вариантами (`payload.options`, включает правильный +
   отвлекающие) — `FillBlank.jsx:23-29,98-116`. Проверка — точное совпадение по строке без учёта
   регистра (`FillBlank.jsx:17,39`). Показывается перевод всего предложения на локаль ученика
   (`sentenceTranslation`, `FillBlank.jsx:50,91-95`).

3. **`multiple_choice`** — «Выбери ответ» (`ru.js:57`). Компонент
   `frontend/src/components/MultipleChoice.jsx`. Показывается немецкое (изучаемого языка) слово
   (`germanWord`), варианты перевода перемешиваются с сохранением исходного индекса правильного
   (`MultipleChoice.jsx:15-28`); 4 варианта ответа (задаются в промпте генерации, см. §3).

4. **`sentence_write`** — «Напиши предложение» (`ru.js:58`). Компонент
   `frontend/src/components/SentenceWrite.jsx`. Ученик пишет своё предложение с заданным словом
   в свободной форме (textarea), отправляет на бэкенд `POST /exercises/:id/check-sentence`
   (`SentenceWrite.jsx:26`), где ИИ (`checkSentence`, `backend/src/services/claude.js:264-287`)
   оценивает по шкале 0-5, даёт фидбек и, если есть ошибки, — исправленный вариант
   (`result.corrected`, `SentenceWrite.jsx:108-113`). Единственный тип, где `handleAnswer` НЕ
   шлёт отдельный `/attempt` (`ExerciseSession.jsx:63`, т.к. оценка уже получена через
   `check-sentence`).

5. **`letter_fill`** — «Добавь букву» (`ru.js:59`). Компонент
   `frontend/src/components/LetterFill.jsx`. Слово показано с замаскированными буквами
   (`payload.masked`, напр. `H_nd`), первая буква всегда видима (правило генерации — см. §3);
   ученик вписывает слово целиком в поле, а не только пропущенные буквы
   (`LetterFill.jsx:22-24,84-92`).

6. **`dictation`** — «Диктант» (`ru.js:60`). Компонент `frontend/src/components/Dictation.jsx`.
   Слово озвучивается голосом (`speak(word_de, 'de-DE', 0.8)`, `Dictation.jsx:22`), показывается
   ТОЛЬКО перевод на локаль ученика (само немецкое слово не показывается, кроме de-локали —
   `Dictation.jsx:17-19`); ученик печатает услышанное слово изучаемого языка на слух, сверка —
   точное совпадение без учёта регистра (`Dictation.jsx:28`).

7. **`speech`** — «Проговори слова» (`ru.js:61`, ярлык в UI-бейдже упражнения) /
   «Произношение» (фолбэк в `ExerciseSession.jsx:85`, если `t.exercise.speech` не задан).
   Компонент `frontend/src/components/SpeechExercise.jsx`. Ученик нажимает кнопку микрофона и
   произносит слово вслух; распознавание речи через Web Speech API
   (`useSpeechRecognition`, `SpeechExercise.jsx:310-313`), сравнение произнесённого текста со
   словом через функцию схожести `speechSimilarity`; оценка по порогам: ≥0.90 → quality 5
   («Превосходно!»), ≥0.75 → 4 («Хорошо!»), ≥0.55 → 3 («Почти!»), иначе → 1 («Попробуй ещё») —
   `SpeechExercise.jsx:224-229`. Компонент также показывает фонетические подсказки
   (нем. буквосочетания → русская транскрипция, напр. `sch = «ш»`) и упрощённую разметку ударения
   (`SpeechExercise.jsx:11-34,160-221`); при отсутствии поддержки речи в браузере — заглушка с
   советом использовать Chrome (`SpeechExercise.jsx:336-351`).

Есть ещё UI-строка `t.exercise.trainerSpeech` = «Произношение с тренером»
(`ru.js:62`), но это НЕ тип упражнения `ex.type` — это ярлык кнопки на Дашборде, ведущей в раздел
AI-тренер (`frontend/src/pages/Dashboard.jsx:430`), отдельная фича (см. §4), не часть цикла
SRS-упражнений урока.

---

## 2. Цикл урока — сопоставление с формулировкой владельца

Формулировка владельца: «сканируешь → слушаешь слова с переводом → карточки с ответом → просто
карточки → добавь букву → добавь слово → произношение → диктант».

Сопоставление по факту кода:

- **«сканируешь»** → загрузка фото учебника/тетради (см. §3) — реальный первый шаг, подтверждается
  кодом (`processLesson`, `backend/src/services/processor.js:342`).
- **«слушаешь слова с переводом»** → ближе всего к **`flashcard`**: система сама озвучивает слово
  при показе (`speakAuto`, `Flashcard.jsx:16`), а перевод открывается по клику
  (`Flashcard.jsx:20,59-64`). Отдельного типа упражнения «прослушать слово с переводом» без
  самостоятельной работы в коде нет.
- **«карточки с ответом» vs «просто карточки»** — **РАСХОЖДЕНИЕ**: в коде это ОДИН и тот же тип
  `flashcard` в одном режиме, а не два разных экрана/типа. Владелец описывает их как два разных
  шага цикла, но `ExerciseSession.jsx:118` рендерит `flashcard` единственным способом:
  клик открывает ответ → ученик сам оценивает себя (не помню / с трудом / помню). Нет отдельного
  «плоского» режима карточек без самооценки.
- **«добавь букву»** → **`letter_fill`**, UI-название дословно совпадает: «Добавь букву»
  (`ru.js:59`, `LetterFill.jsx`).
- **«добавь слово»** — **РАСХОЖДЕНИЕ / неоднозначность**: точного соответствия по UI-названию нет.
  Ближе всего по смыслу — `fill_blank` («Заполни пропуск», вписать слово в готовое предложение,
  `FillBlank.jsx`) либо `sentence_write` («Напиши предложение», написать своё предложение со
  словом, `SentenceWrite.jsx`). Ни один тип не называется в коде «добавь слово».
- **«произношение»** → **`speech`**, UI-подпись «Проговори слова» (`ru.js:61`) /
  «Произношение» как фолбэк-подпись (`ExerciseSession.jsx:85`) и как заголовок в справке
  (`frontend/src/pages/Wiki.jsx:34`, `frontend/src/pages/Docs.jsx:65-66`).
- **«диктант»** → **`dictation`**, UI-название дословно совпадает: «Диктант» (`ru.js:60`).

**Важное расхождение с реальным порядком показа**: владелец описывает ФИКСИРОВАННУЮ
последовательность шагов. По факту кода:
- Порядок упражнений в сессии («На сегодня») определяется SRS-очередью и **`RANDOM()`** в SQL-
  запросе (`backend/src/routes/exercises.js:115,128`: `ORDER BY next_review_date ASC, RANDOM()`),
  а не фиксированной последовательностью типов.
- Единственное клиентское закрепление порядка: `dictation` всегда сортируется в конец списка
  упражнений сессии (`frontend/src/pages/ExerciseSession.jsx:52-55`, комментарий в коде: «Диктант
  всегда последним»). Остальные 6 типов (`flashcard`, `fill_blank`, `multiple_choice`,
  `sentence_write`, `letter_fill`, `speech`) идут в случайном порядке — фиксированной цепочки
  «карточки → буква → слово → произношение» в коде нет.
- Генерация упражнений (`generateExercises`, `backend/src/services/claude.js:251-260`) создаёт
  ровно **5 типов на каждое слово одновременно** (flashcard, fill_blank, multiple_choice,
  sentence_write, letter_fill — порядок в промпте `EXERCISES_PROMPT`,
  `backend/src/services/claude.js:210-215`), а `dictation` и `speech` добавляются отдельным циклом
  «по одному упражнению на слово» сразу после (`processLesson`,
  `backend/src/services/processor.js:462-468`, аналогично в `regenerateExercisesFromDb:188-194`,
  `processNewMedia:260-264`, `saveCameraWords:299-303`, `generateCustomSet:329-333`). Итог: при
  штатной обработке урока получается 7 типов на каждое слово, но НЕ как отдельные «шаги» цикла, а
  как параллельный набор упражнений, которые SRS раздаёт вразнобой день за днём.

---

## 3. Импорт урока

### Создание урока
- `POST /api/lessons` создаёт запись урока (`backend/src/routes/lessons.js:7-40`); автономер урока
  внутри курса или общего пула (`lessons.js:25-32`); привязка к `target_lang` (изучаемый язык) из
  заголовка `x-target-lang` (`lessons.js:34`).
- Фронтенд: `frontend/src/pages/NewLesson.jsx:110-111` — создаёт урок (авто-заголовок, если не
  задан) и сразу вызывает обработку `POST /lessons/:id/process` (`NewLesson.jsx:137`).
- Медиа (фото/аудио) загружаются через `POST /api/lessons/:id/media`
  (`backend/src/routes/lessons.js:298-329`); источник — учебник (`textbook`, по умолчанию) или
  тетрадь/доска (`extra`, `?source=extra`), `lessons.js:303`.

### Обработка (`POST /api/lessons/:id/process`, `backend/src/routes/process.js:37-55`)
Доступно только роли `owner` (`process.js:41`). Запускает `processLesson`
(`backend/src/services/processor.js:342-521`) в фоне (эндпоинт отвечает сразу, `started: true`,
статус опрашивается через `GET /api/lessons/:id/status`, `process.js:87-97`, поллинг с фронта раз
в 3 сек — согласно `frontend/src/pages/NewLesson.jsx` и `LessonList.jsx`). Шаги внутри
`processLesson`:
1. Извлечение слов из фото через **GPT-4o Vision** (`extractFromPhoto`, модель `gpt-4o`,
   `backend/src/services/claude.js:69-70`), результат кэшируется в `lesson_media.raw_extraction`
   (`processor.js:376`).
2. Если есть аудио — транскрипция (`transcribeAudio`, `backend/src/services/whisper.js`,
   `processor.js:382-390`).
3. Фото учебника и тетради/доски обрабатываются РАЗДЕЛЬНО (`processor.js:394-395,431-432`);
   тетрадь/доска сверяется со словами, уже извлечёнными из учебника, чтобы не дублировать
   (`existingWords`, `processor.js:406`).
4. Консолидация слов через `mergeLesson` (`backend/src/services/claude.js:137-175`, модель
   `gpt-4o-mini` по умолчанию через `ask()`) — нормализация (артикли, регистр, инфинитив),
   дедупликация.
5. Слова сохраняются в таблицу `words` с `ON CONFLICT (lesson_id, word_de) DO UPDATE`
   (`processor.js:410-417`).
6. Генерация упражнений — `generateExercises` (5 типов на слово, см. §2) + `dictation`/`speech`
   отдельно (`processor.js:440-468`).
7. Если название урока не задано вручную (пусто или дефолтное «Урок N») — ИИ придумывает
   название/описание (`generateLessonMeta`, `backend/src/services/claude.js:179-199`, модель
   `gpt-4o-mini`), с автонумерацией следующего свободного «Урок N» (`processor.js:470-499`).
8. В конце автоматически вызывается `enrichLesson` (`processor.js:502`, см. ниже) — картинки +
   переводы на все языки.

### Кнопки учителя в `frontend/src/pages/LessonList.jsx` (реальное поведение по коду)
- **«▶ Обработать»** (`handleProcess`, `LessonList.jsx:152-165`, видна при статусе `pending`/
  `error`, `LessonList.jsx:354-358`) → `POST /lessons/:id/process` — полный цикл выше.
- **«✨ Обработать всё»** (`handleEnrich`, `LessonList.jsx:166-180`, видна при статусе `done`,
  `LessonList.jsx:360-366`, title: «Дополнить недостающее: переводы, картинки, переводы упражнений
  на все языки») → `POST /lessons/:id/enrich`
  (`backend/src/routes/process.js:59-84`). НЕ пересоздаёт упражнения (прогресс ученика
  сохраняется, `process.js:57-58`). Сначала обрабатывает НОВЫЕ необработанные фото
  (`processNewMedia`, добавляет только новые слова/упражнения), затем `enrichLesson`
  (`process.js:72-74`): (1) переводы/примеры для неполных слов, (2) картинки для слов без фото
  (наши ИИ-рисунки через `gpt-image-1`, Unsplash отключён — комментарий в коде,
  `processor.js:76-77`), режим авто/вручную настраивается в супер-админке
  (`platform_settings.features.autoImages`, `processor.js:80-81`), (3) перевод слов на все активные
  локали, (4) перевод вариантов/вопросов упражнений, (5) перевод заголовка и описания урока —
  `processor.js:56-149`.
- **«🎨» (нарисовать картинки)** (`handleDrawImages`, `LessonList.jsx:181-194`, видна при статусе
  `done`, title: «Нарисовать детские ИИ-картинки для слов без фото (платно)»,
  `LessonList.jsx:367-373`) → `POST /lessons/:id/draw-images`
  (`backend/src/routes/process.js:6-19`) → `drawLessonImages` (`processor.js:23-35`): генерирует
  картинки только для слов без `image_url`, пропуская служебные слова (предлоги/артикли/
  местоимения/числа — `isFunctionWord`, `processor.js:25`).
- **«🔤» (добавить «Добавь букву»)** (`handleAddLetterFill`, `LessonList.jsx:195-202`, видна при
  статусе `done`, title: «Добавить «Добавь букву»», `LessonList.jsx:387-391`) →
  `POST /lessons/:id/add-letter-fill` (`backend/src/routes/lessons.js:70-120`): берёт слова урока
  из существующих `flashcard`-упражнений, генерирует `letter_fill` через `generateLetterFill`
  (`claude.js:233-241`), только если у урока их ещё нет (409, если уже есть — `lessons.js:97-102`).
- **«🎙️» (добавить диктант)** (`handleAddDictation`, `LessonList.jsx:203-210`, видна при статусе
  `done`, title: «Добавить диктант», `LessonList.jsx:392-396`) →
  `POST /lessons/:id/add-dictation` (`backend/src/routes/lessons.js:123-159`): по одному `dictation`
  на каждое слово урока (взятое из `flashcard`-упражнений), только если ещё не добавлено.
- **`add-speech`** — эндпоинт `POST /lessons/:id/add-speech` существует
  (`backend/src/routes/lessons.js:162-198`) и обработчик `handleAddSpeech` в коде фронтенда
  определён (`LessonList.jsx:138,209-215`), НО **кнопка для него в JSX не отрисована** — в блоке
  кнопок учителя (`LessonList.jsx:352-404`) есть только 🔤 и 🎙️, кнопки для `add-speech` нет.
  **Расхождение / мёртвый код**: функциональность добавления `speech`-упражнений к готовому уроку
  реализована на бэкенде и во фронтенд-логике, но недоступна учителю через UI на момент
  инвентаризации.
- **«⚙️» (пересоздать упражнения)** (`handleRegen`, `LessonList.jsx:223-238`, видна если у урока
  есть слова, title: «Пересоздать упражнения», `LessonList.jsx:378-384`) →
  `POST /lessons/:id/regenerate` (`backend/src/routes/lessons.js:332-351`) →
  `regenerateExercisesFromDb` (`processor.js:152-209`): удаляет ВСЕ существующие упражнения урока
  и создаёт заново из слов, уже сохранённых в БД (без повторного сканирования фото). Отдельно есть
  admin-массовая операция `POST /api/admin/regenerate-all`
  (`backend/src/routes/lessons.js:354-382`) — для всех уроков со словами, но без упражнений.
- **«✏️» (редактировать)** — открывает форму редактирования (`title`/`description`/
  `text_content`), не связана с ИИ-обработкой (`LessonList.jsx:374-377`, `PATCH /api/lessons/:id`,
  `lessons.js:246-282`).
- **«✕» (удалить)** — `DELETE /api/lessons/:id`, каскадно удаляет слова/упражнения через FK
  (`lessons.js:284-295`).

### Прочие пути создания уроков (не через сканирование)
- **«Свои упражнения» / «Набор»** — `POST /api/lessons/custom` (`process.js:22-34`) →
  `generateCustomSet` (`processor.js:313-340`): собирает набор упражнений из вручную выбранных слов
  словаря (без сканирования). Инициируется со страницы Словарь (см. §4, `Docs.jsx:65-66`,
  Wiki `frontend/src/pages/Wiki.jsx`).
- **Камера в читалке** — `saveCameraWords` (`processor.js:273-311`) добавляет слова, извлечённые
  ИИ-Vision с фото (`extractWordsFromImage`, `claude.js:85-103`), к существующему уроку.

---

## 4. Разделы для учителя

Роль хранится в `user.role`, значения `owner` (учитель/родитель) и `student` (ученик); проверки
как на фронтенде (скрытие UI), так и на бэкенде (403 при попытке минуя UI).

- **Управление уроками** — `frontend/src/pages/LessonList.jsx`: все кнопки обработки/редактирования
  (§3) видны только при `user?.role === 'owner'` (`LessonList.jsx:352`). Ученик видит только статус
  и кнопку начать упражнения (`LessonList.jsx:336`).
- **Создание урока** — `frontend/src/pages/NewLesson.jsx`, доступно только через защищённый роут
  `/lessons/new` (`frontend/src/App.jsx:59`); маршрут не ограничен по роли на уровне роутера, но
  сама форма и её действия (`process`) на бэкенде под `role !== 'owner' → 403`
  (`backend/src/routes/process.js:41`).
- **Курсы** — `frontend/src/pages/CourseList.jsx:42` (кнопка «+ Курс» только для `owner`),
  `frontend/src/pages/CourseView.jsx:61,75` (управление уроками курса только для `owner`).
- **Ученики** — раздел `frontend/src/pages/Students.jsx` (нет явного role-гейта в самом файле, но
  бэкенд `backend/src/routes/students.js:9,44,71` возвращает 403 не-`owner`).
- **Аналитика класса** — `frontend/src/pages/TeacherAnalytics.jsx:27-31`: явный ранний `return` с
  «🔒 Только для учителя» для не-`owner`; бэкенд тоже проверяет роль
  (`backend/src/routes/analytics.js:8`). Показывает: сколько учеников/активны за 7 дней, всего
  ответов, общая точность, по каждому ученику — точность/слова/последний визит, «трудные слова» (с
  наибольшим числом ошибок), точность по типам упражнений (описание раздела —
  `frontend/src/pages/Docs.jsx` и `Wiki.jsx:77-78`).
- **Admin-операции** (массовые операции: картинки/переводы/пересоздание) —
  `frontend/src/pages/Admin.jsx`, `frontend/src/pages/LessonList.jsx:283` (`adminOp` блок только
  для `owner`); полный список операций описан в справке
  (`frontend/src/pages/Wiki.jsx`: 🖼 Картинки, ⭐ Словарь++, 🌐 Слова→10 языков, 📝
  Упражнения→языки, 🔤 Названия→языки, 🔊 Произношение всем урокам, 🔄 Пересоздать всё).
- **Словарь — вид учителя** — `frontend/src/pages/Vocabulary.jsx:256,826,875`: доп. функции
  (управление словами, набор упражнений «✏️ Набор») только для `owner`.
  «✏️ Набор» = вызов `POST /api/lessons/custom` (см. §3) — сборка упражнений из выбранных слов
  словаря.
- **Переводы (раздел «Переводы»)** — `frontend/src/pages/Translations.jsx:228` передаёт
  `isOwner` компоненту (доп. права на редактирование переводов).
  Показывает: слова словаря, заголовки уроков, фразы разговорника, тексты интерфейса на 10 языках
  (`Docs.jsx`).
  Доступен обеим ролям как раздел, но действия редактирования — только `owner`.
- **AI-тренер** — `frontend/src/pages/AiTrainer.jsx:201`: `isOwner` используется для отличий в
  UI/логике (например, выбор персонажей/сценариев), сам раздел доступен обеим ролям
  (роут `/ai-trainer`, `App.jsx:78`, без роут-левел ограничения).
- **Чат** — `frontend/src/pages/Chat.jsx:16`: `isOwner` влияет на поведение (например, кто с кем
  общается — учитель с учениками).
- **Настройки** — `frontend/src/pages/Settings.jsx:156`: `isOwner` открывает доп. настройки
  (в т.ч. супер-админ настройки активных локалей и режима картинок, судя по использованию
  `platform_settings` в `processor.js:47-54,80-81`).
- **«Игра класса»** — кнопка запуска видна только `owner` (`frontend/src/pages/Dashboard.jsx:436`,
  `user?.role === 'owner' && wordsCount > 0`) — подробнее §5.
- **Диктант** — не отдельный «раздел для учителя», а тип упражнения (§1), доступный обеим ролям в
  обычной сессии повторения; учитель дополнительно может ДОБАВИТЬ диктант к готовому уроку кнопкой
  🎙️ (§3).
- **Читалка** — `frontend/src/pages/TextReader.jsx` (роут `/reader`, `App.jsx:69`), доступна обеим
  ролям, не teacher-only по коду; описание трёх режимов (Читать/Двуязычный/Разговор) —
  `frontend/src/pages/Wiki.jsx` (раздел «Читалка»).

---

## 5. «Игра класса»

Источники: `GAME_CLASS.md` (корень репозитория, авторский замысел), `frontend/src/pages/
ClassGame.jsx` (экран игры), `frontend/src/pages/Dashboard.jsx` (`makeClassGame`, кнопка запуска),
`backend/src/services/classGame.js` (`buildClassGame`), `backend/src/routes/classGames.js`.

### Что подтверждено кодом
- Учитель запускает игру кнопкой «🎮 Игра класса» на карточке урока на Дашборде
  (`frontend/src/pages/Dashboard.jsx:436-447`, видна только `owner` и только если в уроке есть
  слова, `wordsCount > 0`). По клику — `window.prompt` «Сколько фраз собрать для класса?» (дефолт
  30) → `makeClassGame` (`Dashboard.jsx:296-304`) → `POST /api/class-games`
  (`backend/src/routes/classGames.js:12-25`, 403 не-`owner`), затем переход на
  `/class-game/:id`.
- Генерация — `buildClassGame` (`backend/src/services/classGame.js:7-71`), в фоне:
  1. Берутся уникальные слова урока (`word_de` из `words`, привязанных к упражнениям урока,
     `classGame.js:11-14`).
  2. Список учеников — **общий пул всех** `role='student'` (не ограничен курсом/уроком урока)
     (`classGame.js:17-18`).
  3. Генерируются пары «вопрос-ответ» (`generateClassPairs`, `backend/src/services/claude.js`) —
     ПО ОДНОЙ паре (2 строки: `role='question'` и `role='answer'`) на каждого ученика
     (`classGame.js:21-24,33-47`).
  4. Перевод фраз на 10 локалей (`translateSentencesAllLangs`, `classGame.js:29-30`).
  5. Раздача — round-robin по `studentIds` (`classGame.js:35`), push-уведомление каждому ученику,
     у кого есть фразы (`classGame.js:53-68`).
- Экран учителя (`ClassGame.jsx:94-117`) — видит ВСЕ фразы, сгруппированные по ученику
  (`byStudent`), с отметкой «прочитал» (✓), но нет кнопки «Следующий»/управления живым ходом в
  коде.
- Экран ученика (`ClassGame.jsx:56-92`) — видит свои фразы (немецкая строка + перевод на его
  локаль + 🔊), кнопку «Прочитал» (`markRead`, помечает `read_at`) и кнопку «Сохранить всё в
  разговорник» (`toPhrasebook`).

### Расхождения между `GAME_CLASS.md` (замысел) и текущим кодом
- **Количество фраз**: `GAME_CLASS.md` описывает 25–35 РАЗНЫХ фраз с разными ролями (вопрос/ответ/
  утверждение). По факту кода, если в системе есть зарегистрированные ученики, число пар
  ЖЁСТКО равно числу учеников (`nPairs = studentIds.length || ...`, `classGame.js:22`) — введённое
  учителем число `count` в промпте ИГНОРИРУЕТСЯ, если ученики есть (используется только как
  фолбэк, когда учеников нет). У каждого ученика ровно 2 строки (вопрос+ответ) — не «3-5» фраз, как
  предполагает документ.
- **Роль `statement`** (утверждение) заявлена в замысле и присутствует в UI-словаре ролей
  (`ROLE = {question, answer, statement}`, `ClassGame.jsx:8`), но `buildClassGame` генерирует ТОЛЬКО
  `question`/`answer` пары (`classGame.js:38-46`) — `statement` в коде генерации не создаётся
  никогда.
- **Формат игры** (`format`: «эстафета» vs «вопрос-ответ», описан в `GAME_CLASS.md` разделы 3 и
  API): поле `format` принимается и сохраняется в БД (`classGames.js:14,19-20`, значения `'qa'`
  или `'relay'`), но нигде в `buildClassGame` или в `ClassGame.jsx` фактически НЕ влияет на
  генерацию или отображение — сохраняется, но не используется.
- **Live-режим** («Следующий ход», кто сейчас читает, WebSocket/polling ведущего) — из
  `GAME_CLASS.md` заявлен как «Этап 2» (после MVP). В коде подтверждено ТОЛЬКО MVP: асинхронная
  генерация + раздача + индивидуальные экраны + отметка «прочитал». Эндпоинта
  `POST /api/class-games/:id/next` НЕТ в `backend/src/routes/classGames.js` (сверено — весь файл
  прочитан, там только `POST /`, `GET /:id/status`, `GET /`, `GET /:id`,
  `POST /:id/lines/:lid/read`, `POST /:id/to-phrasebook`).
- **Ачивки/карта класса/свои фразы учителя** («Плюшки учителю» из `GAME_CLASS.md`) — не найдено в
  коде вообще (ни в `ClassGame.jsx`, ни в `classGame.js`, ни в `classGames.js`).
- **Данные**: таблицы `class_games`/`class_game_lines` подтверждены использованием в SQL-запросах
  (`classGame.js`, `classGames.js`), схема соответствует описанной в `GAME_CLASS.md` (включая
  наличие поля `format`, хоть оно и не используется функционально).

