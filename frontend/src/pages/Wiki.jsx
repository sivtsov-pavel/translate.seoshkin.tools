import { useState } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

// ─── Контент справки по языкам ───────────────────────────────────────────────

const WIKI = {
  ru: {
    title: 'Справка',
    tabs: ['👨‍🏫 Учителю', '👨‍🎓 Ученику', '📲 Установка'],
    teacher: [
      {
        icon: '🎯', title: 'Как устроено обучение',
        body: 'Система использует интервальное повторение (алгоритм SM-2).\n\nУчитель загружает фото страниц учебника → ИИ читает и создаёт карточки → ученик повторяет слова в оптимальные моменты.\n\nЧем лучше ученик помнит слово — тем реже оно появляется. Забытое слово возвращается сразу.',
      },
      {
        icon: '1️⃣', title: 'Регистрация',
        body: 'Зарегистрируйтесь с ролью «Учитель / Родитель». Это даёт полный доступ: создание уроков, просмотр учеников, управление курсами, запуск admin-операций.',
      },
      {
        icon: '2️⃣', title: 'Создайте курс',
        body: 'Перейдите в «Курсы» → «+ Курс». Введите название (например «6 класс 2024/2025»). Курс — это папка для уроков. Ученика можно прикрепить к конкретному курсу.',
      },
      {
        icon: '3️⃣', title: 'Загрузите урок',
        body: '1. Внутри курса нажмите «+ Добавить урок»\n2. Сфотографируйте страницы учебника и/или тетради (можно несколько фото сразу)\n3. По желанию добавьте аудиозапись урока\n4. Нажмите «Обработать урок»\n\nМожно также создать урок через меню «+ Урок» слева.',
      },
      {
        icon: '⏳', title: 'Обработка фото',
        body: 'ИИ читает каждое фото и выделяет слова, грамматику, примеры предложений.\n\n• ~10 секунд на фото\n• 24 фото ≈ 5-8 минут\n• Прогресс: «Фото 3 из 24…» → «Создаю упражнения…» → «Готово!»\n\nСтраницу можно закрыть — обработка идёт на сервере. Статус виден в разделе «Уроки».',
      },
      {
        icon: '4️⃣', title: 'Что создаётся автоматически',
        body: 'Из каждого слова урока ИИ создаёт 7 типов упражнений:\n\n🃏 Флеш-карта — перевернуть и оценить себя\n✏️ Заполни пропуск — вписать слово в предложение\n☑️ Выбор ответа — 4 варианта\n✍️ Напиши предложение — ИИ проверит\n🔤 Добавь букву — угадать пропущенную букву\n🎙️ Диктант — слово произносится вслух, нужно написать\n🗣️ Произношение — скажи слово вслух, система проверит правильность',
      },
      {
        icon: '5️⃣', title: 'Ученики',
        body: 'Ученики регистрируются сами с ролью «Ученик». Их прогресс виден в разделе «Ученики»:\n• Сколько слов выучено\n• Сколько попыток сегодня\n• Какие уроки проходят\n\nМожно прикрепить ученика к конкретному курсу.',
      },
      {
        icon: '📖', title: 'Читалка',
        body: 'Раздел «Читалка» — три режима работы с текстами:\n\n▶ Читать — кликабельный текст с TTS (скорость 0.7×–1.2×). Нажми на слово — перевод из словаря.\n\n🌐 Двуязычный — ИИ переводит абзацы. Выбери любую языковую пару из 8 языков (де→ру, ру→ен и т.д.). Модели: ⚡ Быстро (GPT-4o-mini) или ✨ Точно (GPT-4o).\n\n💬 Разговор — режим как в Google Translate. Два участника по очереди говорят в микрофон — система переводит и произносит ответ. Работает только в Chrome.',
      },
      {
        icon: '🤖', title: 'AI тренер',
        body: 'Раздел «AI тренер» — живые разговорные тренировки с ИИ-наставником.\n\n1. Выбери персонажа:\n🧑‍🏫 Лена — учительница из Берлина\n☕ Макс — бариста в кафе\n🛒 Ганна — продавец в магазине\n🏨 Отто — портье в отеле\n\n2. Выбери тему: Знакомство, Кафе, Покупки, Отель, Ориентирование или Свободная беседа\n\n3. Нажми «Начать разговор» — и общайся!\n\nПерсонаж отвечает на немецком. Под ответом:\n• Перевод на украинский/русский\n• Исправление твоих ошибок (если есть)\n• Кнопка 🔊 для прослушивания\n\nПишешь по-русски или по-украински — ИИ понимает и продолжает диалог.',
      },
      {
        icon: '💬', title: 'Разговорник',
        body: 'Ученики могут сохранять фразы из упражнений кнопкой 📖. Или добавлять вручную — при вводе немецкой фразы ИИ переводит её автоматически.\n\nФразы можно редактировать, отмечать как выученные, фильтровать по категориям.',
      },
      {
        icon: '🌍', title: 'Переводы',
        body: 'Раздел «Переводы» показывает всё переведённое на сайте:\n• Слова словаря (901 слово, 10 языков)\n• Заголовки уроков\n• Фразы разговорника\n• Тексты интерфейса\n\nЕсть глобальный поиск — мгновенно ищет по всем группам.',
      },
      {
        icon: '⚙️', title: 'Admin-операции',
        body: 'В боковой панели (десктоп) или меню есть admin-кнопки для массовых операций:\n\n• 🖼 Картинки — фото для слов из Unsplash\n• ⭐ Словарь++ — примеры предложений через ИИ\n• 🌐 Слова → 10 языков — перевод словаря\n• 📝 Упражнения → языки — перевод вариантов ответов\n• 🔤 Названия → языки — перевод заголовков уроков\n• 🔊 Произношение — добавить голосовые упражнения всем урокам\n• 🔄 Пересоздать всё — обновить все упражнения (сбросит прогресс!)\n\nОперации работают в фоне с прогрессом «сделано/всего». Состояние видно прямо в меню.',
      },
      {
        icon: '🚀', title: '«Обработать всё» — одна кнопка (НОВОЕ)',
        body: 'Теперь при загрузке урока обработка делает ВСЁ сама, кнопки жать не надо:\n\n1. Читает текст с фото\n2. Извлекает слова (📘 учебник + ✏️ тетрадь отдельно)\n3. Создаёт 7 типов упражнений (чистый немецкий, понятно как для детей)\n4. Придумывает название и описание урока\n5. Подбирает картинки к словам\n6. Переводит слова и упражнения на все 10 языков\n\nАвтозаголовок: если тему не задал — «Урок N: <AI-тема>».\n\nДля готового урока — кнопка «✨ Обработать всё»: добирает недостающее (картинки, переводы) БЕЗ сброса прогресса учеников.',
      },
      {
        icon: '✏️', title: 'Свои упражнения из словаря (НОВОЕ)',
        body: 'Собери набор упражнений из нужных слов:\n\n1. Открой «Словарь»\n2. Отфильтруй слова — например «в изучении», или по уроку/части речи/поиском\n3. Нажми «✏️ Набор» (вверху)\n4. Введи название → система соберёт набор упражнений из этих слов и откроет его\n\nУдобно для точечной подготовки к диктанту или закрепления сложных слов. Набор — отдельный «урок», слова не дублируются.',
      },
      {
        icon: '📐', title: 'Грамматика — справочник (НОВОЕ)',
        body: 'Раздел «Грамматика» в меню — шпаргалка по падежам, предлогам, глаголам, Konjunktiv.\n\nСфотографировал грамматический плакат — ИИ вытащил из него правила в аккуратные таблицы:\n• Цвета родов как в школе: 🔵 der · 🔴 die · 🟢 das · ⚫ мн.ч.\n• Вопрос падежа (wer/wen/wem) и понятное объяснение к каждому\n• Оригинал-фото — по кнопке «показать оригинал»\n\nЭто отдельно от словарных уроков — грамматику не мешаем со словами.',
      },
      {
        icon: '🎥', title: 'Видео-аватар тренера (платно, D-ID)',
        body: 'В AI-тренере наставник Pablo может по-настоящему оживать (движение губ) через сервис D-ID — это ПЛАТНАЯ опция.\n\n🟢 Голосовой режим ✨ и готовые видео-клипы (приветствие, «верно/неверно») работают БЕСПЛАТНО и безлимитно.\n\nКнопка 🎥 «оживить» появляется, только когда на балансе D-ID есть кредиты. Подробнее — в Настройках.',
      },
    ],
    student: [
      {
        icon: '🎯', title: 'Как устроено обучение — просто',
        body: 'Представь, что программа — это умный тренер. Она помнит, какие слова ты уже хорошо знаешь, а какие ещё нет.\n\n📅 Хорошо знаешь слово → увидишь его через неделю\n😐 Почти знаешь → через 2-3 дня\n❌ Забыл → сразу повторится сегодня\n\n🔑 Главное правило: заходи КАЖДЫЙ ДЕНЬ и делай упражнения. Даже 10 минут в день дают отличный результат!',
      },
      {
        icon: '1️⃣', title: 'Регистрация',
        body: 'Зарегистрируйся с ролью «Ученик». Спроси у учителя адрес сайта.\n\nПосле входа ты сразу попадёшь на главную страницу «Сегодня».',
      },
      {
        icon: '2️⃣', title: '📅 Страница «Сегодня»',
        body: 'Здесь показаны упражнения, которые НУЖНО сделать сегодня.\n\nВидишь цифры? Это количество упражнений по типам:\n🃏 Флеш-карты\n✏️ Пропуски\n☑️ Выбор ответа\n✍️ Написать предложение\n🔤 Добавить букву\n🎙️ Диктант\n\nНажми «Начать повторение» — и вперёд!',
      },
      {
        icon: '🃏', title: 'Флеш-карта',
        body: 'Тебе показывают немецкое слово. Вспомни перевод, а потом нажми на карточку — увидишь ответ.\n\nОцени себя честно:\n❌ Не помню — слово придёт сегодня снова\n😐 С трудом — через 1 день\n🙂 Нормально — через 3 дня\n✅ Легко помню — через 1 неделю или больше',
      },
      {
        icon: '✏️', title: 'Заполни пропуск',
        body: 'В немецком предложении есть пропуск ___. Напечатай правильное слово и нажми «Проверить».\n\n💡 Подсказка: в предложении видно контекст, это поможет вспомнить слово. Регистр не важен — «Haus» и «haus» засчитаются одинаково.',
      },
      {
        icon: '☑️', title: 'Выбор ответа',
        body: 'Видишь вопрос и 4 варианта? Нажми на правильный.\n\n🟢 Зелёный — верно, переходим дальше\n🔴 Красный — ошибка, посмотри правильный ответ\n\nПосле ответа через секунду откроется следующее упражнение автоматически.',
      },
      {
        icon: '✍️', title: 'Напиши предложение',
        body: 'Тебе дают немецкое слово и подсказку. Напиши ЛЮБОЕ простое предложение на немецком с этим словом.\n\nПример: слово «Hund» → «Ich habe einen Hund.» ✓\n\nИИ проверит:\n• Правильно ли использовано слово\n• Нет ли грубых ошибок\nИ поставит оценку от ★ до ★★★★★',
      },
      {
        icon: '🔤', title: 'Добавь букву',
        body: 'Показывается немецкое слово с пропущенной буквой (или несколькими). Нужно угадать какая буква пропущена.\n\nПример: «_aus» → «H» → «Haus» ✓\n\nЭто помогает запомнить правописание немецких слов с умлаутами (ä, ö, ü).',
      },
      {
        icon: '🎙️', title: 'Диктант',
        body: 'Слово произносится вслух по-немецки. Ты его слышишь, но не видишь — нужно написать правильно!\n\n1. Слушай внимательно 🎵\n2. Нажми ◄ если хочешь услышать ещё раз\n3. Напечатай слово\n4. Нажми «Проверить»\n\nЭто самое сложное упражнение — оно проверяет и слух, и правописание!',
      },
      {
        icon: '🗣️', title: 'Произношение — говори по-немецки',
        body: 'Тебе показывают перевод слова на русском — ты должен СКАЗАТЬ немецкое слово вслух.\n\n1. Прочитай русский перевод\n2. Нажми на кнопку 🎤 (или скажи сразу — кнопка появится сама)\n3. Произнеси немецкое слово в микрофон\n4. Система покажет что услышала и совпадение\n\n✅ Правильно — идём дальше\n😕 Неточно — попробуй ещё раз или нажми «Пропустить»\n\n⚠️ Работает в Chrome на Android/ПК. На iPhone пока только чтение.\n\n💡 Совет: нажми кнопку 🔊 чтобы сначала услышать как звучит слово правильно.',
      },
      {
        icon: '📖', title: 'Читалка — читаем и переводим тексты',
        body: 'Раздел «Читалка» — три режима:\n\n▶ Читать — вставь текст, нажми кнопку и слушай. Нажми на слово — увидишь перевод из словаря.\n\n🌐 Двуязычный — ИИ переводит текст абзац за абзацем. Выбери языки (например немецкий → русский). Нажми «Перевести».\n\n💬 Разговор — как Google Translate! Два человека говорят по очереди в микрофон — система переводит и произносит вслух. Удобно на уроке или для разговора с носителем языка.\n\n⚠️ Режимы с микрофоном работают только в Chrome.',
      },
      {
        icon: '💬', title: 'Разговорник — твои фразы',
        body: 'В разговорник попадают фразы, которые ты сохранил из упражнений (кнопка 📖).\n\nТакже можно добавить фразу вручную:\n1. Нажми «+ Добавить фразу»\n2. Напечатай немецкую фразу\n3. Выйди из поля — ИИ переведёт сам!\n4. Поправь если нужно и сохрани\n\nОтметь фразу ✅ когда выучишь её.',
      },
      {
        icon: '🤖', title: 'AI тренер — живые диалоги (ОБНОВЛЕНО)',
        body: 'Раздел «AI тренер» — живой разговор с наставником. Первый — 🤓 Pablo (основатель), а также Лена, Макс, Ганна, Отто.\n\nВыбери персонажа и тему (или «Слова урока N») → «Начать разговор».\n\nПерсонаж отвечает по-немецки, под сообщением: перевод, твои ошибки, 🔊 прослушать.\n\n✨ ГОЛОСОВОЙ РЕЖИМ (как в Gemini): нажми ✨ рядом с полем ввода → большое фото Pablo, он здоровается и слушает. Просто говори — руки свободны! Он отвечает голосом, реагирует «верно/неверно» (цвета Германии), а снизу идёт лог чата (немецкое + перевод, 🔊 прослушать). Говорить можно по-немецки (точное распознавание) или переключить на свой язык.\n\n⚠️ Голос работает в Chrome (Android/ПК).',
      },
      {
        icon: '📐', title: 'Грамматика — шпаргалка (НОВОЕ)',
        body: 'Раздел «Грамматика» в меню — справочник по падежам, предлогам, глаголам.\n\nОткрой любую тему → увидишь понятное объяснение и цветные таблицы:\n🔵 der (муж.) · 🔴 die (жен.) · 🟢 das (ср.) · ⚫ мн.ч.\n\nК каждому падежу — вопрос (кто? кого? кому?) и объяснение, когда он нужен. Смотри и повторяй перед упражнениями.',
      },
      {
        icon: '🎬', title: 'Pablo в упражнениях (НОВОЕ)',
        body: 'Теперь в упражнениях наставник Pablo реагирует на твой ответ: его лицо оживает и говорит «Sehr gut!» если верно или «Nicht ganz» если ошибся.\n\nЕсли хочешь только текст без видео — можно выключить: Настройки → Голос → «Тренер в упражнениях».',
      },
      {
        icon: '👤', title: 'Профиль — аватар и данные',
        body: 'Нажми на аватар (кружок с буквой или эмодзи) в левом меню — откроется профиль.\n\nЧто можно настроить:\n• Аватар — выбери из 12 эмодзи или останется буква имени\n• Полное имя, профессия\n• Телефон, Telegram, WhatsApp\n• Смена пароля\n\nЭти данные видны учителю в разделе «Ученики».',
      },
      {
        icon: '🔊', title: 'Голос и настройки',
        body: 'В меню (кнопка ☰ слева или снизу на телефоне):\n\n🔊 вкл/выкл — включить автопроизношение слов\n🎤 Голос — выбрать немецкий голос (Google Deutsch звучит лучше всего)\n🌙/☀️ — тёмная или светлая тема\n🌍 Язык — переключить язык интерфейса\n\nМожно включить произношение перевода — тогда после немецкого слова прозвучит и русский.',
      },
    ],
    install: [
      {
        icon: '📱', title: 'Что такое установка приложения?',
        body: 'Наш сайт — это так называемое PWA (Progressive Web App, «Прогрессивное веб-приложение»).\n\nЭто значит: сайт МОЖНО установить как обычное приложение на телефон или ноутбук. После установки:\n✅ Запускается без браузера, как настоящее приложение\n✅ Открывается быстрее\n✅ Работает на весь экран (без адресной строки)\n✅ Появляется в списке приложений на телефоне',
      },
      {
        icon: '🤖', title: 'Установка на Android (телефон/планшет)',
        body: '1. Открой сайт в Chrome\n2. Подожди 10-15 секунд\n3. Внизу экрана появится плашка: «Добавить Deutsch Lernen на главный экран»\n4. Нажми «Установить» или «Добавить»\n\nЕсли плашка не появилась:\n• Нажми три точки ⋮ в правом верхнем углу Chrome\n• Выбери «Добавить на главный экран»\n• Нажми «Установить»\n\nГотово! Приложение появится на рабочем столе.',
      },
      {
        icon: '🍎', title: 'Установка на iPhone/iPad',
        body: '1. Открой сайт в браузере Safari (именно Safari, не Chrome!)\n2. Нажми кнопку «Поделиться» снизу экрана — это значок квадрата со стрелкой вверх ⬆️\n3. Прокрути список вниз\n4. Нажми «На экран «Домой»»\n5. Нажми «Добавить»\n\nПриложение появится на главном экране, как обычное приложение.\n\n⚠️ Важно: на iPhone работает только через Safari. Chrome и другие браузеры пока не поддерживают установку PWA на iOS.',
      },
      {
        icon: '💻', title: 'Установка на ноутбук (Windows/Mac)',
        body: 'В браузере Chrome или Edge:\n\n1. Открой сайт\n2. В адресной строке справа появится значок ⊕ или иконка монитора — нажми его\n3. Нажми «Установить»\n\nИли через меню:\n• Chrome: три точки ⋮ → «Сохранить и поделиться» → «Создать ярлык» → «Открывать как окно» ✓\n• Edge: три точки … → «Приложения» → «Установить этот сайт как приложение»\n\nПосле установки приложение запускается как отдельное окно без адресной строки.',
      },
      {
        icon: '🏪', title: 'Google Play (скоро)',
        body: 'В будущем приложение появится в Google Play Store — тогда можно будет установить как обычное приложение через магазин.\n\nАктуальная версия всегда доступна на сайте translate.seoshkin.tools — там обновления появляются мгновенно, без ожидания проверки в магазине.\n\nPWA-приложение (установка через браузер) работает так же хорошо, как приложение из магазина.',
      },
      {
        icon: '🔄', title: 'Обновления',
        body: 'Приложение обновляется автоматически — при следующем открытии оно само загрузит новую версию.\n\nНичего делать не нужно — все улучшения появятся сами.',
      },
    ],
  },

  en: {
    title: 'Help',
    tabs: ['👨‍🏫 Teacher', '👨‍🎓 Student', '📲 Install'],
    teacher: [
      { icon: '🎯', title: 'How learning works', body: 'The system uses spaced repetition (SM-2 algorithm).\n\nTeacher uploads textbook photos → AI reads and creates cards → student repeats words at optimal times.\n\nThe better the student remembers a word — the less often it appears.' },
      { icon: '1️⃣', title: 'Registration', body: 'Sign up with role "Teacher / Parent". This gives full access: lessons, students, courses, admin operations.' },
      { icon: '2️⃣', title: 'Create a course', body: 'Go to "Courses" → "+ Course". Enter a name (e.g. "Grade 6, 2024/2025"). A course is a folder for lessons.' },
      { icon: '3️⃣', title: 'Upload a lesson', body: '1. Click "+ Add lesson" inside a course\n2. Photo the textbook/notebook pages (multiple photos OK)\n3. Optionally add an audio recording\n4. Click "Process lesson"' },
      { icon: '⏳', title: 'Processing', body: 'AI reads each photo and extracts words, grammar, example sentences.\n• ~10 sec per photo\n• 24 photos ≈ 5-8 minutes\n• Progress shown on screen' },
      { icon: '4️⃣', title: 'What is created', body: 'For each word the AI creates 7 exercise types:\n🃏 Flashcard\n✏️ Fill in the blank\n☑️ Multiple choice\n✍️ Write a sentence\n🔤 Add the letter\n🎙️ Dictation\n🗣️ Speaking — say the word aloud, the system checks pronunciation' },
      { icon: '5️⃣', title: 'Students', body: 'Students register themselves. View their progress under "Students": words learned, attempts today, which lessons they study.' },
      { icon: '📖', title: 'Reader', body: 'Three modes:\n▶ Read — clickable text with TTS playback, click a word to see its translation.\n🌐 Bilingual — AI translates paragraphs in any of 8 language pairs. Choose ⚡ Fast (GPT-4o-mini) or ✨ Accurate (GPT-4o).\n💬 Conversation — like Google Translate: two people speak into the mic in turn, the system translates and reads the answer aloud. Chrome only.' },
      { icon: '💬', title: 'Phrasebook', body: 'Students save phrases from exercises with the 📖 button. Or add them manually — when a German phrase is typed, AI auto-translates it.' },
    ],
    student: [
      { icon: '🎯', title: 'How learning works — simple', body: 'Think of the app as a smart trainer. It remembers which words you know well and which you don\'t.\n\n📅 Know it well → see it in a week\n😐 Almost → in 2-3 days\n❌ Forgot → repeats today\n\n🔑 Key rule: open the app EVERY DAY and do your exercises. Even 10 minutes gives great results!' },
      { icon: '1️⃣', title: 'Registration', body: 'Sign up with the "Student" role. Ask your teacher for the website address.' },
      { icon: '2️⃣', title: '📅 "Today" page', body: 'This shows exercises due TODAY. You can see counts by type. Click "Start review" — and go!' },
      { icon: '🃏', title: 'Flashcard', body: 'A German word is shown. Remember the translation, then tap the card to reveal it. Rate yourself honestly:\n❌ Don\'t know\n😐 Hard to remember\n🙂 OK\n✅ Easy' },
      { icon: '✏️', title: 'Fill in the blank', body: 'A German sentence with a ___ gap. Type the missing word and press "Check". Case doesn\'t matter.' },
      { icon: '☑️', title: 'Multiple choice', body: 'A question with 4 options. Tap the right one. Green = correct, red = wrong. Auto-advances after 1 second.' },
      { icon: '✍️', title: 'Write a sentence', body: 'You get a German word and a hint. Write ANY simple German sentence with that word. AI checks it and gives a star rating.' },
      { icon: '🔤', title: 'Add the letter', body: 'A German word with a missing letter. Guess which letter is missing.\n\nExample: "_aus" → "H" → "Haus" ✓\n\nHelps you remember spelling of words with umlauts (ä, ö, ü).' },
      { icon: '🎙️', title: 'Dictation', body: 'A word is spoken aloud in German. You hear it but don\'t see it — type it correctly!\n\n1. Listen carefully 🎵\n2. Press ◄ to hear again\n3. Type the word\n4. Press "Check"\n\nThe hardest exercise — tests both listening and spelling!' },
      { icon: '🗣️', title: 'Speaking — say it aloud', body: 'You see the Russian translation — say the German word aloud into the microphone.\n\n1. Read the translation\n2. Press the 🎤 button\n3. Speak the German word\n4. System shows what it heard and the match score\n\n✅ Correct — move on\n😕 Off — try again or skip\n\n⚠️ Works in Chrome (Android / PC). Tip: press 🔊 first to hear the correct pronunciation.' },
      { icon: '📖', title: 'Reader', body: '▶ Read — paste text, click Split, click any word to see its translation.\n🌐 Bilingual — AI translates paragraph by paragraph (8 language pairs, 2 model options).\n💬 Conversation — two people speak in turns, AI translates and reads the reply aloud. Great for class or talking with a native speaker. Chrome only.' },
      { icon: '💬', title: 'Phrasebook', body: 'Save phrases from exercises with 📖. Or add manually — type German, tab out, AI translates automatically. Mark ✅ when you\'ve learned it.' },
    ],
    install: [
      { icon: '📱', title: 'What is app installation?', body: 'Our site is a PWA (Progressive Web App). This means you can install it like a regular app on your phone or laptop.\n\nAfter installation:\n✅ Opens without a browser\n✅ Loads faster\n✅ Full screen (no address bar)\n✅ Appears in your app list' },
      { icon: '🤖', title: 'Install on Android', body: '1. Open the site in Chrome\n2. Wait 10-15 seconds\n3. A banner appears: "Add Deutsch Lernen to home screen"\n4. Tap "Install"\n\nIf no banner:\n• Tap ⋮ (top right in Chrome)\n• "Add to Home screen"\n• "Install"' },
      { icon: '🍎', title: 'Install on iPhone/iPad', body: '1. Open in Safari (not Chrome!)\n2. Tap the Share button ⬆️ at the bottom\n3. Scroll down, tap "Add to Home Screen"\n4. Tap "Add"\n\n⚠️ Only works in Safari on iOS.' },
      { icon: '💻', title: 'Install on laptop (Windows/Mac)', body: 'In Chrome or Edge:\n\n1. Open the site\n2. Click the ⊕ icon in the address bar\n3. Click "Install"\n\nOr: Chrome menu ⋮ → "Cast, save, and share" → "Create shortcut" → check "Open as window"' },
      { icon: '🔄', title: 'Updates', body: 'The app updates automatically — next time you open it, it loads the new version. Nothing to do.' },
    ],
  },

  de: {
    title: 'Hilfe',
    tabs: ['👨‍🏫 Lehrer', '👨‍🎓 Schüler', '📲 Installieren'],
    teacher: [
      { icon: '🎯', title: 'Wie das Lernen funktioniert', body: 'Das System nutzt Spaced Repetition (SM-2-Algorithmus).\n\nLehrer lädt Lehrbuchfotos hoch → KI liest und erstellt Karten → Schüler wiederholt Wörter zum optimalen Zeitpunkt.' },
      { icon: '1️⃣', title: 'Registrierung', body: 'Registriere dich mit der Rolle „Lehrer / Elternteil".' },
      { icon: '2️⃣', title: 'Kurs erstellen', body: 'Gehe zu „Kurse" → „+ Kurs". Gib einen Namen ein (z.B. „Klasse 6, 2024/2025").' },
      { icon: '3️⃣', title: 'Lektion hochladen', body: '1. Klicke „+ Lektion hinzufügen"\n2. Fotografiere die Seiten des Lehrbuchs\n3. Optional: Audioaufnahme\n4. Klicke „Lektion verarbeiten"' },
      { icon: '4️⃣', title: 'Was erstellt wird', body: 'Für jedes Wort erstellt die KI 6 Übungen:\n🃏 Lernkarte\n✏️ Lückentext\n☑️ Mehrfachauswahl\n✍️ Satz schreiben\n🔤 Buchstabe ergänzen\n🎙️ Diktat' },
    ],
    student: [
      { icon: '🎯', title: 'Wie das Lernen funktioniert', body: 'Die App ist wie ein kluger Trainer. Sie merkt sich welche Wörter du kennst.\n📅 Gut bekannt → in einer Woche\n😐 Fast → in 2-3 Tagen\n❌ Vergessen → heute nochmal\n\n🔑 Jeden Tag üben — schon 10 Minuten helfen!' },
      { icon: '1️⃣', title: 'Registrierung', body: 'Registriere dich mit der Rolle „Schüler". Frage deinen Lehrer nach der Adresse.' },
      { icon: '🃏', title: 'Lernkarte', body: 'Ein deutsches Wort wird angezeigt. Denke an die Übersetzung, tippe dann auf die Karte. Bewerte ehrlich wie gut du es weißt.' },
      { icon: '✏️', title: 'Lückentext', body: 'Fülle die Lücke ___ im Satz aus und klicke „Prüfen".' },
      { icon: '☑️', title: 'Mehrfachauswahl', body: 'Wähle die richtige Antwort aus 4 Optionen.' },
      { icon: '✍️', title: 'Satz schreiben', body: 'Schreibe einen einfachen deutschen Satz mit dem gegebenen Wort. Die KI prüft ihn.' },
      { icon: '🔤', title: 'Buchstabe ergänzen', body: 'Ein Wort mit fehlendem Buchstaben. Rate welcher Buchstabe fehlt.\nBeispiel: „_aus" → „H" → „Haus" ✓' },
      { icon: '🎙️', title: 'Diktat', body: 'Ein Wort wird auf Deutsch ausgesprochen. Du hörst es, siehst es aber nicht — schreibe es richtig!\n1. Höre genau zu 🎵\n2. Drücke ◄ zum Wiederholen\n3. Schreibe das Wort\n4. Drücke „Prüfen"' },
    ],
    install: [
      { icon: '📱', title: 'Was ist App-Installation?', body: 'Unsere Seite ist eine PWA. Sie kann wie eine normale App installiert werden.\n✅ Startet ohne Browser\n✅ Lädt schneller\n✅ Vollbild (keine Adressleiste)' },
      { icon: '🤖', title: 'Installation auf Android', body: '1. Öffne die Seite in Chrome\n2. Warte 10-15 Sekunden\n3. Banner erscheint: „Zum Startbildschirm hinzufügen"\n4. Tippe „Installieren"' },
      { icon: '🍎', title: 'Installation auf iPhone/iPad', body: '1. Öffne in Safari\n2. Tippe das Teilen-Symbol ⬆️\n3. „Zum Home-Bildschirm"\n4. „Hinzufügen"' },
      { icon: '💻', title: 'Installation auf Laptop', body: 'In Chrome oder Edge:\n1. Öffne die Seite\n2. Klicke ⊕ in der Adressleiste\n3. Klicke „Installieren"' },
    ],
  },

  uk: {
    title: 'Довідка',
    tabs: ['👨‍🏫 Вчителю', '👨‍🎓 Учню', '📲 Встановлення'],
    teacher: [
      { icon: '🎯', title: 'Як влаштоване навчання', body: 'Система використовує інтервальне повторення (алгоритм SM-2).\n\nВчитель завантажує фото підручника → ШІ читає та створює картки → учень повторює слова в оптимальні моменти.' },
      { icon: '1️⃣', title: 'Реєстрація', body: 'Зареєструйтесь з роллю «Вчитель / Батьки».' },
      { icon: '3️⃣', title: 'Завантажте урок', body: '1. Натисніть «+ Додати урок»\n2. Сфотографуйте сторінки підручника\n3. За бажанням додайте аудіо\n4. Натисніть «Обробити урок»' },
      { icon: '4️⃣', title: 'Що створюється', body: 'З кожного слова ШІ створює 6 вправ:\n🃏 Картка\n✏️ Заповни пропуск\n☑️ Обери відповідь\n✍️ Напиши речення\n🔤 Додай букву\n🎙️ Диктант' },
    ],
    student: [
      { icon: '🎯', title: 'Як влаштоване навчання', body: 'Уявляй що додаток — це розумний тренер. Він пам\'ятає які слова ти вже знаєш.\n📅 Добре знаєш → через тиждень\n😐 Майже → через 2-3 дні\n❌ Забув → повториться сьогодні\n\n🔑 Заходь ЩОДНЯ і роби вправи!' },
      { icon: '🃏', title: 'Картка', body: 'Показується німецьке слово. Пригадай переклад, потім натисни картку. Оціни себе чесно.' },
      { icon: '✏️', title: 'Заповни пропуск', body: 'Введи слово у пропуск ___ та натисни «Перевірити».' },
      { icon: '☑️', title: 'Обери відповідь', body: 'Вибери правильну відповідь з 4 варіантів.' },
      { icon: '✍️', title: 'Напиши речення', body: 'Напиши просте речення німецькою з даним словом. ШІ перевірить його.' },
      { icon: '🔤', title: 'Додай букву', body: 'Слово з пропущеною буквою. Вгадай яка буква пропущена.\nПриклад: «_aus» → «H» → «Haus» ✓' },
      { icon: '🎙️', title: 'Диктант', body: 'Слово вимовляється вголос. Ти чуєш але не бачиш — напиши правильно!\n1. Слухай уважно 🎵\n2. ◄ — послухати ще раз\n3. Напиши слово\n4. «Перевірити»' },
    ],
    install: [
      { icon: '📱', title: 'Що таке встановлення?', body: 'Наш сайт — це PWA. Його можна встановити як звичайний застосунок.\n✅ Запускається без браузера\n✅ Завантажується швидше\n✅ Повноекранний режим' },
      { icon: '🤖', title: 'Встановлення на Android', body: '1. Відкрий сайт у Chrome\n2. Почекай 10-15 секунд\n3. З\'явиться плашка «Додати на головний екран»\n4. Натисни «Встановити»' },
      { icon: '🍎', title: 'Встановлення на iPhone/iPad', body: '1. Відкрий у Safari\n2. Натисни кнопку «Поділитися» ⬆️\n3. «На екран "Домів"»\n4. «Додати»' },
      { icon: '💻', title: 'Встановлення на ноутбук', body: 'У Chrome або Edge:\n1. Відкрий сайт\n2. Натисни ⊕ в рядку адреси\n3. «Встановити»' },
    ],
  },
}

// ─── Раздел «Администрирование» (только для супер-админа id=1) ────────────────
// Контент на русском (для Павла). Прикрепляется ко всем языкам одинаково.
const ADMIN_SECTION = [
  {
    icon: '⚙️', title: 'Супер-админ панель',
    body: 'Страница «Супер-админ» в меню (раздел «Платформа») — видна только тебе (пользователь id=1, Administrator).\n\nТри вкладки:\n📊 Обзор — статистика платформы: пользователи (учителя/ученики/активные), контент (уроки, слова, упражнения, репетиторы), ответов за 24ч.\n💶 Монетизация — реклама, тарифы, лимиты, фичи.\n👥 Пользователи — все аккаунты, роли, объём контента, последняя активность.',
  },
  {
    icon: '📢', title: 'Реклама (AdSense)',
    body: 'Во вкладке «Монетизация» → «Реклама»:\n• Тумблер «Реклама включена»\n• Раздельно по девайсам: 📱 телефон (по умолчанию ВЫКЛ), планшет и десктоп (ВКЛ)\n• Поля AdSense client ID (ca-pub-…) и Slot ID\n\nБаннеры показываются ТОЛЬКО бесплатным пользователям и только на разрешённых девайсах. Пока не вписан client ID — реклама не показывается вообще.\n\n➡️ Активируем на новом домене: завести Google AdSense, дождаться одобрения сайта, вписать client/slot сюда.',
  },
  {
    icon: '💰', title: 'Монетизация и тарифы',
    body: 'Вкладка «Монетизация»:\n• «Платная версия включена» — главный тумблер (пока ВЫКЛ → всё бесплатно, лимиты не действуют)\n• «Бесплатный дневной лимит» — сколько упражнений в день у бесплатных (режет только когда платная версия включена)\n• Тарифы: валюта (EUR), месяц / год / навсегда\n• Фичи: AI-тренер бесплатно, видео-аватар (D-ID), каталог репетиторов\n\nВсё сохраняется на сервере, применяется сразу.',
  },
  {
    icon: '💳', title: 'Как включить оплату (Stripe)',
    body: 'Подписки готовы в коде, но спят без ключей. Чтобы включить:\n\n1. Завести аккаунт Stripe\n2. Создать 1 продукт + 2 цены (месяц и год)\n3. Добавить в .env сервера (НЕ в git):\n   STRIPE_SECRET_KEY\n   STRIPE_WEBHOOK_SECRET\n   STRIPE_PRICE_MONTHLY\n   STRIPE_PRICE_YEARLY\n4. В Stripe настроить вебхук на:\n   https://<домен>/api/billing/webhook\n   события: customer.subscription.*, checkout.session.completed\n5. В супер-админке включить «Платная версия»\n\nПосле этого страница «⭐ Premium» (/upgrade) начнёт принимать оплату, а вебхук сам проставит пользователю premium.\n\n➡️ Активируем на новом домене.',
  },
  {
    icon: '⭐', title: 'Тарифы пользователей (plan)',
    body: 'У каждого пользователя есть тариф: free или premium (поле users.plan).\n• Супер-админ (id=1) — всегда premium (без рекламы и лимитов)\n• Premium ставится оплатой Stripe (или вручную в БД)\n\nУ не-премиум в меню есть пункт «⭐ Premium» → страница /upgrade с тарифами. Premium = без рекламы и без дневных лимитов.',
  },
  {
    icon: '📲', title: 'Установка приложения (PWA)',
    body: 'Своя кнопка «Установить приложение» появляется автоматически, когда установка доступна (Android/десктоп Chrome/Edge). На iPhone показывается подсказка «Поделиться → На экран „Домой"».\n\nBrowser сам глушит авто-подсказку после установки/удаления — поэтому и сделана своя кнопка. Прячется, если приложение уже установлено или нажали «Позже». Работает на 10 языках.',
  },
]
// Прикрепляем один и тот же раздел ко всем языкам
for (const l of Object.keys(WIKI)) WIKI[l].admin = ADMIN_SECTION

// ─── Игра «Класс говорит» — для учителя и ученика (добавляется во все языки) ──
const GAME_TEACHER = {
  icon: '🎮', title: 'Игра «Класс говорит» (НОВОЕ)',
  body: 'В конце урока — живая игра фразами вместо повторения одних и тех же слов.\n\nКак запустить:\n1. На карточке урока (главная) нажми «🎮 Игра класса».\n2. Укажи, сколько фраз собрать (например 30).\n3. ИИ придумает столько РАЗНЫХ коротких немецких фраз из слов урока (вопросы, ответы, утверждения) и переведёт каждую на язык КАЖДОГО ученика.\n4. Фразы раздаются ученикам по кругу — у каждого свои, никто не читает одинаковое. Каждому прилетает push.\n\nТы — ведущий: открываешь игру и видишь ВСЕ фразы по ученикам (кто что читает, кто уже прочитал). Даёшь читать по очереди — получается живой урок, где класс тренирует не 5 слов, а 25–35 разных предложений.',
}
const GAME_STUDENT = {
  icon: '🎮', title: 'Игра «Класс говорит» (НОВОЕ)',
  body: 'Учитель собирает игру по уроку — тебе приходит уведомление «🎮 Игра класса готова» (или баннер на главной).\n\nОткрой её — увидишь СВОИ фразы (у каждого ученика свои, разные). Каждая фраза:\n• по-немецки крупно + 🔊 послушать,\n• перевод на твой язык.\n\nЧитай вслух, когда скажет учитель, и жми «Прочитал». В конце можно сохранить все фразы в свой Разговорник кнопкой «📖 Сохранить в разговорник» — они тематические, пригодятся.\n\nСмысл: читаешь много РАЗНЫХ предложений (а не одно и то же на весь класс) — так немецкий учится быстрее.',
}
// 📷 Камера / «немецкий объектив» + 👆 тап-перевод (для всех языков)
const CAMERA_TEACHER = {
  icon: '📷', title: 'Камера — фото в урок (НОВОЕ)',
  body: 'Больше не нужны телефон/ноут/Google Photos — снимай прямо в приложении.\n\n1) В урок: при создании/редактировании урока в блоках «📘 Учебник» и «✏️ Тетрадь/доска» есть кнопка «📷 Сфотографировать» — снимаешь страницу, и она сразу идёт в обработку (слова, упражнения, переводы на 10 языков — всё автоматически).\n\n2) Наш «объектив» в Читалке: кнопка «📷 Слова с фото» — наводишь на текст/вывеску, ИИ распознаёт немецкие слова, показывает какие уже в словаре, а какие новые, и даёт сохранить в разговорник или в урок (учитель выбирает группу).\n\nКартинки к словам рисуются нашими детскими рисунками (переключатель авто/вручную — в супер-админке).',
}
const CAMERA_STUDENT = {
  icon: '📷', title: 'Читай нажатием + камера (НОВОЕ)',
  body: '👆 Тап-перевод: в упражнениях (Заполни пропуск, Напиши предложение, Флеш-карта) и в Читалке нажми на любое немецкое слово или предлог — сразу увидишь перевод на свой язык и сможешь послушать 🔊. Если слова нет в твоём словаре — кнопка «＋ в разговорник».\n\n📷 «Немецкий объектив»: в Читалке кнопка «📷 Слова с фото» — сфоткай немецкий текст (вывеску, страницу), приложение распознает слова и предложит сохранить новые к себе.',
}
for (const l of Object.keys(WIKI)) {
  WIKI[l].teacher = [...WIKI[l].teacher, GAME_TEACHER, CAMERA_TEACHER]
  WIKI[l].student = [...WIKI[l].student, GAME_STUDENT, CAMERA_STUDENT]
}

// ─── Компонент ───────────────────────────────────────────────────────────────

const TAB_SUBTITLES = {
  ru: ['Инструкции для учителей и родителей', 'Инструкции для учеников', 'Как установить приложение'],
  en: ['Instructions for teachers and parents', 'Instructions for students', 'How to install the app'],
  de: ['Anleitungen für Lehrer und Eltern', 'Anleitungen für Schüler', 'App installieren'],
  uk: ['Інструкції для вчителів і батьків', 'Інструкції для учнів', 'Як встановити додаток'],
}

export default function Wiki() {
  const { lang } = useI18nStore()
  const { user } = useAuthStore()
  const [tab, setTab] = useState(0)
  // Для языков без перевода — EN как fallback (не RU)
  const content = WIKI[lang] || WIKI.en
  const isAdmin = user?.id === 1
  // Вкладка «Администрирование» — только у супер-админа (id=1)
  const tabs = isAdmin ? [...content.tabs, '⚙️ Админ'] : content.tabs
  const subtitles = TAB_SUBTITLES[lang] || TAB_SUBTITLES.en
  const sections = tab === 0 ? content.teacher : tab === 1 ? content.student : tab === 2 ? content.install : content.admin

  return (
    <div style={{ paddingTop: 24, paddingBottom: 60 }}>
      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 6px' }}>{content.title}</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: '0 0 20px' }}>
        {subtitles[tab] || 'Настройки платформы — только для администратора'}
      </p>

      {/* Вкладки */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map((label, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 20,
            border: tab === i ? 'none' : '1px solid var(--line)',
            cursor: 'pointer',
            background: tab === i ? 'var(--accent)' : 'var(--surface-2)',
            color: tab === i ? 'var(--accent-ink)' : 'var(--ink)',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Секции */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sections.map((sec, i) => (
          <Section key={i} sec={sec} />
        ))}
      </div>
    </div>
  )
}

function Section({ sec }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>{sec.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1, color: 'var(--ink)' }}>{sec.title}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ color: 'var(--ink-soft)', fontSize: 12 }} />
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px 54px', color: 'var(--ink)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {sec.body}
        </div>
      )}
    </div>
  )
}
