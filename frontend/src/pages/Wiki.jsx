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
      {
        icon: '📊', title: 'Аналитика класса (НОВОЕ)',
        body: 'Раздел «📊 Аналитика класса» — кнопка на странице «Ученики» (или блок на главной).\n\nЧто видно по твоим урокам:\n• Итоги: сколько учеников, кто активен за 7 дней, всего ответов, общая точность\n• По каждому ученику: сколько ответов (и за неделю), точность %, сколько слов знает/учит, когда был(а) последний раз\n• 🔥 Трудные слова — где больше всего ошибок (что стоит переучить)\n• Где застревают — точность по типам упражнений (диктант, произношение, выбор…)\n\nЦвет точности: красный <60%, жёлтый <80%, зелёный выше. Данные копятся сами, пока ученики решают.',
      },
      {
        icon: '🔍', title: 'Фильтры Словаря: скан, буквы (НОВОЕ)',
        body: 'В Словаре теперь можно быстро отобрать слова:\n\n📄 По СКАНУ — выбери урок, и появятся чипы «Скан 1 / Скан 2…» (страницы учебника). Показывает слова именно с этой страницы. Работает для уроков, залитых несколькими фото.\n\n🔤 По БУКВЕ — чипы алфавита: только слова на выбранную букву.\n\nФильтры складываются с курсом/уроком/статусом и поиском.',
      },
      {
        icon: '🗣️', title: 'AI-тренер стал естественнее (ОБНОВЛЕНО)',
        body: 'Тренер теперь ведёт живой диалог, а не «урок»:\n• По умолчанию НЕ переводит свои реплики на русский — ученик понимает из контекста (перевод можно включить отдельно)\n• Не здоровается в каждом сообщении и не хвалит/ругает ритуально\n• Разбор ошибок и общая оценка — в итоговом отчёте, а не после каждой фразы\n\nЭто ближе к реальному разговору с носителем.',
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
      {
        icon: '🔗', title: 'Поделиться карточкой (НОВОЕ)',
        body: 'Понравилось слово — поделись им с другом!\n\nВ Словаре у слова есть кнопка 🔗. Нажми — ссылка на карточку скопируется (или откроется меню «Поделиться» на телефоне: Telegram, WhatsApp…).\n\nДруг откроет ссылку и увидит карточку: слово, перевод на СВОЙ язык, картинку, пример, кнопку 🔊 послушать и «➕ в разговорник» — добавить слово себе.',
      },
      {
        icon: '🔍', title: 'Словарь: фильтр по букве и скану (НОВОЕ)',
        body: 'В Словаре теперь легко найти нужные слова:\n\n🔤 Буква — нажми букву алфавита, останутся только слова на неё.\n\n📄 Скан — если выбрать урок, появятся чипы «Скан 1 / Скан 2…» (страницы учебника) — слова именно с той страницы.\n\nМожно совмещать с поиском и статусом (новое/учу/знаю).',
      },
      {
        icon: '🗣️', title: 'AI-тренер — живее (ОБНОВЛЕНО)',
        body: 'Тренер теперь общается как настоящий собеседник:\n• Не переводит каждую свою фразу — старайся понять по смыслу (перевод можно включить в настройках)\n• Не здоровается и не хвалит в каждом сообщении — просто живой разговор\n• Разбор ошибок — в конце, в отчёте\n\nТак ты быстрее привыкаешь понимать немецкий на слух.',
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
        body: 'В будущем приложение появится в Google Play Store — тогда можно будет установить как обычное приложение через магазин.\n\nАктуальная версия всегда доступна на сайте deutschlernen.ai — там обновления появляются мгновенно, без ожидания проверки в магазине.\n\nPWA-приложение (установка через браузер) работает так же хорошо, как приложение из магазина.',
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
      { icon: '📊', title: 'Class analytics (NEW)', body: '"Class analytics" — a button on the Students page. For your lessons: totals (students, active in 7 days, answers, overall accuracy), per student (answers, accuracy, words known/learning, last seen), 🔥 hardest words (most mistakes), and where students struggle by exercise type. Data builds up as students practice.' },
      { icon: '🔍', title: 'Dictionary filters: scan, letters (NEW)', body: 'In the Dictionary you can filter words: 📄 by SCAN — pick a lesson to get "Scan 1 / Scan 2…" chips (textbook pages), showing words from that page (for lessons uploaded as several photos). 🔤 by LETTER — alphabet chips. Combines with course/lesson/status/search.' },
      { icon: '🗣️', title: 'AI trainer feels more natural (UPDATED)', body: 'The trainer now holds a real conversation: by default it does NOT translate its replies (understand from context; translation can be enabled), it does not greet or praise in every message, and error review plus the overall score go into the final report.' },
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
      { icon: '🔗', title: 'Share a card (NEW)', body: 'Like a word? Share it! In the Dictionary each word has a 🔗 button — tap it to copy a link (or open the phone Share sheet: Telegram, WhatsApp…). Your friend opens it and sees the card: the word, a translation in THEIR language, an image, a 🔊 listen button and "➕ to phrasebook".' },
      { icon: '🔍', title: 'Dictionary: filter by letter and scan (NEW)', body: '🔤 Letter — tap an alphabet letter to keep only those words. 📄 Scan — pick a lesson to get "Scan 1/2…" chips (textbook pages) with words from that page. Works together with search and status.' },
      { icon: '🗣️', title: 'AI trainer — livelier (UPDATED)', body: 'The trainer now talks like a real partner: it does not translate every line (try to understand by meaning; you can enable translation in settings), it does not greet or praise in every message, and it reviews mistakes at the end. You get used to understanding German faster.' },
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
      { icon: '📊', title: 'Klassen-Analytik (NEU)', body: '„Klassen-Analytik" — Button auf der Seite „Schüler". Zu deinen Lektionen: Gesamtwerte (Schüler, aktiv in 7 Tagen, Antworten, Gesamtgenauigkeit), pro Schüler (Antworten, Genauigkeit, gelernte/lernende Wörter, zuletzt aktiv), 🔥 schwierigste Wörter (meiste Fehler) und wo es hakt — nach Übungstyp. Die Daten sammeln sich automatisch.' },
      { icon: '🔍', title: 'Wörterbuch-Filter: Scan, Buchstaben (NEU)', body: 'Im Wörterbuch kannst du Wörter filtern: 📄 nach SCAN — wähle eine Lektion, dann erscheinen Chips „Scan 1 / Scan 2…" (Buchseiten) mit Wörtern genau von dieser Seite (für Lektionen aus mehreren Fotos). 🔤 nach BUCHSTABE — Alphabet-Chips. Kombinierbar mit Kurs/Lektion/Status/Suche.' },
      { icon: '🗣️', title: 'KI-Trainer wirkt natürlicher (AKTUALISIERT)', body: 'Der Trainer führt jetzt ein echtes Gespräch: standardmäßig übersetzt er seine Antworten NICHT (Verständnis aus dem Kontext; Übersetzung separat aktivierbar), begrüßt/lobt nicht in jeder Nachricht, und Fehleranalyse plus Gesamtbewertung stehen im Abschlussbericht.' },
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
      { icon: '🔗', title: 'Karte teilen (NEU)', body: 'Ein Wort gefällt dir? Teile es! Im Wörterbuch hat jedes Wort einen 🔗-Button — tippe darauf, um einen Link zu kopieren (oder das Teilen-Menü zu öffnen: Telegram, WhatsApp…). Dein Freund öffnet ihn und sieht die Karte: das Wort, eine Übersetzung in SEINER Sprache, ein Bild, eine 🔊-Taste zum Anhören und „➕ ins Sprachbuch".' },
      { icon: '🔍', title: 'Wörterbuch: Filter nach Buchstabe und Scan (NEU)', body: '🔤 Buchstabe — tippe einen Buchstaben, es bleiben nur diese Wörter. 📄 Scan — wähle eine Lektion für Chips „Scan 1/2…" (Buchseiten) mit Wörtern von dieser Seite. Funktioniert mit Suche und Status.' },
      { icon: '🗣️', title: 'KI-Trainer — lebendiger (AKTUALISIERT)', body: 'Der Trainer spricht wie ein echter Partner: übersetzt nicht jede Zeile (versuche, den Sinn zu verstehen; Übersetzung aktivierbar), begrüßt/lobt nicht in jeder Nachricht, und Fehler werden am Ende besprochen.' },
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
      { icon: '📊', title: 'Аналітика класу (НОВЕ)', body: '«Аналітика класу» — кнопка на сторінці «Учні». За твоїми уроками: підсумки (учні, активні за 7 днів, відповіді, загальна точність), по кожному учню (відповіді, точність, слів знає/вчить, коли був востаннє), 🔥 найважчі слова (найбільше помилок) та де застрягають — за типом вправи. Дані накопичуються самі.' },
      { icon: '🔍', title: 'Фільтри Словника: скан, букви (НОВЕ)', body: 'У Словнику можна фільтрувати слова: 📄 за СКАНОМ — обери урок, і зʼявляться чіпи «Скан 1 / Скан 2…» (сторінки підручника) зі словами саме з цієї сторінки (для уроків із кількох фото). 🔤 за БУКВОЮ — чіпи алфавіту. Поєднується з курсом/уроком/статусом/пошуком.' },
      { icon: '🗣️', title: 'AI-тренер природніший (ОНОВЛЕНО)', body: 'Тренер тепер веде справжню розмову: за замовчуванням НЕ перекладає свої репліки (розумій із контексту; переклад можна ввімкнути), не вітається/не хвалить у кожному повідомленні, а розбір помилок і оцінка — у підсумковому звіті.' },
    ],
    student: [
      { icon: '🎯', title: 'Як влаштоване навчання', body: 'Уявляй що додаток — це розумний тренер. Він пам\'ятає які слова ти вже знаєш.\n📅 Добре знаєш → через тиждень\n😐 Майже → через 2-3 дні\n❌ Забув → повториться сьогодні\n\n🔑 Заходь ЩОДНЯ і роби вправи!' },
      { icon: '🃏', title: 'Картка', body: 'Показується німецьке слово. Пригадай переклад, потім натисни картку. Оціни себе чесно.' },
      { icon: '✏️', title: 'Заповни пропуск', body: 'Введи слово у пропуск ___ та натисни «Перевірити».' },
      { icon: '☑️', title: 'Обери відповідь', body: 'Вибери правильну відповідь з 4 варіантів.' },
      { icon: '✍️', title: 'Напиши речення', body: 'Напиши просте речення німецькою з даним словом. ШІ перевірить його.' },
      { icon: '🔤', title: 'Додай букву', body: 'Слово з пропущеною буквою. Вгадай яка буква пропущена.\nПриклад: «_aus» → «H» → «Haus» ✓' },
      { icon: '🎙️', title: 'Диктант', body: 'Слово вимовляється вголос. Ти чуєш але не бачиш — напиши правильно!\n1. Слухай уважно 🎵\n2. ◄ — послухати ще раз\n3. Напиши слово\n4. «Перевірити»' },
      { icon: '🔗', title: 'Поділитися карткою (НОВЕ)', body: 'Сподобалося слово — поділися ним! У Словнику біля слова є кнопка 🔗 — натисни, щоб скопіювати посилання (або відкрити меню «Поділитися»: Telegram, WhatsApp…). Друг відкриє його й побачить картку: слово, переклад СВОЄЮ мовою, картинку, 🔊 послухати та «➕ до розмовника».' },
      { icon: '🔍', title: 'Словник: фільтр за буквою і сканом (НОВЕ)', body: '🔤 Буква — натисни букву алфавіту, залишаться лише ці слова. 📄 Скан — обери урок, зʼявляться чіпи «Скан 1/2…» (сторінки підручника) зі словами з тієї сторінки. Працює з пошуком і статусом.' },
      { icon: '🗣️', title: 'AI-тренер — живіший (ОНОВЛЕНО)', body: 'Тренер тепер спілкується як справжній співрозмовник: не перекладає кожну репліку (намагайся зрозуміти зі змісту; переклад можна ввімкнути), не вітається/не хвалить у кожному повідомленні, помилки розбирає наприкінці.' },
    ],
    install: [
      { icon: '📱', title: 'Що таке встановлення?', body: 'Наш сайт — це PWA. Його можна встановити як звичайний застосунок.\n✅ Запускається без браузера\n✅ Завантажується швидше\n✅ Повноекранний режим' },
      { icon: '🤖', title: 'Встановлення на Android', body: '1. Відкрий сайт у Chrome\n2. Почекай 10-15 секунд\n3. З\'явиться плашка «Додати на головний екран»\n4. Натисни «Встановити»' },
      { icon: '🍎', title: 'Встановлення на iPhone/iPad', body: '1. Відкрий у Safari\n2. Натисни кнопку «Поділитися» ⬆️\n3. «На екран "Домів"»\n4. «Додати»' },
      { icon: '💻', title: 'Встановлення на ноутбук', body: 'У Chrome або Edge:\n1. Відкрий сайт\n2. Натисни ⊕ в рядку адреси\n3. «Встановити»' },
    ],
  },
  bg: {
    "title": "Помощ",
    "tabs": [
      "👨‍🏫 За учителя",
      "👨‍🎓 За ученика",
      "📲 Инсталиране"
    ],
    "teacher": [
      {
        "icon": "🎯",
        "title": "Как работи обучението",
        "body": "Системата използва интервално повторение (алгоритъм SM-2).\n\nУчителят качва снимки на страници от учебника → ИИ ги прочита и създава карти → ученикът повтаря думите в оптималните моменти.\n\nКолкото по-добре ученикът помни дадена дума, толкова по-рядко тя се появява. Забравена дума се връща веднага."
      },
      {
        "icon": "1️⃣",
        "title": "Регистрация",
        "body": "Регистрирайте се с роля «Учител / Родител». Това дава пълен достъп: създаване на уроци, преглед на ученици, управление на курсове, стартиране на admin операции."
      },
      {
        "icon": "2️⃣",
        "title": "Създайте курс",
        "body": "Отидете в «Курсове» → «+ Курс». Въведете название (например «6 клас 2024/2025»). Курсът е папка за уроци. Ученикът може да бъде прикрепен към конкретен курс."
      },
      {
        "icon": "3️⃣",
        "title": "Качете урок",
        "body": "1. Вътре в курса натиснете «+ Добавяне на урок»\n2. Снимайте страници от учебника и/или тетрадката (може няколко снимки наведнъж)\n3. По желание добавете аудиозапис на урока\n4. Натиснете «Обработи урока»\n\nМоже също да създадете урок през менюто «+ Урок» вляво."
      },
      {
        "icon": "⏳",
        "title": "Обработка на снимките",
        "body": "ИИ прочита всяка снимка и извлича думи, граматика, примерни изречения.\n\n• ~10 секунди на снимка\n• 24 снимки ≈ 5-8 минути\n• Прогрес: «Снимка 3 от 24…» → «Създавам упражнения…» → «Готово!»\n\nСтраницата може да се затвори — обработката продължава на сървъра. Статусът се вижда в раздел «Уроци»."
      },
      {
        "icon": "4️⃣",
        "title": "Какво се създава автоматично",
        "body": "От всяка дума в урока ИИ създава 7 вида упражнения:\n\n🃏 Флаш карта — обърни и се самооцени\n✏️ Попълни пропуска — впиши думата в изречението\n☑️ Избор на отговор — 4 варианта\n✍️ Напиши изречение — ИИ ще провери\n🔤 Добави буква — познай липсващата буква\n🎙️ Диктовка — думата се изговаря на глас, трябва да я напишеш\n🗣️ Произношение — кажи думата на глас, системата ще провери правилността"
      },
      {
        "icon": "5️⃣",
        "title": "Ученици",
        "body": "Учениците се регистрират сами с роля «Ученик». Техният прогрес се вижда в раздел «Ученици»:\n• Колко думи са научени\n• Колко опита днес\n• Кои уроци преминават\n\nМоже да прикрепите ученик към конкретен курс."
      },
      {
        "icon": "📖",
        "title": "Читалня",
        "body": "Раздел «Читалня» — три режима на работа с текстове:\n\n▶ Четене — кликаем текст с TTS (скорост 0.7×–1.2×). Натисни върху дума — превод от речника.\n\n🌐 Двуезичен — ИИ превежда абзаците. Избери произволна езикова двойка от 8 езика (нем→бг, бг→англ и т.н.). Модели: ⚡ Бързо (GPT-4o-mini) или ✨ Точно (GPT-4o).\n\n💬 Разговор — режим като в Google Translate. Двама участници говорят на смени в микрофона — системата превежда и изговаря отговора. Работи само в Chrome."
      },
      {
        "icon": "🤖",
        "title": "AI треньор",
        "body": "Раздел «AI треньор» — живи разговорни тренировки с ИИ-наставник.\n\n1. Избери персонаж:\n🧑‍🏫 Лена — учителка от Берлин\n☕ Макс — бариста в кафене\n🛒 Ганна — продавачка в магазин\n🏨 Отто — портиер в хотел\n\n2. Избери тема: Запознанство, Кафене, Пазаруване, Хотел, Ориентиране или Свободен разговор\n\n3. Натисни «Започни разговор» — и общувай!\n\nПерсонажът отговаря на немски. Под отговора:\n• Превод на български\n• Поправка на твоите грешки (ако има)\n• Бутон 🔊 за прослушване\n\nПишеш на български — ИИ разбира и продължава диалога."
      },
      {
        "icon": "💬",
        "title": "Разговорник",
        "body": "Учениците могат да запазват фрази от упражненията с бутон 📖. Или да добавят ръчно — при въвеждане на немска фраза ИИ я превежда автоматично.\n\nФразите могат да се редактират, отбелязват като научени, филтрират по категории."
      },
      {
        "icon": "🌍",
        "title": "Преводи",
        "body": "Раздел «Преводи» показва всичко преведено в сайта:\n• Думи от речника (901 думи, 10 езика)\n• Заглавия на уроци\n• Фрази от разговорника\n• Текстове на интерфейса\n\nИма глобално търсене — търси мигновено във всички групи."
      },
      {
        "icon": "⚙️",
        "title": "Admin операции",
        "body": "В страничния панел (десктоп) или менюто има admin бутони за масови операции:\n\n• 🖼 Снимки — снимки за думите от Unsplash\n• ⭐ Речник++ — примерни изречения чрез ИИ\n• 🌐 Думи → 10 езика — превод на речника\n• 📝 Упражнения → езици — превод на вариантите за отговор\n• 🔤 Заглавия → езици — превод на заглавията на уроците\n• 🔊 Произношение — добавяне на гласови упражнения към всички уроци\n• 🔄 Пресъздай всичко — обновяване на всички упражнения (ще нулира прогреса!)\n\nОперациите работят във фонов режим с прогрес «направено/общо». Състоянието се вижда веднага в менюто."
      },
      {
        "icon": "🚀",
        "title": "«Обработи всичко» — един бутон (НОВО)",
        "body": "Сега при качване на урок обработката прави ВСИЧКО сама, не трябва да се натискат бутони:\n\n1. Чете текста от снимките\n2. Извлича думите (📘 учебник + ✏️ тетрадка отделно)\n3. Създава 7 вида упражнения (чист немски, разбираем както за деца)\n4. Измисля заглавие и описание на урока\n5. Подбира снимки към думите\n6. Превежда думите и упражненията на всички 10 езика\n\nАвтозаглавие: ако не си задал тема — «Урок N: <AI-тема>».\n\nЗа готов урок — бутон «✨ Обработи всичко»: добавя липсващото (снимки, преводи) БЕЗ да нулира прогреса на учениците."
      },
      {
        "icon": "✏️",
        "title": "Собствени упражнения от речника (НОВО)",
        "body": "Събери набор от упражнения от нужните думи:\n\n1. Отвори «Речник»\n2. Филтрирай думите — например «в изучаване», или по урок/част на речта/търсене\n3. Натисни «✏️ Набор» (горе)\n4. Въведи название → системата ще събере набор от упражнения от тези думи и ще го отвори\n\nУдобно за целенасочена подготовка за диктовка или затвърждаване на трудни думи. Наборът е отделен «урок», думите не се дублират."
      },
      {
        "icon": "📐",
        "title": "Граматика — справочник (НОВО)",
        "body": "Раздел «Граматика» в менюто — пищов по падежи, предлози, глаголи, Konjunktiv.\n\nСнимал си граматичен плакат — ИИ е извадил от него правилата в спретнати таблици:\n• Цветове на родовете както в училище: 🔵 der · 🔴 die · 🟢 das · ⚫ мн.ч.\n• Въпрос на падежа (wer/wen/wem) и разбираемо обяснение за всеки\n• Оригиналната снимка — с бутон «покажи оригинала»\n\nТова е отделно от речниковите уроци — не смесваме граматиката с думите."
      },
      {
        "icon": "🎥",
        "title": "Видео аватар на треньора (платено, D-ID)",
        "body": "В AI-треньора наставникът Pablo може наистина да оживее (движение на устните) чрез услугата D-ID — това е ПЛАТЕНА опция.\n\n🟢 Гласовият режим ✨ и готовите видеоклипове (поздрав, «вярно/невярно») работят БЕЗПЛАТНО и без ограничение.\n\nБутонът 🎥 «оживи» се появява само когато по баланса на D-ID има кредити. Повече подробности — в Настройки."
      },
      {
        "icon": "📊",
        "title": "Анализ на класа (НОВО)",
        "body": "Раздел «📊 Анализ на класа» — бутон на страницата «Ученици» (или блок на главната).\n\nКакво се вижда за твоите уроци:\n• Обобщение: колко ученици, кой е активен през последните 7 дни, общо отговори, обща точност\n• За всеки ученик: колко отговора (и за седмицата), точност %, колко думи знае/учи, кога е бил(а) последно\n• 🔥 Трудни думи — къде има най-много грешки (какво си струва да се преучи)\n• Къде се затормозяват — точност по видове упражнения (диктовка, произношение, избор…)\n\nЦвят на точността: червено <60%, жълто <80%, зелено — по-високо. Данните се натрупват сами, докато учениците решават."
      },
      {
        "icon": "🔍",
        "title": "Филтри в Речника: скан, букви (НОВО)",
        "body": "В Речника вече можеш бързо да подбереш думи:\n\n📄 По СКАН — избери урок и ще се появят чипове «Скан 1 / Скан 2…» (страници от учебника). Показва думите именно от тази страница. Работи за уроци, качени с няколко снимки.\n\n🔤 По БУКВА — чипове с азбуката: само думи на избраната буква.\n\nФилтрите се комбинират с курс/урок/статус и търсенето."
      },
      {
        "icon": "🗣️",
        "title": "AI-треньорът стана по-естествен (ОБНОВЕНО)",
        "body": "Треньорът вече води жив диалог, а не «урок»:\n• По подразбиране НЕ превежда репликите си на български — ученикът разбира от контекста (преводът може да се включи отделно)\n• Не поздравява във всяко съобщение и не хвали/мъмри ритуално\n• Разборът на грешките и общата оценка — в крайния отчет, а не след всяка фраза\n\nТова е по-близо до реален разговор с носител на езика."
      }
    ],
    "student": [
      {
        "icon": "🎯",
        "title": "Как работи обучението — просто",
        "body": "Представи си, че програмата е умен треньор. Тя помни кои думи вече знаеш добре и кои все още не.\n\n📅 Знаеш думата добре → ще я видиш след седмица\n😐 Почти я знаеш → след 2-3 дни\n❌ Забравил си я → веднага се повтаря днес\n\n🔑 Главното правило: влизай ВСЕКИ ДЕН и прави упражнения. Дори 10 минути на ден дават страхотен резултат!"
      },
      {
        "icon": "1️⃣",
        "title": "Регистрация",
        "body": "Регистрирай се с роля «Ученик». Попитай учителя за адреса на сайта.\n\nСлед вход веднага ще попаднеш на главната страница «Днес»."
      },
      {
        "icon": "2️⃣",
        "title": "📅 Страница «Днес»",
        "body": "Тук са показани упражненията, които ТРЯБВА да направиш днес.\n\nВиждаш цифри? Това е броят упражнения по видове:\n🃏 Флаш карти\n✏️ Пропуски\n☑️ Избор на отговор\n✍️ Написване на изречение\n🔤 Добавяне на буква\n🎙️ Диктовка\n\nНатисни «Започни повторение» — и напред!"
      },
      {
        "icon": "🃏",
        "title": "Флаш карта",
        "body": "Показва ти се немска дума. Спомни си превода, после натисни картата — ще видиш отговора.\n\nОцени се честно:\n❌ Не помня — думата ще се появи отново днес\n😐 С труд — след 1 ден\n🙂 Нормално — след 3 дни\n✅ Помня лесно — след 1 седмица или повече"
      },
      {
        "icon": "✏️",
        "title": "Попълни пропуска",
        "body": "В немското изречение има пропуск ___. Напиши правилната дума и натисни «Провери».\n\n💡 Подсказка: в изречението се вижда контекстът — това ще ти помогне да си спомниш думата. Регистърът няма значение — «Haus» и «haus» се броят еднакво."
      },
      {
        "icon": "☑️",
        "title": "Избор на отговор",
        "body": "Виждаш въпрос и 4 варианта? Натисни правилния.\n\n🟢 Зелено — правилно, преминаваме напред\n🔴 Червено — грешка, виж правилния отговор\n\nСлед отговора след секунда автоматично ще се отвори следващото упражнение."
      },
      {
        "icon": "✍️",
        "title": "Напиши изречение",
        "body": "Дават ти немска дума и подсказка. Напиши КАКВОТО И ДА Е просто изречение на немски с тази дума.\n\nПример: думата «Hund» → «Ich habe einen Hund.» ✓\n\nИИ ще провери:\n• Дали думата е използвана правилно\n• Дали няма груби грешки\nИ ще постави оценка от ★ до ★★★★★"
      },
      {
        "icon": "🔤",
        "title": "Добави буква",
        "body": "Показва се немска дума с пропусната буква (или няколко). Трябва да познаеш коя буква липсва.\n\nПример: «_aus» → «H» → «Haus» ✓\n\nТова помага да запомниш правописа на немските думи с умлаути (ä, ö, ü)."
      },
      {
        "icon": "🎙️",
        "title": "Диктовка",
        "body": "Думата се изговаря на глас на немски. Чуваш я, но не я виждаш — трябва да я напишеш правилно!\n\n1. Слушай внимателно 🎵\n2. Натисни ◄ ако искаш да я чуеш отново\n3. Напиши думата\n4. Натисни «Провери»\n\nТова е най-трудното упражнение — то проверява и слуха, и правописа!"
      },
      {
        "icon": "🗣️",
        "title": "Произношение — говори на немски",
        "body": "Показва ти се преводът на думата на български — трябва да КАЖЕШ немската дума на глас.\n\n1. Прочети българския превод\n2. Натисни бутона 🎤 (или говори веднага — бутонът ще се появи сам)\n3. Произнеси немската дума в микрофона\n4. Системата ще покаже какво е чула и съвпадението\n\n✅ Правилно — продължаваме напред\n😕 Неточно — опитай отново или натисни «Пропусни»\n\n⚠️ Работи в Chrome на Android/компютър. На iPhone засега само четене.\n\n💡 Съвет: натисни бутона 🔊, за да чуеш първо как звучи думата правилно."
      },
      {
        "icon": "📖",
        "title": "Читалня — четем и превеждаме текстове",
        "body": "Раздел «Читалня» — три режима:\n\n▶ Четене — постави текст, натисни бутона и слушай. Натисни върху дума — ще видиш превод от речника.\n\n🌐 Двуезичен — ИИ превежда текста абзац по абзац. Избери езици (например немски → български). Натисни «Преведи».\n\n💬 Разговор — като Google Translate! Двама души говорят на смени в микрофона — системата превежда и изговаря на глас. Удобно за урок или за разговор с носител на езика.\n\n⚠️ Режимите с микрофон работят само в Chrome."
      },
      {
        "icon": "💬",
        "title": "Разговорник — твоите фрази",
        "body": "В разговорника попадат фразите, които си запазил от упражненията (бутон 📖).\n\nМожеш също да добавиш фраза ръчно:\n1. Натисни «+ Добави фраза»\n2. Напиши немската фраза\n3. Излез от полето — ИИ ще преведе сам!\n4. Поправи ако е нужно и запази\n\nОтбележи фразата с ✅, когато я научиш."
      },
      {
        "icon": "🤖",
        "title": "AI треньор — живи диалози (ОБНОВЕНО)",
        "body": "Раздел «AI треньор» — жив разговор с наставник. Първият е 🤓 Pablo (основателят), а също Лена, Макс, Ганна, Отто.\n\nИзбери персонаж и тема (или «Думи от урок N») → «Започни разговор».\n\nПерсонажът отговаря на немски, под съобщението: превод, твоите грешки, 🔊 прослушване.\n\n✨ ГЛАСОВ РЕЖИМ (както в Gemini): натисни ✨ до полето за въвеждане → голяма снимка на Pablo, той поздравява и слуша. Просто говори — ръцете ти са свободни! Той отговаря с глас, реагира с «вярно/невярно» (цветовете на Германия), а отдолу върви лог на чата (немски + превод, 🔊 прослушване). Може да говориш на немски (точно разпознаване) или да превключиш на своя език.\n\n⚠️ Гласът работи в Chrome (Android/компютър)."
      },
      {
        "icon": "📐",
        "title": "Граматика — пищов (НОВО)",
        "body": "Раздел «Граматика» в менюто — справочник по падежи, предлози, глаголи.\n\nОтвори произволна тема → ще видиш разбираемо обяснение и цветни таблици:\n🔵 der (м.р.) · 🔴 die (ж.р.) · 🟢 das (ср.р.) · ⚫ мн.ч.\n\nЗа всеки падеж — въпрос (кой? кого? на кого?) и обяснение кога се използва. Гледай и повтаряй преди упражненията."
      },
      {
        "icon": "🎬",
        "title": "Pablo в упражненията (НОВО)",
        "body": "Сега в упражненията наставникът Pablo реагира на твоя отговор: лицето му оживява и казва «Sehr gut!», ако е вярно, или «Nicht ganz», ако си сгрешил.\n\nАко искаш само текст без видео — може да го изключиш: Настройки → Глас → «Треньор в упражненията»."
      },
      {
        "icon": "👤",
        "title": "Профил — аватар и данни",
        "body": "Натисни аватара (кръгче с буква или емоджи) в лявото меню — ще се отвори профилът.\n\nКакво може да се настрои:\n• Аватар — избери от 12 емоджита или ще остане буквата на името\n• Пълно име, професия\n• Телефон, Telegram, WhatsApp\n• Смяна на парола\n\nТези данни се виждат от учителя в раздел «Ученици»."
      },
      {
        "icon": "🔊",
        "title": "Глас и настройки",
        "body": "В менюто (бутон ☰ вляво или отдолу на телефона):\n\n🔊 вкл/изкл — включва автоматичното произношение на думите\n🎤 Глас — избери немски глас (Google Deutsch звучи най-добре)\n🌙/☀️ — тъмна или светла тема\n🌍 Език — превключи езика на интерфейса\n\nМоже да включиш произношение на превода — тогава след немската дума ще прозвучи и българският."
      },
      {
        "icon": "🔗",
        "title": "Сподели карта (НОВО)",
        "body": "Хареса ти дума — сподели я с приятел!\n\nВ Речника всяка дума има бутон 🔗. Натисни — линкът към картата ще се копира (или ще се отвори менюто «Сподели» на телефона: Telegram, WhatsApp…).\n\nПриятелят ти ще отвори линка и ще види картата: думата, превод на СВОЯ език, картинка, пример, бутон 🔊 за прослушване и «➕ в разговорник» — да добави думата за себе си."
      },
      {
        "icon": "🔍",
        "title": "Речник: филтър по буква и скан (НОВО)",
        "body": "В Речника вече лесно намираш нужните думи:\n\n🔤 Буква — натисни буква от азбуката, ще останат само думи на нея.\n\n📄 Скан — ако избереш урок, ще се появят чипове «Скан 1 / Скан 2…» (страници от учебника) — думи именно от тази страница.\n\nМоже да комбинираш с търсенето и статуса (нова/уча/знам)."
      },
      {
        "icon": "🗣️",
        "title": "AI-треньорът — по-жив (ОБНОВЕНО)",
        "body": "Треньорът вече общува като истински събеседник:\n• Не превежда всяка своя фраза — старай се да разбереш по смисъла (преводът може да се включи в настройките)\n• Не поздравява и не хвали във всяко съобщение — просто жив разговор\n• Разбор на грешките — накрая, в отчета\n\nТака по-бързо свикваш да разбираш немски на слух."
      }
    ],
    "install": [
      {
        "icon": "📱",
        "title": "Какво е инсталиране на приложението?",
        "body": "Нашият сайт е така нареченото PWA (Progressive Web App, «Прогресивно уеб приложение»).\n\nТова означава: сайтът МОЖЕ да се инсталира като обикновено приложение на телефон или лаптоп. След инсталиране:\n✅ Стартира без браузър, като истинско приложение\n✅ Отваря се по-бързо\n✅ Работи на цял екран (без адресна лента)\n✅ Появява се в списъка с приложения на телефона"
      },
      {
        "icon": "🤖",
        "title": "Инсталиране на Android (телефон/таблет)",
        "body": "1. Отвори сайта в Chrome\n2. Изчакай 10-15 секунди\n3. Долу на екрана ще се появи лента: «Добавяне на Deutsch Lernen към началния екран»\n4. Натисни «Инсталирай» или «Добави»\n\nАко лентата не се появи:\n• Натисни трите точки ⋮ в горния десен ъгъл на Chrome\n• Избери «Добавяне към началния екран»\n• Натисни «Инсталирай»\n\nГотово! Приложението ще се появи на работния плот."
      },
      {
        "icon": "🍎",
        "title": "Инсталиране на iPhone/iPad",
        "body": "1. Отвори сайта в браузъра Safari (именно Safari, не Chrome!)\n2. Натисни бутона «Споделяне» отдолу на екрана — това е иконка на квадрат със стрелка нагоре ⬆️\n3. Превърти списъка надолу\n4. Натисни «На началния екран»\n5. Натисни «Добави»\n\nПриложението ще се появи на началния екран, като обикновено приложение.\n\n⚠️ Важно: на iPhone работи само чрез Safari. Chrome и другите браузъри засега не поддържат инсталиране на PWA в iOS."
      },
      {
        "icon": "💻",
        "title": "Инсталиране на лаптоп (Windows/Mac)",
        "body": "В браузъра Chrome или Edge:\n\n1. Отвори сайта\n2. В адресната лента вдясно ще се появи иконка ⊕ или иконка на монитор — натисни я\n3. Натисни «Инсталирай»\n\nИли през менюто:\n• Chrome: три точки ⋮ → «Запазване и споделяне» → «Създаване на пряк път» → «Отваряне като прозорец» ✓\n• Edge: три точки … → «Приложения» → «Инсталиране на този сайт като приложение»\n\nСлед инсталиране приложението стартира като отделен прозорец без адресна лента."
      },
      {
        "icon": "🏪",
        "title": "Google Play (скоро)",
        "body": "В бъдеще приложението ще се появи в Google Play Store — тогава ще може да се инсталира като обикновено приложение през магазина.\n\nАктуалната версия винаги е достъпна на сайта deutschlernen.ai — там обновленията се появяват мигновено, без чакане на проверка в магазина.\n\nPWA приложението (инсталиране през браузър) работи също толкова добре, колкото приложение от магазина."
      },
      {
        "icon": "🔄",
        "title": "Обновления",
        "body": "Приложението се обновява автоматично — при следващото отваряне то само ще зареди новата версия.\n\nНе трябва да правиш нищо — всички подобрения ще се появят сами."
      }
    ]
  },
  tr: {
    "title": "Yardım",
    "tabs": [
      "👨‍🏫 Öğretmene",
      "👨‍🎓 Öğrenciye",
      "📲 Kurulum"
    ],
    "teacher": [
      {
        "icon": "🎯",
        "title": "Öğrenme sistemi nasıl çalışır",
        "body": "Sistem aralıklı tekrar yöntemini kullanır (SM-2 algoritması).\n\nÖğretmen ders kitabı sayfalarının fotoğrafını yükler → yapay zeka onu okur ve kartlar oluşturur → öğrenci kelimeleri en uygun zamanlarda tekrar eder.\n\nÖğrenci bir kelimeyi ne kadar iyi hatırlarsa, o kelime o kadar seyrek karşısına çıkar. Unutulan kelime hemen geri döner."
      },
      {
        "icon": "1️⃣",
        "title": "Kayıt",
        "body": "\"Öğretmen / Veli\" rolüyle kayıt olun. Bu size tam erişim sağlar: ders oluşturma, öğrencileri görüntüleme, kursları yönetme, admin işlemlerini başlatma."
      },
      {
        "icon": "2️⃣",
        "title": "Kurs oluşturun",
        "body": "\"Kurslar\" → \"+ Kurs\" bölümüne gidin. Bir ad girin (örneğin \"6. Sınıf 2024/2025\"). Kurs, dersler için bir klasördür. Bir öğrenci belirli bir kursa bağlanabilir."
      },
      {
        "icon": "3️⃣",
        "title": "Ders yükleyin",
        "body": "1. Kursun içinde \"+ Ders Ekle\" düğmesine basın\n2. Ders kitabı ve/veya defter sayfalarının fotoğrafını çekin (aynı anda birkaç fotoğraf eklenebilir)\n3. İsterseniz dersin ses kaydını ekleyin\n4. \"Dersi İşle\" düğmesine basın\n\nDersi soldaki \"+ Ders\" menüsünden de oluşturabilirsiniz."
      },
      {
        "icon": "⏳",
        "title": "Fotoğraf işleme",
        "body": "Yapay zeka her fotoğrafı okur ve kelimeleri, dilbilgisini, örnek cümleleri ayıklar.\n\n• Fotoğraf başına ~10 saniye\n• 24 fotoğraf ≈ 5-8 dakika\n• İlerleme: \"Fotoğraf 3/24…\" → \"Alıştırmalar oluşturuluyor…\" → \"Hazır!\"\n\nSayfayı kapatabilirsiniz — işlem sunucuda devam eder. Durumu \"Dersler\" bölümünde görebilirsiniz."
      },
      {
        "icon": "4️⃣",
        "title": "Otomatik olarak ne oluşturulur",
        "body": "Dersteki her kelimeden yapay zeka 7 tür alıştırma oluşturur:\n\n🃏 Flaş kart — çevirip kendinizi değerlendirin\n✏️ Boşluğu doldur — kelimeyi cümleye yazın\n☑️ Çoktan seçmeli — 4 seçenek\n✍️ Cümle yaz — yapay zeka kontrol eder\n🔤 Harf ekle — eksik harfi tahmin edin\n🎙️ Dikte — kelime sesli okunur, yazmanız gerekir\n🗣️ Telaffuz — kelimeyi sesli söyleyin, sistem doğruluğunu kontrol eder"
      },
      {
        "icon": "5️⃣",
        "title": "Öğrenciler",
        "body": "Öğrenciler \"Öğrenci\" rolüyle kendileri kayıt olur. İlerlemeleri \"Öğrenciler\" bölümünde görülür:\n• Kaç kelime öğrenildi\n• Bugün kaç deneme yapıldı\n• Hangi dersler çalışılıyor\n\nBir öğrenci belirli bir kursa bağlanabilir."
      },
      {
        "icon": "📖",
        "title": "Okuyucu",
        "body": "\"Okuyucu\" bölümü — metinlerle çalışmak için üç mod:\n\n▶ Oku — TTS ile tıklanabilir metin (hız 0.7×–1.2×). Bir kelimeye tıklayın — sözlükten çeviri gelir.\n\n🌐 Çift dilli — yapay zeka paragrafları çevirir. 8 dilden istediğiniz dil çiftini seçin (de→ru, ru→en vb.). Modeller: ⚡ Hızlı (GPT-4o-mini) veya ✨ Hassas (GPT-4o).\n\n💬 Konuşma — Google Translate'teki gibi bir mod. İki katılımcı sırayla mikrofona konuşur — sistem çevirir ve yanıtı seslendirir. Yalnızca Chrome'da çalışır."
      },
      {
        "icon": "🤖",
        "title": "AI koç",
        "body": "\"AI koç\" bölümü — yapay zeka koçuyla canlı konuşma antrenmanları.\n\n1. Bir karakter seçin:\n🧑‍🏫 Лена — Berlin'den bir öğretmen\n☕ Макс — kafede barista\n🛒 Ганна — mağazada satış görevlisi\n🏨 Отто — otelde resepsiyonist\n\n2. Bir konu seçin: Tanışma, Kafe, Alışveriş, Otel, Yön Bulma veya Serbest Sohbet\n\n3. \"Konuşmayı Başlat\" düğmesine basın — ve sohbete başlayın!\n\nKarakter Almanca yanıt verir. Yanıtın altında:\n• Rusça/Ukraynaca çeviri\n• Hatalarınızın düzeltilmesi (varsa)\n• Dinlemek için 🔊 düğmesi\n\nRusça veya Ukraynaca yazarsanız — yapay zeka anlar ve diyaloğu sürdürür."
      },
      {
        "icon": "💬",
        "title": "Konuşma Kılavuzu",
        "body": "Öğrenciler alıştırmalardan 📖 düğmesiyle ifadeleri kaydedebilir. Ya da manuel olarak ekleyebilirler — Almanca bir ifade girildiğinde yapay zeka onu otomatik olarak çevirir.\n\nİfadeler düzenlenebilir, öğrenildi olarak işaretlenebilir, kategoriye göre filtrelenebilir."
      },
      {
        "icon": "🌍",
        "title": "Çeviriler",
        "body": "\"Çeviriler\" bölümü sitede çevrilmiş her şeyi gösterir:\n• Sözlük kelimeleri (901 kelime, 10 dil)\n• Ders başlıkları\n• Konuşma kılavuzu ifadeleri\n• Arayüz metinleri\n\nGenel bir arama vardır — tüm gruplarda anında arama yapar."
      },
      {
        "icon": "⚙️",
        "title": "Admin işlemleri",
        "body": "Yan panelde (masaüstü) veya menüde toplu işlemler için admin düğmeleri bulunur:\n\n• 🖼 Görseller — Unsplash'ten kelimeler için fotoğraflar\n• ⭐ Sözlük++ — yapay zeka ile örnek cümleler\n• 🌐 Kelimeler → 10 dil — sözlük çevirisi\n• 📝 Alıştırmalar → diller — cevap seçeneklerinin çevirisi\n• 🔤 Başlıklar → diller — ders başlıklarının çevirisi\n• 🔊 Telaffuz — tüm derslere sesli alıştırmalar ekle\n• 🔄 Hepsini yeniden oluştur — tüm alıştırmaları güncelle (ilerlemeyi sıfırlar!)\n\nİşlemler arka planda \"yapılan/toplam\" ilerlemesiyle çalışır. Durum doğrudan menüde görülür."
      },
      {
        "icon": "🚀",
        "title": "\"Hepsini İşle\" — tek düğme (YENİ)",
        "body": "Artık ders yüklenirken işleme HER ŞEYİ kendisi yapıyor, düğmelere basmaya gerek yok:\n\n1. Fotoğraftaki metni okur\n2. Kelimeleri çıkarır (📘 ders kitabı + ✏️ defter ayrı ayrı)\n3. 7 tür alıştırma oluşturur (sade Almanca, çocuklar için bile anlaşılır)\n4. Dersin adını ve açıklamasını oluşturur\n5. Kelimeler için görseller seçer\n6. Kelimeleri ve alıştırmaları 10 dilin tümüne çevirir\n\nOtomatik başlık: konu belirtilmediyse — \"Ders N: <AI konusu>\".\n\nHazır bir ders için — \"✨ Hepsini İşle\" düğmesi: eksik olanı tamamlar (görseller, çeviriler) öğrenci ilerlemesini SIFIRLAMADAN."
      },
      {
        "icon": "✏️",
        "title": "Sözlükten kendi alıştırmalarınız (YENİ)",
        "body": "İhtiyacınız olan kelimelerden bir alıştırma seti oluşturun:\n\n1. \"Sözlük\"ü açın\n2. Kelimeleri filtreleyin — örneğin \"öğreniliyor\" durumuna göre, ya da derse/sözcük türüne/aramaya göre\n3. Üstteki \"✏️ Set\" düğmesine basın\n4. Bir ad girin → sistem bu kelimelerden bir alıştırma seti oluşturup açar\n\nDikteye hedefli hazırlanmak veya zor kelimeleri pekiştirmek için kullanışlıdır. Set, ayrı bir \"ders\"tir, kelimeler tekrarlanmaz."
      },
      {
        "icon": "📐",
        "title": "Dilbilgisi — başvuru kılavuzu (YENİ)",
        "body": "Menüdeki \"Dilbilgisi\" bölümü — hâller, edatlar, fiiller ve Konjunktiv için bir kopya kâğıdı.\n\nBir dilbilgisi posteri fotoğrafladınız mı — yapay zeka ondan kuralları çıkarıp düzenli tablolara aktardı:\n• Okuldaki gibi cins renkleri: 🔵 der · 🔴 die · 🟢 das · ⚫ çoğul\n• Hâl sorusu (wer/wen/wem) ve her birine anlaşılır bir açıklama\n• Orijinal fotoğraf — \"orijinali göster\" düğmesiyle\n\nBu, sözlük derslerinden ayrıdır — dilbilgisini kelimelerle karıştırmıyoruz."
      },
      {
        "icon": "🎥",
        "title": "Koçun video-avatarı (ücretli, D-ID)",
        "body": "AI koçta, koç Pablo D-ID servisi sayesinde gerçekten canlanabilir (dudak hareketi) — bu ÜCRETLİ bir seçenektir.\n\n🟢 Sesli mod ✨ ve hazır video klipler (selamlama, \"doğru/yanlış\") ÜCRETSİZ ve sınırsız çalışır.\n\n🎥 \"canlandır\" düğmesi yalnızca D-ID bakiyesinde kredi olduğunda görünür. Ayrıntılar — Ayarlar'da."
      },
      {
        "icon": "📊",
        "title": "Sınıf analitiği (YENİ)",
        "body": "\"📊 Sınıf Analitiği\" bölümü — \"Öğrenciler\" sayfasındaki bir düğme (veya ana sayfadaki bir blok).\n\nDerslerinizle ilgili neler görünür:\n• Özet: kaç öğrenci, son 7 günde kim aktif, toplam cevap sayısı, genel doğruluk\n• Her öğrenci için: kaç cevap (ve haftalık), doğruluk %, kaç kelime biliyor/öğreniyor, en son ne zaman girdi\n• 🔥 Zor kelimeler — en çok hatanın olduğu yerler (yeniden öğrenilmesi gerekenler)\n• Nerede takılıyorlar — alıştırma türlerine göre doğruluk (dikte, telaffuz, çoktan seçmeli…)\n\nDoğruluk rengi: %60'ın altı kırmızı, %80'in altı sarı, üzeri yeşil. Veriler öğrenciler çözdükçe kendiliğinden birikir."
      },
      {
        "icon": "🔍",
        "title": "Sözlük filtreleri: tarama, harfler (YENİ)",
        "body": "Sözlükte artık kelimeleri hızlıca seçebilirsiniz:\n\n📄 TARAMAYA göre — bir ders seçin, \"Tarama 1 / Tarama 2…\" çipleri görünür (ders kitabı sayfaları). Tam olarak o sayfadaki kelimeleri gösterir. Birden fazla fotoğrafla yüklenen dersler için çalışır.\n\n🔤 HARFE göre — alfabe çipleri: yalnızca seçilen harfle başlayan kelimeler.\n\nFiltreler kurs/ders/durum ve aramayla birlikte uygulanır."
      },
      {
        "icon": "🗣️",
        "title": "AI koç daha doğal oldu (GÜNCELLENDİ)",
        "body": "Koç artık bir \"ders\" değil, canlı bir diyalog yürütüyor:\n• Varsayılan olarak repliklerini Rusçaya ÇEVİRMİYOR — öğrenci bağlamdan anlar (çeviri ayrıca açılabilir)\n• Her mesajda selamlaşmıyor ve alışkanlık gibi övmüyor/eleştirmiyor\n• Hata analizi ve genel değerlendirme — her cümleden sonra değil, final raporunda\n\nBu, ana dili konuşan biriyle gerçek bir sohbete daha çok benziyor."
      }
    ],
    "student": [
      {
        "icon": "🎯",
        "title": "Öğrenme sistemi nasıl çalışır — basitçe",
        "body": "Programın akıllı bir koç olduğunu düşün. Hangi kelimeleri iyi bildiğini, hangilerini henüz bilmediğini hatırlıyor.\n\n📅 Bir kelimeyi iyi biliyorsan → bir hafta sonra tekrar karşına çıkar\n😐 Neredeyse biliyorsan → 2-3 gün sonra\n❌ Unuttuysan → bugün hemen tekrar edilir\n\n🔑 En önemli kural: HER GÜN gir ve alıştırmaları yap. Günde 10 dakika bile harika bir sonuç verir!"
      },
      {
        "icon": "1️⃣",
        "title": "Kayıt",
        "body": "\"Öğrenci\" rolüyle kayıt ol. Site adresini öğretmenine sor.\n\nGiriş yaptıktan sonra doğrudan \"Bugün\" ana sayfasına yönlendirileceksin."
      },
      {
        "icon": "2️⃣",
        "title": "📅 \"Bugün\" sayfası",
        "body": "Burada bugün YAPILMASI GEREKEN alıştırmalar gösterilir.\n\nRakamları görüyor musun? Bunlar türlerine göre alıştırma sayıları:\n🃏 Flaş kartlar\n✏️ Boşluklar\n☑️ Çoktan seçmeli\n✍️ Cümle yaz\n🔤 Harf ekle\n🎙️ Dikte\n\n\"Tekrara Başla\" düğmesine bas — ve haydi başla!"
      },
      {
        "icon": "🃏",
        "title": "Flaş kart",
        "body": "Sana Almanca bir kelime gösterilir. Çevirisini hatırlamaya çalış, sonra karta tıkla — cevabı göreceksin.\n\nKendini dürüstçe değerlendir:\n❌ Hatırlamıyorum — kelime bugün tekrar gelecek\n😐 Zorlukla — 1 gün sonra\n🙂 Normal — 3 gün sonra\n✅ Kolayca hatırlıyorum — 1 hafta sonra veya daha geç"
      },
      {
        "icon": "✏️",
        "title": "Boşluğu doldur",
        "body": "Almanca cümlede bir boşluk var ___. Doğru kelimeyi yaz ve \"Kontrol Et\" düğmesine bas.\n\n💡 İpucu: cümlede bağlam görülüyor, bu kelimeyi hatırlamana yardımcı olur. Büyük/küçük harf önemli değil — \"Haus\" ve \"haus\" aynı şekilde kabul edilir."
      },
      {
        "icon": "☑️",
        "title": "Çoktan seçmeli",
        "body": "Bir soru ve 4 seçenek görüyor musun? Doğru olana tıkla.\n\n🟢 Yeşil — doğru, devam ediyoruz\n🔴 Kırmızı — hata, doğru cevaba bak\n\nCevaptan bir saniye sonra sıradaki alıştırma otomatik olarak açılır."
      },
      {
        "icon": "✍️",
        "title": "Cümle yaz",
        "body": "Sana Almanca bir kelime ve bir ipucu verilir. Bu kelimeyle Almanca HERHANGİ basit bir cümle yaz.\n\nÖrnek: \"Hund\" kelimesi → \"Ich habe einen Hund.\" ✓\n\nYapay zeka şunu kontrol eder:\n• Kelime doğru kullanılmış mı\n• Ciddi hata var mı\nVe ★ ile ★★★★★ arasında bir puan verir"
      },
      {
        "icon": "🔤",
        "title": "Harf ekle",
        "body": "Bir veya birkaç harfi eksik Almanca bir kelime gösterilir. Hangi harfin eksik olduğunu tahmin etmen gerekir.\n\nÖrnek: \"_aus\" → \"H\" → \"Haus\" ✓\n\nBu, umlautlu (ä, ö, ü) Almanca kelimelerin yazılışını hatırlamana yardımcı olur."
      },
      {
        "icon": "🎙️",
        "title": "Dikte",
        "body": "Kelime Almanca olarak sesli okunur. Onu duyarsın ama görmezsin — doğru yazman gerekir!\n\n1. Dikkatlice dinle 🎵\n2. Tekrar duymak istersen ◄ düğmesine bas\n3. Kelimeyi yaz\n4. \"Kontrol Et\" düğmesine bas\n\nBu en zor alıştırmadır — hem işitmeyi hem de yazımı test eder!"
      },
      {
        "icon": "🗣️",
        "title": "Telaffuz — Almanca konuş",
        "body": "Sana kelimenin Rusça çevirisi gösterilir — Almanca kelimeyi sesli SÖYLEMEN gerekir.\n\n1. Rusça çeviriyi oku\n2. 🎤 düğmesine bas (ya da direkt konuş — düğme kendiliğinden belirir)\n3. Almanca kelimeyi mikrofona söyle\n4. Sistem ne duyduğunu ve eşleşmeyi gösterecek\n\n✅ Doğru — devam ediyoruz\n😕 Yanlış — tekrar dene veya \"Atla\" düğmesine bas\n\n⚠️ Android/PC'de Chrome'da çalışır. iPhone'da şimdilik sadece okuma var.\n\n💡 İpucu: kelimenin doğru nasıl söylendiğini önce duymak için 🔊 düğmesine bas."
      },
      {
        "icon": "📖",
        "title": "Okuyucu — metinleri okuyup çeviriyoruz",
        "body": "\"Okuyucu\" bölümü — üç mod:\n\n▶ Oku — metni yapıştır, düğmeye bas ve dinle. Bir kelimeye tıkla — sözlükten çeviri görürsün.\n\n🌐 Çift dilli — yapay zeka metni paragraf paragraf çevirir. Dilleri seç (örneğin Almanca → Rusça). \"Çevir\" düğmesine bas.\n\n💬 Konuşma — Google Translate gibi! İki kişi sırayla mikrofona konuşur — sistem çevirir ve sesli okur. Derste veya ana dili konuşan biriyle sohbet etmek için kullanışlıdır.\n\n⚠️ Mikrofonlu modlar yalnızca Chrome'da çalışır."
      },
      {
        "icon": "💬",
        "title": "Konuşma kılavuzu — senin ifadelerin",
        "body": "Konuşma kılavuzuna, alıştırmalardan (📖 düğmesiyle) kaydettiğin ifadeler eklenir.\n\nAyrıca bir ifadeyi elle de ekleyebilirsin:\n1. \"+ İfade Ekle\" düğmesine bas\n2. Almanca ifadeyi yaz\n3. Alandan çık — yapay zeka kendisi çevirir!\n4. Gerekirse düzelt ve kaydet\n\nBir ifadeyi öğrendiğinde ✅ ile işaretle."
      },
      {
        "icon": "🤖",
        "title": "AI koç — canlı diyaloglar (GÜNCELLENDİ)",
        "body": "\"AI koç\" bölümü — koçla canlı bir sohbet. İlki 🤓 Pablo (kurucu), ayrıca Лена, Макс, Ганна, Отто.\n\nBir karakter ve konu seç (veya \"N. Ders Kelimeleri\") → \"Konuşmayı Başlat\".\n\nKarakter Almanca cevap verir, mesajın altında: çeviri, hataların, 🔊 dinle.\n\n✨ SESLİ MOD (Gemini'deki gibi): giriş alanının yanındaki ✨'ye bas → Pablo'nun büyük bir fotoğrafı belirir, seni selamlar ve dinler. Sadece konuş — ellerin serbest! Sesle cevap verir, \"doğru/yanlış\" tepkisi verir (Almanya renkleri), altta ise sohbet günlüğü akar (Almanca + çeviri, 🔊 dinle). Almanca konuşabilirsin (hassas tanıma) veya kendi diline geçebilirsin.\n\n⚠️ Ses, Chrome'da (Android/PC) çalışır."
      },
      {
        "icon": "📐",
        "title": "Dilbilgisi — kopya kâğıdı (YENİ)",
        "body": "Menüdeki \"Dilbilgisi\" bölümü — hâller, edatlar ve fiiller için bir başvuru kılavuzu.\n\nHerhangi bir konuyu aç → anlaşılır bir açıklama ve renkli tablolar göreceksin:\n🔵 der (eril) · 🔴 die (dişil) · 🟢 das (nötr) · ⚫ çoğul\n\nHer hâl için bir soru (kim? kimi? kime?) ve ne zaman kullanıldığına dair açıklama var. Alıştırmalardan önce bak ve tekrar et."
      },
      {
        "icon": "🎬",
        "title": "Alıştırmalarda Pablo (YENİ)",
        "body": "Artık alıştırmalarda koç Pablo cevabına tepki veriyor: yüzü canlanıyor ve doğruysa \"Sehr gut!\", yanlışsa \"Nicht ganz\" diyor.\n\nSadece metin istiyorsan, videosuz — kapatabilirsin: Ayarlar → Ses → \"Alıştırmalarda koç\"."
      },
      {
        "icon": "👤",
        "title": "Profil — avatar ve bilgiler",
        "body": "Soldaki menüde avatara (harfli veya emojili daire) tıkla — profil açılır.\n\nNeleri ayarlayabilirsin:\n• Avatar — 12 emojiden birini seç veya adının harfi kalsın\n• Tam ad, meslek\n• Telefon, Telegram, WhatsApp\n• Şifre değiştirme\n\nBu bilgiler öğretmen tarafından \"Öğrenciler\" bölümünde görülür."
      },
      {
        "icon": "🔊",
        "title": "Ses ve ayarlar",
        "body": "Menüde (soldaki ☰ düğmesi veya telefonda alttaki):\n\n🔊 aç/kapat — kelimelerin otomatik telaffuzunu aç\n🎤 Ses — bir Almanca ses seç (Google Deutsch en iyi ses)\n🌙/☀️ — koyu veya açık tema\n🌍 Dil — arayüz dilini değiştir\n\nÇeviri telaffuzunu da açabilirsin — o zaman Almanca kelimeden sonra Rusçası da okunur."
      },
      {
        "icon": "🔗",
        "title": "Kartı paylaş (YENİ)",
        "body": "Bir kelime hoşuna gitti mi — bir arkadaşınla paylaş!\n\nSözlükte kelimenin yanında 🔗 düğmesi var. Bas — kartın bağlantısı kopyalanır (veya telefonda \"Paylaş\" menüsü açılır: Telegram, WhatsApp…).\n\nArkadaşın bağlantıyı açtığında kartı görür: kelime, KENDİ diline çeviri, görsel, örnek, dinlemek için 🔊 düğmesi ve kelimeyi kendine eklemek için \"➕ konuşma kılavuzuna\" düğmesi."
      },
      {
        "icon": "🔍",
        "title": "Sözlük: harfe ve taramaya göre filtre (YENİ)",
        "body": "Sözlükte artık ihtiyacın olan kelimeleri kolayca bulabilirsin:\n\n🔤 Harf — alfabeden bir harfe bas, yalnızca o harfle başlayan kelimeler kalır.\n\n📄 Tarama — bir ders seçersen, \"Tarama 1 / Tarama 2…\" çipleri görünür (ders kitabı sayfaları) — tam olarak o sayfadaki kelimeler.\n\nAramayla ve durumla (yeni/öğreniyorum/biliyorum) birlikte kullanılabilir."
      },
      {
        "icon": "🗣️",
        "title": "AI koç — daha canlı (GÜNCELLENDİ)",
        "body": "Koç artık gerçek bir muhatap gibi konuşuyor:\n• Her cümlesini çevirmiyor — anlamdan anlamaya çalış (çeviri ayarlardan açılabilir)\n• Her mesajda selamlaşmıyor ve övmüyor — sadece canlı bir sohbet\n• Hata analizi — sonunda, raporda\n\nBöylece Almancayı kulaktan anlamaya daha hızlı alışırsın."
      }
    ],
    "install": [
      {
        "icon": "📱",
        "title": "Uygulama kurulumu nedir?",
        "body": "Sitemiz PWA (Progressive Web App, \"İlerici Web Uygulaması\") adı verilen bir yapıdadır.\n\nBu şu anlama gelir: siteyi telefonuna veya dizüstü bilgisayarına normal bir uygulama gibi KURABİLİRSİN. Kurulumdan sonra:\n✅ Tarayıcı olmadan, gerçek bir uygulama gibi açılır\n✅ Daha hızlı açılır\n✅ Tam ekran çalışır (adres çubuğu olmadan)\n✅ Telefondaki uygulama listesinde görünür"
      },
      {
        "icon": "🤖",
        "title": "Android'a kurulum (telefon/tablet)",
        "body": "1. Siteyi Chrome'da aç\n2. 10-15 saniye bekle\n3. Ekranın altında şu bant belirir: \"Deutsch Lernen'i ana ekrana ekle\"\n4. \"Yükle\" veya \"Ekle\" düğmesine bas\n\nBant görünmezse:\n• Chrome'un sağ üst köşesindeki üç nokta ⋮ işaretine bas\n• \"Ana ekrana ekle\" seçeneğini seç\n• \"Yükle\" düğmesine bas\n\nHazır! Uygulama ana ekranda görünecek."
      },
      {
        "icon": "🍎",
        "title": "iPhone/iPad'a kurulum",
        "body": "1. Siteyi Safari tarayıcısında aç (Chrome değil, mutlaka Safari!)\n2. Ekranın altındaki \"Paylaş\" düğmesine bas — yukarı ok işaretli kare simgesi ⬆️\n3. Listeyi aşağı kaydır\n4. \"Ana Ekrana Ekle\" seçeneğine bas\n5. \"Ekle\" düğmesine bas\n\nUygulama, normal bir uygulama gibi ana ekranda görünecek.\n\n⚠️ Önemli: iPhone'da yalnızca Safari üzerinden çalışır. Chrome ve diğer tarayıcılar iOS'ta PWA kurulumunu henüz desteklemiyor."
      },
      {
        "icon": "💻",
        "title": "Dizüstü bilgisayara kurulum (Windows/Mac)",
        "body": "Chrome veya Edge tarayıcısında:\n\n1. Siteyi aç\n2. Adres çubuğunun sağında ⊕ simgesi veya bir monitör ikonu belirir — ona bas\n3. \"Yükle\" düğmesine bas\n\nYa da menü üzerinden:\n• Chrome: üç nokta ⋮ → \"Kaydet ve paylaş\" → \"Kısayol oluştur\" → \"Pencere olarak aç\" ✓\n• Edge: üç nokta … → \"Uygulamalar\" → \"Bu siteyi uygulama olarak yükle\"\n\nKurulumdan sonra uygulama, adres çubuğu olmadan ayrı bir pencere olarak açılır."
      },
      {
        "icon": "🏪",
        "title": "Google Play (yakında)",
        "body": "İleride uygulama Google Play Store'da yer alacak — o zaman mağaza üzerinden normal bir uygulama gibi kurulabilecek.\n\nGüncel sürüm her zaman deutschlernen.ai sitesinde mevcuttur — orada güncellemeler, mağaza incelemesi beklenmeden anında görünür.\n\nPWA uygulaması (tarayıcı üzerinden kurulum) mağazadaki bir uygulama kadar iyi çalışır."
      },
      {
        "icon": "🔄",
        "title": "Güncellemeler",
        "body": "Uygulama otomatik olarak güncellenir — bir sonraki açılışta yeni sürümü kendisi indirir.\n\nHiçbir şey yapmana gerek yok — tüm iyileştirmeler kendiliğinden gelir."
      }
    ]
  },
  ar: {
    "title": "المساعدة",
    "tabs": [
      "👨‍🏫 للمعلم",
      "👨‍🎓 للطالب",
      "📲 التثبيت"
    ],
    "teacher": [
      {
        "icon": "🎯",
        "title": "كيف يعمل نظام التعلم",
        "body": "يستخدم النظام التكرار المتباعد (خوارزمية SM-2).\n\nيقوم المعلم برفع صور صفحات الكتاب المدرسي ← يقرأ الذكاء الاصطناعي المحتوى وينشئ البطاقات ← يكرر الطالب الكلمات في أفضل الأوقات.\n\nكلما تذكر الطالب الكلمة بشكل أفضل، كلما قلّ ظهورها. أما الكلمة المنسية فتعود فورًا."
      },
      {
        "icon": "1️⃣",
        "title": "التسجيل",
        "body": "سجّل بصفة «معلم / ولي أمر». يمنحك هذا وصولاً كاملاً: إنشاء الدروس، متابعة الطلاب، إدارة الدورات، وتشغيل عمليات الإدارة."
      },
      {
        "icon": "2️⃣",
        "title": "أنشئ دورة",
        "body": "انتقل إلى «الدورات» ← «+ دورة». أدخل اسمًا (مثلاً «الصف السادس 2024/2025»). الدورة هي مجلد للدروس. يمكن ربط الطالب بدورة معينة."
      },
      {
        "icon": "3️⃣",
        "title": "ارفع درسًا",
        "body": "1. داخل الدورة اضغط «+ إضافة درس»\n2. صوّر صفحات الكتاب المدرسي و/أو الدفتر (يمكن إضافة عدة صور دفعة واحدة)\n3. أضف تسجيلاً صوتيًا للدرس إن رغبت\n4. اضغط «معالجة الدرس»\n\nيمكنك أيضًا إنشاء درس عبر قائمة «+ درس» على اليسار."
      },
      {
        "icon": "⏳",
        "title": "معالجة الصور",
        "body": "يقرأ الذكاء الاصطناعي كل صورة ويستخرج الكلمات والقواعد وأمثلة الجمل.\n\n• حوالي 10 ثوانٍ لكل صورة\n• 24 صورة ≈ 5-8 دقائق\n• التقدم: «الصورة 3 من 24…» ← «جارٍ إنشاء التمارين…» ← «تم!»\n\nيمكنك إغلاق الصفحة — فالمعالجة تتم على الخادم. تظهر الحالة في قسم «الدروس»."
      },
      {
        "icon": "4️⃣",
        "title": "ماذا يُنشأ تلقائيًا",
        "body": "من كل كلمة في الدرس ينشئ الذكاء الاصطناعي 7 أنواع من التمارين:\n\n🃏 بطاقة سريعة — اقلبها وقيّم نفسك\n✏️ املأ الفراغ — اكتب الكلمة في الجملة\n☑️ اختيار من متعدد — 4 خيارات\n✍️ اكتب جملة — يتحقق منها الذكاء الاصطناعي\n🔤 أضف الحرف — خمّن الحرف الناقص\n🎙️ إملاء — تُنطق الكلمة بصوت عالٍ وعليك كتابتها\n🗣️ النطق — انطق الكلمة بصوت عالٍ وسيتحقق النظام من صحتها"
      },
      {
        "icon": "5️⃣",
        "title": "الطلاب",
        "body": "يسجّل الطلاب أنفسهم بصفة «طالب». يمكن متابعة تقدمهم في قسم «الطلاب»:\n• عدد الكلمات المحفوظة\n• عدد المحاولات اليوم\n• الدروس التي يمرون بها\n\nيمكن ربط الطالب بدورة معينة."
      },
      {
        "icon": "📖",
        "title": "القارئ",
        "body": "قسم «القارئ» يضم ثلاثة أوضاع للتعامل مع النصوص:\n\n▶ قراءة — نص قابل للنقر مع تحويل النص إلى كلام (سرعة 0.7×–1.2×). اضغط على كلمة لترى ترجمتها من القاموس.\n\n🌐 ثنائي اللغة — يترجم الذكاء الاصطناعي الفقرات. اختر أي زوج لغوي من بين 8 لغات (ألماني←روسي، روسي←إنجليزي وغيرها). النماذج: ⚡ سريع (GPT-4o-mini) أو ✨ دقيق (GPT-4o).\n\n💬 محادثة — وضع يشبه Google Translate. يتحدث شخصان بالتناوب في الميكروفون — يترجم النظام ويقرأ الرد بصوت عالٍ. يعمل فقط في متصفح Chrome."
      },
      {
        "icon": "🤖",
        "title": "المدرّب الذكي",
        "body": "قسم «المدرّب الذكي» يقدّم تدريبات حوارية حية مع مرشد بالذكاء الاصطناعي.\n\n1. اختر شخصية:\n🧑‍🏫 Лена — معلمة من برلين\n☕ Макс — باريستا في مقهى\n🛒 Ганна — بائعة في متجر\n🏨 Отто — موظف استقبال في فندق\n\n2. اختر موضوعًا: التعارف، المقهى، التسوق، الفندق، الاتجاهات أو محادثة حرة\n\n3. اضغط «بدء المحادثة» — وابدأ الحديث!\n\nتجيب الشخصية باللغة الألمانية. تحت الرد تجد:\n• الترجمة إلى الأوكرانية/الروسية\n• تصحيح أخطائك (إن وُجدت)\n• زر 🔊 للاستماع\n\nإذا كتبت بالروسية أو الأوكرانية، يفهم الذكاء الاصطناعي ويواصل الحوار."
      },
      {
        "icon": "💬",
        "title": "كتاب العبارات",
        "body": "يمكن للطلاب حفظ العبارات من التمارين بالضغط على زر 📖. أو إضافتها يدويًا — عند إدخال عبارة ألمانية يترجمها الذكاء الاصطناعي تلقائيًا.\n\nيمكن تعديل العبارات، ووضع علامة عليها كمحفوظة، وتصفيتها حسب الفئات."
      },
      {
        "icon": "🌍",
        "title": "الترجمات",
        "body": "يعرض قسم «الترجمات» كل ما تمت ترجمته في الموقع:\n• كلمات القاموس (901 كلمة، 10 لغات)\n• عناوين الدروس\n• عبارات كتاب العبارات\n• نصوص الواجهة\n\nيوجد بحث شامل يبحث فوريًا في كل المجموعات."
      },
      {
        "icon": "⚙️",
        "title": "عمليات الإدارة",
        "body": "في اللوحة الجانبية (على الحاسوب) أو في القائمة توجد أزرار إدارية لعمليات جماعية:\n\n• 🖼 الصور — صور للكلمات من Unsplash\n• ⭐ القاموس++ — أمثلة جمل عبر الذكاء الاصطناعي\n• 🌐 الكلمات ← 10 لغات — ترجمة القاموس\n• 📝 التمارين ← اللغات — ترجمة خيارات الإجابة\n• 🔤 العناوين ← اللغات — ترجمة عناوين الدروس\n• 🔊 النطق — إضافة تمارين صوتية لجميع الدروس\n• 🔄 إعادة إنشاء الكل — تحديث جميع التمارين (سيؤدي إلى إعادة ضبط التقدم!)\n\nتعمل العمليات في الخلفية مع عرض التقدم «تم/الإجمالي». تظهر الحالة مباشرة في القائمة."
      },
      {
        "icon": "🚀",
        "title": "«معالجة الكل» — زر واحد (جديد)",
        "body": "الآن عند رفع الدرس، تقوم المعالجة بكل شيء بنفسها، دون الحاجة للضغط على أي زر:\n\n1. تقرأ النص من الصورة\n2. تستخرج الكلمات (📘 الكتاب المدرسي + ✏️ الدفتر بشكل منفصل)\n3. تُنشئ 7 أنواع من التمارين (ألمانية سليمة، مفهومة حتى للأطفال)\n4. تبتكر عنوانًا ووصفًا للدرس\n5. تختار صورًا مناسبة للكلمات\n6. تترجم الكلمات والتمارين إلى جميع اللغات العشر\n\nالعنوان التلقائي: إذا لم يُحدَّد الموضوع — «الدرس N: <موضوع الذكاء الاصطناعي>».\n\nللدرس الجاهز — زر «✨ معالجة الكل»: يكمل الناقص (الصور، الترجمات) دون إعادة ضبط تقدم الطلاب."
      },
      {
        "icon": "✏️",
        "title": "تمارين خاصة من القاموس (جديد)",
        "body": "اجمع مجموعة تمارين من الكلمات التي تريدها:\n\n1. افتح «القاموس»\n2. صفِّ الكلمات — مثلاً «قيد التعلّم»، أو حسب الدرس/نوع الكلمة/البحث\n3. اضغط «✏️ مجموعة» (في الأعلى)\n4. أدخل اسمًا ← سيجمع النظام مجموعة تمارين من هذه الكلمات ويفتحها\n\nمفيد للتحضير المركّز للإملاء أو لترسيخ الكلمات الصعبة. المجموعة هي «درس» منفصل، ولا تتكرر الكلمات."
      },
      {
        "icon": "📐",
        "title": "القواعد — دليل مرجعي (جديد)",
        "body": "قسم «القواعد» في القائمة — مرجع سريع لحالات الإعراب وحروف الجر والأفعال وصيغة Konjunktiv.\n\nصوّرت ملصقًا قواعديًا؟ يستخرج الذكاء الاصطناعي منه القواعد في جداول منظّمة:\n• ألوان الجنس كما في المدرسة: 🔵 der · 🔴 die · 🟢 das · ⚫ الجمع\n• سؤال الحالة الإعرابية (wer/wen/wem) وشرح واضح لكل حالة\n• الصورة الأصلية — بالضغط على زر «إظهار الصورة الأصلية»\n\nهذا منفصل عن دروس المفردات — فنحن لا نخلط القواعد بالكلمات."
      },
      {
        "icon": "🎥",
        "title": "الصورة الرمزية الفيديوية للمدرّب (مدفوعة، D-ID)",
        "body": "في المدرّب الذكي يمكن للمرشد Pablo أن ينبض بالحياة فعليًا (حركة الشفاه) عبر خدمة D-ID — وهذا خيار مدفوع.\n\n🟢 الوضع الصوتي ✨ ومقاطع الفيديو الجاهزة (الترحيب، «صحيح/خطأ») تعمل مجانًا وبلا حدود.\n\nيظهر زر 🎥 «تحريك» فقط عندما يكون هناك رصيد في حساب D-ID. لمزيد من التفاصيل — راجع الإعدادات."
      },
      {
        "icon": "📊",
        "title": "تحليلات الصف (جديد)",
        "body": "قسم «📊 تحليلات الصف» — زر في صفحة «الطلاب» (أو قسم في الصفحة الرئيسية).\n\nما يمكنك رؤيته حول دروسك:\n• الملخص: عدد الطلاب، من نشط خلال 7 أيام، إجمالي الإجابات، الدقة العامة\n• لكل طالب: عدد الإجابات (وخلال الأسبوع)، نسبة الدقة %، عدد الكلمات المعروفة/قيد التعلّم، وقت آخر نشاط\n• 🔥 الكلمات الصعبة — أين تكثر الأخطاء (ما يستحق إعادة تعلّمه)\n• أين يتعثرون — الدقة حسب نوع التمرين (الإملاء، النطق، الاختيار…)\n\nلون الدقة: أحمر أقل من 60%، أصفر أقل من 80%، أخضر لما هو أعلى. تتراكم البيانات تلقائيًا أثناء حل الطلاب للتمارين."
      },
      {
        "icon": "🔍",
        "title": "مرشحات القاموس: المسح والحروف (جديد)",
        "body": "في القاموس أصبح بإمكانك الآن تصفية الكلمات بسرعة:\n\n📄 حسب المسح — اختر درسًا، وستظهر شرائح «مسح 1 / مسح 2…» (صفحات الكتاب المدرسي). تعرض الكلمات من تلك الصفحة تحديدًا. تعمل مع الدروس التي رُفعت بعدة صور.\n\n🔤 حسب الحرف — شرائح الأبجدية: فقط الكلمات التي تبدأ بالحرف المختار.\n\nيمكن الجمع بين المرشحات والدورة/الدرس/الحالة والبحث."
      },
      {
        "icon": "🗣️",
        "title": "المدرّب الذكي أصبح أكثر طبيعية (محدَّث)",
        "body": "أصبح المدرّب الآن يدير حوارًا حيًا وليس «درسًا»:\n• لا يترجم ردوده افتراضيًا إلى الروسية — يفهم الطالب من السياق (يمكن تفعيل الترجمة بشكل منفصل)\n• لا يُلقي التحية في كل رسالة ولا يمدح/ينتقد بشكل روتيني\n• تحليل الأخطاء والتقييم العام — في التقرير النهائي، وليس بعد كل جملة\n\nهذا أقرب إلى محادثة حقيقية مع متحدث أصلي للغة."
      }
    ],
    "student": [
      {
        "icon": "🎯",
        "title": "كيف يعمل التعلّم — ببساطة",
        "body": "تخيّل أن البرنامج مدرّب ذكي. إنه يتذكر أي الكلمات تعرفها جيدًا بالفعل وأيها لا تزال غير واضحة لك.\n\n📅 تعرف الكلمة جيدًا ← ستراها مجددًا بعد أسبوع\n😐 تعرفها تقريبًا ← بعد 2-3 أيام\n❌ نسيتها ← ستتكرر اليوم مباشرة\n\n🔑 القاعدة الأهم: ادخل كل يوم وقم بحل التمارين. حتى 10 دقائق يوميًا تعطي نتيجة ممتازة!"
      },
      {
        "icon": "1️⃣",
        "title": "التسجيل",
        "body": "سجّل بصفة «طالب». اسأل معلمك عن عنوان الموقع.\n\nبعد تسجيل الدخول ستنتقل مباشرة إلى الصفحة الرئيسية «اليوم»."
      },
      {
        "icon": "2️⃣",
        "title": "📅 صفحة «اليوم»",
        "body": "هنا تظهر التمارين التي يجب إنجازها اليوم.\n\nهل ترى الأرقام؟ إنها عدد التمارين حسب النوع:\n🃏 بطاقات سريعة\n✏️ فراغات\n☑️ اختيار من متعدد\n✍️ كتابة جملة\n🔤 إضافة حرف\n🎙️ إملاء\n\nاضغط «بدء المراجعة» — وابدأ!"
      },
      {
        "icon": "🃏",
        "title": "البطاقة السريعة",
        "body": "تُعرض عليك كلمة ألمانية. حاول تذكر ترجمتها، ثم اضغط على البطاقة لترى الإجابة.\n\nقيّم نفسك بصدق:\n❌ لا أتذكر — ستعود الكلمة اليوم مجددًا\n😐 بصعوبة — بعد يوم واحد\n🙂 جيد — بعد 3 أيام\n✅ أتذكرها بسهولة — بعد أسبوع أو أكثر"
      },
      {
        "icon": "✏️",
        "title": "املأ الفراغ",
        "body": "توجد في الجملة الألمانية فراغ ___. اكتب الكلمة الصحيحة واضغط «تحقق».\n\n💡 تلميح: يظهر السياق في الجملة، وهذا يساعدك على تذكر الكلمة. حالة الأحرف غير مهمة — «Haus» و«haus» تُحتسبان متساويتين."
      },
      {
        "icon": "☑️",
        "title": "اختيار من متعدد",
        "body": "هل ترى السؤال وأربعة خيارات؟ اضغط على الإجابة الصحيحة.\n\n🟢 أخضر — صحيح، ننتقل للتالي\n🔴 أحمر — خطأ، انظر إلى الإجابة الصحيحة\n\nبعد الإجابة سينفتح التمرين التالي تلقائيًا خلال ثانية."
      },
      {
        "icon": "✍️",
        "title": "اكتب جملة",
        "body": "تُعطى كلمة ألمانية وتلميح. اكتب أي جملة بسيطة بالألمانية تحتوي على هذه الكلمة.\n\nمثال: كلمة «Hund» ← «Ich habe einen Hund.» ✓\n\nسيتحقق الذكاء الاصطناعي من:\n• هل استُخدمت الكلمة بشكل صحيح\n• هل توجد أخطاء فادحة\nثم يمنحك تقييمًا من ★ إلى ★★★★★"
      },
      {
        "icon": "🔤",
        "title": "أضف الحرف",
        "body": "تُعرض كلمة ألمانية بها حرف ناقص (أو عدة أحرف). عليك تخمين الحرف الناقص.\n\nمثال: «_aus» ← «H» ← «Haus» ✓\n\nهذا يساعد على حفظ إملاء الكلمات الألمانية التي تحتوي على أحرف العلة الممطوطة (ä, ö, ü)."
      },
      {
        "icon": "🎙️",
        "title": "الإملاء",
        "body": "تُنطق الكلمة بصوت عالٍ بالألمانية. أنت تسمعها لكن لا تراها — عليك كتابتها بشكل صحيح!\n\n1. استمع جيدًا 🎵\n2. اضغط ◄ إذا أردت سماعها مرة أخرى\n3. اكتب الكلمة\n4. اضغط «تحقق»\n\nهذا هو أصعب تمرين — فهو يختبر السمع والإملاء معًا!"
      },
      {
        "icon": "🗣️",
        "title": "النطق — تحدث بالألمانية",
        "body": "تُعرض عليك ترجمة الكلمة إلى الروسية — وعليك أن تنطق الكلمة الألمانية بصوت عالٍ.\n\n1. اقرأ الترجمة الروسية\n2. اضغط على زر 🎤 (أو تحدث مباشرة — سيظهر الزر تلقائيًا)\n3. انطق الكلمة الألمانية في الميكروفون\n4. سيُظهر النظام ما سمعه ومدى التطابق\n\n✅ صحيح — نكمل للتالي\n😕 غير دقيق — حاول مرة أخرى أو اضغط «تخطي»\n\n⚠️ يعمل في متصفح Chrome على أندرويد/الحاسوب. على آيفون متاحة القراءة فقط حاليًا.\n\n💡 نصيحة: اضغط زر 🔊 لتسمع أولاً كيف تُنطق الكلمة بشكل صحيح."
      },
      {
        "icon": "📖",
        "title": "القارئ — نقرأ ونترجم النصوص",
        "body": "قسم «القارئ» — ثلاثة أوضاع:\n\n▶ قراءة — ألصق النص، اضغط الزر واستمع. اضغط على كلمة لترى ترجمتها من القاموس.\n\n🌐 ثنائي اللغة — يترجم الذكاء الاصطناعي النص فقرة فقرة. اختر اللغات (مثلاً ألماني ← روسي). اضغط «ترجم».\n\n💬 محادثة — تمامًا مثل Google Translate! يتحدث شخصان بالتناوب في الميكروفون — يترجم النظام ويقرأ الترجمة بصوت عالٍ. مفيد أثناء الدرس أو للتحدث مع متحدث أصلي للغة.\n\n⚠️ الأوضاع التي تستخدم الميكروفون تعمل فقط في متصفح Chrome."
      },
      {
        "icon": "💬",
        "title": "كتاب العبارات — عباراتك",
        "body": "تُضاف إلى كتاب العبارات العبارات التي حفظتها من التمارين (زر 📖).\n\nيمكنك أيضًا إضافة عبارة يدويًا:\n1. اضغط «+ إضافة عبارة»\n2. اكتب العبارة بالألمانية\n3. اخرج من الحقل — سيترجمها الذكاء الاصطناعي بنفسه!\n4. صحّح إن لزم واحفظ\n\nضع علامة ✅ على العبارة عندما تحفظها."
      },
      {
        "icon": "🤖",
        "title": "المدرّب الذكي — حوارات حية (محدَّث)",
        "body": "قسم «المدرّب الذكي» — محادثة حية مع مرشد. الأول هو 🤓 Pablo (المؤسس)، وأيضًا Лена وМакс وГанна وОтто.\n\nاختر شخصية وموضوعًا (أو «كلمات الدرس N») ← «بدء المحادثة».\n\nتجيب الشخصية بالألمانية، وتحت الرسالة: الترجمة، أخطاؤك، 🔊 للاستماع.\n\n✨ الوضع الصوتي (مثل Gemini): اضغط ✨ بجانب حقل الإدخال ← تظهر صورة كبيرة لـ Pablo، يرحب بك ويستمع. تحدث فقط — يداك حرّتان! يجيب بصوته، ويتفاعل بـ«صحيح/خطأ» (بألوان علم ألمانيا)، وفي الأسفل يظهر سجل المحادثة (الألمانية + الترجمة، 🔊 للاستماع). يمكنك التحدث بالألمانية (تمييز دقيق) أو التبديل إلى لغتك.\n\n⚠️ الصوت يعمل في متصفح Chrome (أندرويد/الحاسوب)."
      },
      {
        "icon": "📐",
        "title": "القواعد — ورقة مرجعية (جديد)",
        "body": "قسم «القواعد» في القائمة — دليل مرجعي لحالات الإعراب وحروف الجر والأفعال.\n\nافتح أي موضوع ← ستجد شرحًا واضحًا وجداول ملونة:\n🔵 der (مذكر) · 🔴 die (مؤنث) · 🟢 das (محايد) · ⚫ الجمع\n\nلكل حالة إعرابية سؤال (من؟ من [مفعول]؟ لمن؟) وشرح متى تُستخدم. راجعها قبل التمارين."
      },
      {
        "icon": "🎬",
        "title": "Pablo في التمارين (جديد)",
        "body": "أصبح الآن المرشد Pablo يتفاعل مع إجاباتك في التمارين: يتحرك وجهه ويقول «Sehr gut!» إذا كانت إجابتك صحيحة أو «Nicht ganz» إذا أخطأت.\n\nإذا كنت تفضل النص فقط دون فيديو — يمكنك إيقاف ذلك من: الإعدادات ← الصوت ← «المدرّب في التمارين»."
      },
      {
        "icon": "👤",
        "title": "الملف الشخصي — الصورة الرمزية والبيانات",
        "body": "اضغط على الصورة الرمزية (دائرة تحتوي حرفًا أو رمزًا تعبيريًا) في القائمة اليسرى — سيفتح الملف الشخصي.\n\nما يمكن ضبطه:\n• الصورة الرمزية — اختر من بين 12 رمزًا تعبيريًا أو اتركها بحرف اسمك\n• الاسم الكامل والمهنة\n• الهاتف، Telegram، WhatsApp\n• تغيير كلمة المرور\n\nهذه البيانات مرئية للمعلم في قسم «الطلاب»."
      },
      {
        "icon": "🔊",
        "title": "الصوت والإعدادات",
        "body": "في القائمة (زر ☰ على اليسار أو في الأسفل على الهاتف):\n\n🔊 تشغيل/إيقاف — تفعيل النطق التلقائي للكلمات\n🎤 الصوت — اختيار صوت ألماني (صوت Google Deutsch هو الأفضل)\n🌙/☀️ — الوضع الداكن أو الفاتح\n🌍 اللغة — تبديل لغة الواجهة\n\nيمكن تفعيل نطق الترجمة أيضًا — عندها بعد الكلمة الألمانية سيُنطق الروسي أيضًا."
      },
      {
        "icon": "🔗",
        "title": "مشاركة البطاقة (جديد)",
        "body": "أعجبتك كلمة؟ شاركها مع صديق!\n\nفي القاموس، بجانب كل كلمة زر 🔗. اضغط عليه — سيُنسخ رابط البطاقة (أو ستفتح قائمة «مشاركة» على الهاتف: Telegram، WhatsApp…).\n\nسيفتح صديقك الرابط ويرى البطاقة: الكلمة، ترجمتها بلغته هو، صورة، مثال، زر 🔊 للاستماع، وزر «➕ إلى كتاب العبارات» لإضافة الكلمة لنفسه."
      },
      {
        "icon": "🔍",
        "title": "القاموس: تصفية حسب الحرف والمسح (جديد)",
        "body": "أصبح من السهل الآن إيجاد الكلمات المطلوبة في القاموس:\n\n🔤 الحرف — اضغط على حرف من الأبجدية، وستبقى فقط الكلمات التي تبدأ به.\n\n📄 المسح — إذا اخترت درسًا، ستظهر شرائح «مسح 1 / مسح 2…» (صفحات الكتاب المدرسي) — الكلمات من تلك الصفحة تحديدًا.\n\nيمكن الجمع بينها وبين البحث والحالة (جديد/قيد التعلم/أعرفها)."
      },
      {
        "icon": "🗣️",
        "title": "المدرّب الذكي — أكثر حيوية (محدَّث)",
        "body": "أصبح المدرّب الآن يتحدث كمحاور حقيقي:\n• لا يترجم كل جملة يقولها — حاول أن تفهم من السياق (يمكن تفعيل الترجمة من الإعدادات)\n• لا يُلقي التحية أو يمدح في كل رسالة — مجرد حوار حي وطبيعي\n• تحليل الأخطاء — في النهاية، ضمن التقرير\n\nهكذا تعتاد بشكل أسرع على فهم الألمانية سمعيًا."
      }
    ],
    "install": [
      {
        "icon": "📱",
        "title": "ما هو تثبيت التطبيق؟",
        "body": "موقعنا هو ما يُعرف بتطبيق الويب التقدمي PWA (Progressive Web App).\n\nهذا يعني أن الموقع يمكن تثبيته كتطبيق عادي على الهاتف أو الحاسوب المحمول. بعد التثبيت:\n✅ يعمل بدون متصفح، تمامًا كتطبيق حقيقي\n✅ يفتح بشكل أسرع\n✅ يعمل بملء الشاشة (بدون شريط العنوان)\n✅ يظهر في قائمة التطبيقات على الهاتف"
      },
      {
        "icon": "🤖",
        "title": "التثبيت على أندرويد (هاتف/جهاز لوحي)",
        "body": "1. افتح الموقع في متصفح Chrome\n2. انتظر 10-15 ثانية\n3. سيظهر شريط في أسفل الشاشة: «إضافة Deutsch Lernen إلى الشاشة الرئيسية»\n4. اضغط «تثبيت» أو «إضافة»\n\nإذا لم يظهر الشريط:\n• اضغط على النقاط الثلاث ⋮ في الزاوية العلوية اليمنى من Chrome\n• اختر «إضافة إلى الشاشة الرئيسية»\n• اضغط «تثبيت»\n\nتم! سيظهر التطبيق على الشاشة الرئيسية."
      },
      {
        "icon": "🍎",
        "title": "التثبيت على iPhone/iPad",
        "body": "1. افتح الموقع في متصفح Safari (يجب أن يكون Safari، وليس Chrome!)\n2. اضغط زر «مشاركة» في أسفل الشاشة — وهو أيقونة مربع بسهم يشير لأعلى ⬆️\n3. مرّر القائمة للأسفل\n4. اضغط «على الشاشة الرئيسية»\n5. اضغط «إضافة»\n\nسيظهر التطبيق على الشاشة الرئيسية كأي تطبيق عادي.\n\n⚠️ مهم: على iPhone يعمل التثبيت فقط عبر Safari. متصفح Chrome وغيره من المتصفحات لا تدعم بعد تثبيت تطبيقات PWA على iOS."
      },
      {
        "icon": "💻",
        "title": "التثبيت على الحاسوب المحمول (Windows/Mac)",
        "body": "في متصفح Chrome أو Edge:\n\n1. افتح الموقع\n2. في شريط العنوان على اليمين ستظهر أيقونة ⊕ أو أيقونة شاشة — اضغط عليها\n3. اضغط «تثبيت»\n\nأو عبر القائمة:\n• Chrome: النقاط الثلاث ⋮ ← «حفظ ومشاركة» ← «إنشاء اختصار» ← «فتح كنافذة» ✓\n• Edge: النقاط الثلاث … ← «التطبيقات» ← «تثبيت هذا الموقع كتطبيق»\n\nبعد التثبيت يعمل التطبيق كنافذة منفصلة بدون شريط عنوان."
      },
      {
        "icon": "🏪",
        "title": "Google Play (قريبًا)",
        "body": "في المستقبل سيتوفر التطبيق في متجر Google Play — عندها سيكون بالإمكان تثبيته كتطبيق عادي عبر المتجر.\n\nالنسخة الحالية متاحة دائمًا على موقع deutschlernen.ai — وهناك تظهر التحديثات فورًا دون انتظار مراجعة المتجر.\n\nتطبيق PWA (التثبيت عبر المتصفح) يعمل بجودة مماثلة لتطبيق من المتجر."
      },
      {
        "icon": "🔄",
        "title": "التحديثات",
        "body": "يُحدَّث التطبيق تلقائيًا — عند الفتح التالي سيقوم بتحميل النسخة الجديدة بنفسه.\n\nلا حاجة للقيام بأي شيء — ستظهر كل التحسينات تلقائيًا."
      }
    ]
  },
  es: {
    "title": "Ayuda",
    "tabs": [
      "👨‍🏫 Para el profesor",
      "👨‍🎓 Para el alumno",
      "📲 Instalación"
    ],
    "teacher": [
      {
        "icon": "🎯",
        "title": "Cómo funciona el aprendizaje",
        "body": "El sistema utiliza la repetición espaciada (algoritmo SM-2).\n\nEl profesor sube fotos de las páginas del libro → la IA las lee y crea tarjetas → el alumno repasa las palabras en los momentos óptimos.\n\nCuanto mejor recuerda el alumno una palabra, con menos frecuencia aparece. Una palabra olvidada vuelve enseguida."
      },
      {
        "icon": "1️⃣",
        "title": "Registro",
        "body": "Regístrate con el rol «Profesor / Padre». Esto te da acceso completo: creación de lecciones, visualización de alumnos, gestión de cursos, ejecución de operaciones de administrador."
      },
      {
        "icon": "2️⃣",
        "title": "Crea un curso",
        "body": "Ve a «Cursos» → «+ Curso». Escribe un nombre (por ejemplo «6º curso 2024/2025»). El curso es una carpeta para las lecciones. Puedes asignar un alumno a un curso concreto."
      },
      {
        "icon": "3️⃣",
        "title": "Sube una lección",
        "body": "1. Dentro del curso, pulsa «+ Añadir lección»\n2. Fotografía las páginas del libro y/o del cuaderno (puedes subir varias fotos a la vez)\n3. Si quieres, añade una grabación de audio de la lección\n4. Pulsa «Procesar lección»\n\nTambién puedes crear una lección desde el menú «+ Lección» de la izquierda."
      },
      {
        "icon": "⏳",
        "title": "Procesamiento de las fotos",
        "body": "La IA lee cada foto y extrae palabras, gramática y frases de ejemplo.\n\n• ~10 segundos por foto\n• 24 fotos ≈ 5-8 minutos\n• Progreso: «Foto 3 de 24…» → «Creando ejercicios…» → «¡Listo!»\n\nPuedes cerrar la página — el procesamiento continúa en el servidor. El estado se ve en la sección «Lecciones»."
      },
      {
        "icon": "4️⃣",
        "title": "Qué se crea automáticamente",
        "body": "A partir de cada palabra de la lección, la IA crea 7 tipos de ejercicios:\n\n🃏 Tarjeta flash — dar la vuelta y autoevaluarte\n✏️ Completa el hueco — escribe la palabra en la frase\n☑️ Opción múltiple — 4 alternativas\n✍️ Escribe una frase — la IA la corregirá\n🔤 Añade la letra — adivina la letra que falta\n🎙️ Dictado — se pronuncia la palabra en voz alta, hay que escribirla\n🗣️ Pronunciación — di la palabra en voz alta, el sistema comprobará si es correcta"
      },
      {
        "icon": "5️⃣",
        "title": "Alumnos",
        "body": "Los alumnos se registran ellos mismos con el rol «Alumno». Su progreso se ve en la sección «Alumnos»:\n• Cuántas palabras han aprendido\n• Cuántos intentos han hecho hoy\n• Qué lecciones están cursando\n\nPuedes asignar un alumno a un curso concreto."
      },
      {
        "icon": "📖",
        "title": "Lector",
        "body": "La sección «Lector» tiene tres modos de trabajo con textos:\n\n▶ Leer — texto interactivo con TTS (velocidad 0.7×–1.2×). Toca una palabra para ver su traducción del diccionario.\n\n🌐 Bilingüe — la IA traduce los párrafos. Elige cualquier par de idiomas entre 8 disponibles (alemán→español, español→inglés, etc.). Modelos: ⚡ Rápido (GPT-4o-mini) o ✨ Preciso (GPT-4o).\n\n💬 Conversación — modo similar a Google Translate. Dos participantes hablan por turnos al micrófono — el sistema traduce y pronuncia la respuesta. Solo funciona en Chrome."
      },
      {
        "icon": "🤖",
        "title": "Entrenador IA",
        "body": "La sección «Entrenador IA» son entrenamientos de conversación en vivo con un mentor de IA.\n\n1. Elige un personaje:\n🧑‍🏫 Лена — profesora de Berlín\n☕ Макс — barista en una cafetería\n🛒 Ганна — vendedora en una tienda\n🏨 Отто — recepcionista de hotel\n\n2. Elige un tema: Presentarse, Café, Compras, Hotel, Orientación o Conversación libre\n\n3. Pulsa «Iniciar conversación» — ¡y ponte a hablar!\n\nEl personaje responde en alemán. Debajo de la respuesta:\n• Traducción a tu idioma\n• Corrección de tus errores (si los hay)\n• Botón 🔊 para escuchar\n\nEscribes en tu idioma — la IA lo entiende y continúa el diálogo."
      },
      {
        "icon": "💬",
        "title": "Libro de frases",
        "body": "Los alumnos pueden guardar frases de los ejercicios con el botón 📖. O añadirlas a mano — al escribir una frase en alemán, la IA la traduce automáticamente.\n\nLas frases se pueden editar, marcar como aprendidas y filtrar por categorías."
      },
      {
        "icon": "🌍",
        "title": "Traducciones",
        "body": "La sección «Traducciones» muestra todo lo que está traducido en el sitio:\n• Palabras del diccionario (901 palabras, 10 idiomas)\n• Títulos de las lecciones\n• Frases del libro de frases\n• Textos de la interfaz\n\nHay un buscador global que busca al instante en todos los grupos."
      },
      {
        "icon": "⚙️",
        "title": "Operaciones de administrador",
        "body": "En el panel lateral (escritorio) o en el menú hay botones de administrador para operaciones masivas:\n\n• 🖼 Imágenes — fotos para las palabras desde Unsplash\n• ⭐ Diccionario++ — frases de ejemplo mediante IA\n• 🌐 Palabras → 10 idiomas — traducción del diccionario\n• 📝 Ejercicios → idiomas — traducción de las opciones de respuesta\n• 🔤 Títulos → idiomas — traducción de los títulos de las lecciones\n• 🔊 Pronunciación — añadir ejercicios de voz a todas las lecciones\n• 🔄 Recrear todo — actualizar todos los ejercicios (¡reinicia el progreso!)\n\nLas operaciones se ejecutan en segundo plano con un progreso «hecho/total». El estado se ve directamente en el menú."
      },
      {
        "icon": "🚀",
        "title": "«Procesar todo» — un solo botón (NUEVO)",
        "body": "Ahora, al subir una lección, el procesamiento lo hace TODO solo, sin necesidad de pulsar botones:\n\n1. Lee el texto de las fotos\n2. Extrae las palabras (📘 libro + ✏️ cuaderno por separado)\n3. Crea 7 tipos de ejercicios (alemán claro, comprensible incluso para niños)\n4. Inventa el título y la descripción de la lección\n5. Elige imágenes para las palabras\n6. Traduce las palabras y los ejercicios a los 10 idiomas\n\nTítulo automático: si no indicaste un tema — «Lección N: <tema de la IA>».\n\nPara una lección ya creada — el botón «✨ Procesar todo»: completa lo que falte (imágenes, traducciones) SIN reiniciar el progreso de los alumnos."
      },
      {
        "icon": "✏️",
        "title": "Tus propios ejercicios desde el diccionario (NUEVO)",
        "body": "Crea un conjunto de ejercicios con las palabras que necesites:\n\n1. Abre el «Diccionario»\n2. Filtra las palabras — por ejemplo «en aprendizaje», o por lección/categoría gramatical/búsqueda\n3. Pulsa «✏️ Conjunto» (arriba)\n4. Escribe un nombre → el sistema creará un conjunto de ejercicios con esas palabras y lo abrirá\n\nMuy útil para preparar un dictado concreto o reforzar palabras difíciles. El conjunto es una «lección» aparte, las palabras no se duplican."
      },
      {
        "icon": "📐",
        "title": "Gramática — manual de referencia (NUEVO)",
        "body": "La sección «Gramática» del menú es una chuleta de casos, preposiciones, verbos y Konjunktiv.\n\nFotografiaste un póster de gramática — la IA extrajo de él las reglas y las ordenó en tablas claras:\n• Colores de los géneros, como en la escuela: 🔵 der · 🔴 die · 🟢 das · ⚫ plural\n• La pregunta del caso (wer/wen/wem) y una explicación clara para cada uno\n• La foto original — con el botón «mostrar original»\n\nEsto es independiente de las lecciones de vocabulario — no mezclamos la gramática con las palabras."
      },
      {
        "icon": "🎥",
        "title": "Avatar de vídeo del entrenador (de pago, D-ID)",
        "body": "En el Entrenador IA, el mentor Pablo puede cobrar vida de verdad (movimiento de labios) gracias al servicio D-ID — esto es una opción DE PAGO.\n\n🟢 El modo de voz ✨ y los clips de vídeo predefinidos (saludo, «correcto/incorrecto») funcionan GRATIS y sin límite.\n\nEl botón 🎥 «dar vida» aparece solo cuando hay créditos disponibles en la cuenta de D-ID. Más información en Configuración."
      },
      {
        "icon": "📊",
        "title": "Analítica de la clase (NUEVO)",
        "body": "La sección «📊 Analítica de la clase» — un botón en la página «Alumnos» (o un bloque en el inicio).\n\nQué puedes ver de tus lecciones:\n• Resumen: cuántos alumnos, quién estuvo activo en los últimos 7 días, total de respuestas, precisión general\n• Por cada alumno: cuántas respuestas (y en la última semana), precisión %, cuántas palabras sabe/está aprendiendo, cuándo fue la última vez que entró\n• 🔥 Palabras difíciles — dónde hay más errores (qué conviene repasar)\n• Dónde se atascan — precisión por tipo de ejercicio (dictado, pronunciación, opción múltiple…)\n\nColor de la precisión: rojo <60%, amarillo <80%, verde por encima. Los datos se acumulan solos mientras los alumnos practican."
      },
      {
        "icon": "🔍",
        "title": "Filtros del Diccionario: escaneo, letras (NUEVO)",
        "body": "En el Diccionario ahora puedes filtrar las palabras rápidamente:\n\n📄 Por ESCANEO — elige una lección y aparecerán chips «Escaneo 1 / Escaneo 2…» (páginas del libro). Muestra las palabras justo de esa página. Funciona para lecciones subidas con varias fotos.\n\n🔤 Por LETRA — chips del alfabeto: solo las palabras que empiezan por la letra elegida.\n\nLos filtros se combinan con el curso/lección/estado y la búsqueda."
      },
      {
        "icon": "🗣️",
        "title": "El Entrenador IA es más natural (ACTUALIZADO)",
        "body": "El entrenador ahora mantiene un diálogo real, no una «lección»:\n• Por defecto NO traduce sus intervenciones — el alumno las entiende por el contexto (la traducción se puede activar aparte)\n• No saluda en cada mensaje ni elogia/corrige de forma ritual\n• El análisis de errores y la valoración general van en el informe final, no después de cada frase\n\nEsto se parece más a una conversación real con un hablante nativo."
      }
    ],
    "student": [
      {
        "icon": "🎯",
        "title": "Cómo funciona el aprendizaje — de forma sencilla",
        "body": "Imagina que el programa es un entrenador inteligente. Recuerda qué palabras ya conoces bien y cuáles todavía no.\n\n📅 Conoces bien la palabra → la verás dentro de una semana\n😐 Casi la sabes → dentro de 2-3 días\n❌ La olvidaste → se repite hoy mismo\n\n🔑 Regla principal: entra TODOS LOS DÍAS y haz los ejercicios. ¡Incluso 10 minutos al día dan un resultado excelente!"
      },
      {
        "icon": "1️⃣",
        "title": "Registro",
        "body": "Regístrate con el rol «Alumno». Pregúntale a tu profesor la dirección del sitio.\n\nDespués de entrar, irás directamente a la página principal «Hoy»."
      },
      {
        "icon": "2️⃣",
        "title": "📅 La página «Hoy»",
        "body": "Aquí se muestran los ejercicios que HAY QUE hacer hoy.\n\n¿Ves los números? Es la cantidad de ejercicios por tipo:\n🃏 Tarjetas flash\n✏️ Huecos\n☑️ Opción múltiple\n✍️ Escribir una frase\n🔤 Añadir una letra\n🎙️ Dictado\n\nPulsa «Empezar repaso» — ¡y adelante!"
      },
      {
        "icon": "🃏",
        "title": "Tarjeta flash",
        "body": "Te muestran una palabra en alemán. Recuerda la traducción y luego toca la tarjeta — verás la respuesta.\n\nEvalúate con sinceridad:\n❌ No me acuerdo — la palabra volverá hoy mismo\n😐 Con dificultad — en 1 día\n🙂 Bien — en 3 días\n✅ La recuerdo fácil — en 1 semana o más"
      },
      {
        "icon": "✏️",
        "title": "Completa el hueco",
        "body": "En la frase alemana hay un hueco ___. Escribe la palabra correcta y pulsa «Comprobar».\n\n💡 Pista: en la frase se ve el contexto, eso te ayudará a recordar la palabra. Las mayúsculas no importan — «Haus» y «haus» se cuentan igual."
      },
      {
        "icon": "☑️",
        "title": "Opción múltiple",
        "body": "¿Ves una pregunta y 4 opciones? Toca la correcta.\n\n🟢 Verde — correcto, seguimos adelante\n🔴 Rojo — error, mira cuál era la respuesta correcta\n\nDespués de responder, en un segundo se abrirá automáticamente el siguiente ejercicio."
      },
      {
        "icon": "✍️",
        "title": "Escribe una frase",
        "body": "Te dan una palabra en alemán y una pista. Escribe CUALQUIER frase sencilla en alemán con esa palabra.\n\nEjemplo: la palabra «Hund» → «Ich habe einen Hund.» ✓\n\nLa IA comprobará:\n• Si la palabra está bien usada\n• Si hay errores graves\nY pondrá una puntuación de ★ a ★★★★★"
      },
      {
        "icon": "🔤",
        "title": "Añade la letra",
        "body": "Se muestra una palabra alemana con una letra (o varias) que falta. Hay que adivinar qué letra falta.\n\nEjemplo: «_aus» → «H» → «Haus» ✓\n\nEsto ayuda a memorizar la ortografía de las palabras alemanas con diéresis (ä, ö, ü)."
      },
      {
        "icon": "🎙️",
        "title": "Dictado",
        "body": "La palabra se pronuncia en voz alta en alemán. La escuchas pero no la ves — ¡hay que escribirla correctamente!\n\n1. Escucha con atención 🎵\n2. Pulsa ◄ si quieres oírla otra vez\n3. Escribe la palabra\n4. Pulsa «Comprobar»\n\n¡Es el ejercicio más difícil — pone a prueba tanto el oído como la ortografía!"
      },
      {
        "icon": "🗣️",
        "title": "Pronunciación — habla en alemán",
        "body": "Te muestran la traducción de la palabra en tu idioma — tienes que DECIR la palabra alemana en voz alta.\n\n1. Lee la traducción\n2. Pulsa el botón 🎤 (o empieza a hablar directamente — el botón aparecerá solo)\n3. Pronuncia la palabra alemana en el micrófono\n4. El sistema mostrará lo que ha oído y si coincide\n\n✅ Correcto — seguimos adelante\n😕 Impreciso — inténtalo de nuevo o pulsa «Omitir»\n\n⚠️ Funciona en Chrome en Android/PC. En iPhone, por ahora, solo lectura.\n\n💡 Consejo: pulsa el botón 🔊 para escuchar primero cómo suena la palabra correctamente."
      },
      {
        "icon": "📖",
        "title": "Lector — leemos y traducimos textos",
        "body": "La sección «Lector» tiene tres modos:\n\n▶ Leer — pega un texto, pulsa el botón y escucha. Toca una palabra — verás su traducción del diccionario.\n\n🌐 Bilingüe — la IA traduce el texto párrafo a párrafo. Elige los idiomas (por ejemplo alemán → español). Pulsa «Traducir».\n\n💬 Conversación — ¡como Google Translate! Dos personas hablan por turnos al micrófono — el sistema traduce y lo pronuncia en voz alta. Muy útil en clase o para hablar con un hablante nativo.\n\n⚠️ Los modos con micrófono solo funcionan en Chrome."
      },
      {
        "icon": "💬",
        "title": "Libro de frases — tus frases",
        "body": "En el libro de frases se guardan las frases que has ido guardando desde los ejercicios (botón 📖).\n\nTambién puedes añadir una frase a mano:\n1. Pulsa «+ Añadir frase»\n2. Escribe la frase en alemán\n3. Sal del campo — ¡la IA la traducirá sola!\n4. Corrígela si hace falta y guárdala\n\nMarca la frase con ✅ cuando la hayas aprendido."
      },
      {
        "icon": "🤖",
        "title": "Entrenador IA — diálogos en vivo (ACTUALIZADO)",
        "body": "La sección «Entrenador IA» es una conversación en vivo con un mentor. El primero es 🤓 Pablo (el fundador), además de Лена, Макс, Ганна y Отто.\n\nElige un personaje y un tema (o «Palabras de la lección N») → «Iniciar conversación».\n\nEl personaje responde en alemán, y debajo del mensaje: la traducción, tus errores, 🔊 escuchar.\n\n✨ MODO DE VOZ (como en Gemini): pulsa ✨ junto al campo de texto → aparece una foto grande de Pablo, te saluda y te escucha. Solo tienes que hablar — ¡manos libres! Él responde con voz, reacciona «correcto/incorrecto» (colores de Alemania), y abajo va el registro del chat (alemán + traducción, 🔊 escuchar). Puedes hablar en alemán (reconocimiento preciso) o cambiar a tu idioma.\n\n⚠️ La voz funciona en Chrome (Android/PC)."
      },
      {
        "icon": "📐",
        "title": "Gramática — chuleta (NUEVO)",
        "body": "La sección «Gramática» del menú es un manual de casos, preposiciones y verbos.\n\nAbre cualquier tema → verás una explicación clara y tablas de colores:\n🔵 der (masc.) · 🔴 die (fem.) · 🟢 das (neutro) · ⚫ plural\n\nCada caso tiene su pregunta (¿quién? ¿a quién? ¿a quién le?) y una explicación de cuándo se usa. Míralo y repásalo antes de los ejercicios."
      },
      {
        "icon": "🎬",
        "title": "Pablo en los ejercicios (NUEVO)",
        "body": "Ahora, en los ejercicios, el mentor Pablo reacciona a tu respuesta: su cara cobra vida y dice «Sehr gut!» si aciertas o «Nicht ganz» si te equivocas.\n\nSi prefieres solo texto sin vídeo, puedes desactivarlo en: Configuración → Voz → «Entrenador en los ejercicios»."
      },
      {
        "icon": "👤",
        "title": "Perfil — avatar y datos",
        "body": "Toca el avatar (el círculo con una letra o un emoji) en el menú de la izquierda — se abrirá el perfil.\n\nQué puedes configurar:\n• Avatar — elige entre 12 emojis o deja la inicial de tu nombre\n• Nombre completo, profesión\n• Teléfono, Telegram, WhatsApp\n• Cambio de contraseña\n\nEstos datos los ve el profesor en la sección «Alumnos»."
      },
      {
        "icon": "🔊",
        "title": "Voz y configuración",
        "body": "En el menú (botón ☰ a la izquierda o abajo en el móvil):\n\n🔊 activar/desactivar — pronunciación automática de las palabras\n🎤 Voz — elige una voz alemana (Google Deutsch suena mejor que ninguna)\n🌙/☀️ — tema oscuro o claro\n🌍 Idioma — cambia el idioma de la interfaz\n\nPuedes activar la pronunciación de la traducción — así, después de la palabra en alemán, se pronunciará también en tu idioma."
      },
      {
        "icon": "🔗",
        "title": "Compartir una tarjeta (NUEVO)",
        "body": "¿Te gustó una palabra? ¡Compártela con un amigo!\n\nEn el Diccionario, cada palabra tiene un botón 🔗. Púlsalo — se copiará el enlace a la tarjeta (o se abrirá el menú «Compartir» del móvil: Telegram, WhatsApp…).\n\nTu amigo abrirá el enlace y verá la tarjeta: la palabra, la traducción en SU propio idioma, una imagen, un ejemplo, el botón 🔊 escuchar y «➕ al libro de frases» — para añadirse la palabra."
      },
      {
        "icon": "🔍",
        "title": "Diccionario: filtro por letra y escaneo (NUEVO)",
        "body": "En el Diccionario ahora es fácil encontrar las palabras que necesitas:\n\n🔤 Letra — pulsa una letra del alfabeto y solo quedarán las palabras que empiezan por ella.\n\n📄 Escaneo — si eliges una lección, aparecerán chips «Escaneo 1 / Escaneo 2…» (páginas del libro) — palabras justo de esa página.\n\nSe puede combinar con la búsqueda y el estado (nuevo/aprendiendo/lo sé)."
      },
      {
        "icon": "🗣️",
        "title": "Entrenador IA — más natural (ACTUALIZADO)",
        "body": "El entrenador ahora conversa como un interlocutor real:\n• No traduce cada una de sus frases — intenta entender por el sentido (puedes activar la traducción en la configuración)\n• No saluda ni elogia en cada mensaje — es simplemente una conversación natural\n• El análisis de errores llega al final, en el informe\n\nAsí te acostumbras más rápido a entender el alemán de oído."
      }
    ],
    "install": [
      {
        "icon": "📱",
        "title": "¿Qué es instalar la aplicación?",
        "body": "Nuestro sitio es lo que se llama una PWA (Progressive Web App, «aplicación web progresiva»).\n\nEsto significa que el sitio SE PUEDE instalar como una aplicación normal en el teléfono o el portátil. Después de instalarla:\n✅ Se abre sin navegador, como una aplicación de verdad\n✅ Se abre más rápido\n✅ Ocupa toda la pantalla (sin barra de direcciones)\n✅ Aparece en la lista de aplicaciones del teléfono"
      },
      {
        "icon": "🤖",
        "title": "Instalación en Android (teléfono/tableta)",
        "body": "1. Abre el sitio en Chrome\n2. Espera 10-15 segundos\n3. Abajo en la pantalla aparecerá un aviso: «Añadir Deutsch Lernen a la pantalla de inicio»\n4. Pulsa «Instalar» o «Añadir»\n\nSi no aparece el aviso:\n• Pulsa los tres puntos ⋮ en la esquina superior derecha de Chrome\n• Elige «Añadir a la pantalla de inicio»\n• Pulsa «Instalar»\n\n¡Listo! La aplicación aparecerá en el escritorio."
      },
      {
        "icon": "🍎",
        "title": "Instalación en iPhone/iPad",
        "body": "1. Abre el sitio en el navegador Safari (¡Safari, no Chrome!)\n2. Pulsa el botón «Compartir» en la parte inferior de la pantalla — es el icono de un cuadrado con una flecha hacia arriba ⬆️\n3. Desplaza la lista hacia abajo\n4. Pulsa «Añadir a pantalla de inicio»\n5. Pulsa «Añadir»\n\nLa aplicación aparecerá en la pantalla de inicio, como una aplicación normal.\n\n⚠️ Importante: en iPhone solo funciona a través de Safari. Chrome y otros navegadores todavía no admiten instalar PWA en iOS."
      },
      {
        "icon": "💻",
        "title": "Instalación en el portátil (Windows/Mac)",
        "body": "En el navegador Chrome o Edge:\n\n1. Abre el sitio\n2. En la barra de direcciones, a la derecha, aparecerá un icono ⊕ o un icono de monitor — púlsalo\n3. Pulsa «Instalar»\n\nO desde el menú:\n• Chrome: tres puntos ⋮ → «Guardar y compartir» → «Crear acceso directo» → marca «Abrir como ventana» ✓\n• Edge: tres puntos … → «Aplicaciones» → «Instalar este sitio como aplicación»\n\nDespués de instalarla, la aplicación se abre como una ventana independiente, sin barra de direcciones."
      },
      {
        "icon": "🏪",
        "title": "Google Play (próximamente)",
        "body": "En el futuro, la aplicación aparecerá en Google Play Store — entonces se podrá instalar como una aplicación normal desde la tienda.\n\nLa versión actual siempre está disponible en el sitio deutschlernen.ai — ahí las actualizaciones aparecen al instante, sin esperar la revisión de la tienda.\n\nLa aplicación PWA (instalada desde el navegador) funciona igual de bien que una aplicación de la tienda."
      },
      {
        "icon": "🔄",
        "title": "Actualizaciones",
        "body": "La aplicación se actualiza automáticamente — la próxima vez que la abras, cargará sola la nueva versión.\n\nNo hace falta hacer nada — todas las mejoras aparecerán solas."
      }
    ]
  },
  fr: {
    "title": "Aide",
    "tabs": [
      "👨‍🏫 Enseignant",
      "👨‍🎓 Élève",
      "📲 Installation"
    ],
    "teacher": [
      {
        "icon": "🎯",
        "title": "Comment fonctionne l'apprentissage",
        "body": "Le système utilise la répétition espacée (algorithme SM-2).\n\nL'enseignant charge des photos des pages du manuel → l'IA les lit et crée des cartes → l'élève révise les mots aux moments optimaux.\n\nPlus l'élève mémorise bien un mot, moins souvent il réapparaît. Un mot oublié revient immédiatement."
      },
      {
        "icon": "1️⃣",
        "title": "Inscription",
        "body": "Inscrivez-vous avec le rôle « Enseignant / Parent ». Cela donne un accès complet : création de leçons, suivi des élèves, gestion des cours, lancement des opérations admin."
      },
      {
        "icon": "2️⃣",
        "title": "Créez un cours",
        "body": "Allez dans « Cours » → « + Cours ». Saisissez un nom (par exemple « 6e année 2024/2025 »). Un cours est un dossier pour les leçons. Un élève peut être rattaché à un cours précis."
      },
      {
        "icon": "3️⃣",
        "title": "Chargez une leçon",
        "body": "1. Dans le cours, cliquez sur « + Ajouter une leçon »\n2. Photographiez les pages du manuel et/ou du cahier (plusieurs photos à la fois possible)\n3. Ajoutez si vous le souhaitez un enregistrement audio de la leçon\n4. Cliquez sur « Traiter la leçon »\n\nVous pouvez aussi créer une leçon via le menu « + Leçon » à gauche."
      },
      {
        "icon": "⏳",
        "title": "Traitement des photos",
        "body": "L'IA lit chaque photo et en extrait les mots, la grammaire, des exemples de phrases.\n\n• ~10 secondes par photo\n• 24 photos ≈ 5 à 8 minutes\n• Progression : « Photo 3 sur 24… » → « Création des exercices… » → « Terminé ! »\n\nVous pouvez fermer la page — le traitement se poursuit sur le serveur. Le statut est visible dans la section « Leçons »."
      },
      {
        "icon": "4️⃣",
        "title": "Ce qui est créé automatiquement",
        "body": "Pour chaque mot de la leçon, l'IA crée 7 types d'exercices :\n\n🃏 Carte flash — retourner et s'auto-évaluer\n✏️ Complète le mot manquant — écrire le mot dans une phrase\n☑️ Choix multiple — 4 options\n✍️ Écris une phrase — l'IA la corrige\n🔤 Ajoute une lettre — deviner la lettre manquante\n🎙️ Dictée — le mot est prononcé à voix haute, il faut l'écrire\n🗣️ Prononciation — dis le mot à voix haute, le système vérifie si c'est correct"
      },
      {
        "icon": "5️⃣",
        "title": "Élèves",
        "body": "Les élèves s'inscrivent eux-mêmes avec le rôle « Élève ». Leur progression est visible dans la section « Élèves » :\n• Combien de mots ont été appris\n• Combien de tentatives aujourd'hui\n• Quelles leçons ils suivent\n\nVous pouvez rattacher un élève à un cours précis."
      },
      {
        "icon": "📖",
        "title": "Lecteur",
        "body": "La section « Lecteur » propose trois modes de travail avec les textes :\n\n▶ Lire — texte cliquable avec synthèse vocale (vitesse 0,7×–1,2×). Cliquez sur un mot pour voir sa traduction dans le dictionnaire.\n\n🌐 Bilingue — l'IA traduit les paragraphes. Choisissez n'importe quelle paire de langues parmi 8 (de→ru, ru→en, etc.). Modèles : ⚡ Rapide (GPT-4o-mini) ou ✨ Précis (GPT-4o).\n\n💬 Conversation — mode façon Google Translate. Deux participants parlent chacun leur tour au micro — le système traduit et prononce la réponse. Fonctionne uniquement dans Chrome."
      },
      {
        "icon": "🤖",
        "title": "Coach IA",
        "body": "La section « Coach IA » propose des entraînements de conversation en direct avec un mentor IA.\n\n1. Choisis un personnage :\n🧑‍🏫 Лена — professeure à Berlin\n☕ Макс — barista dans un café\n🛒 Ганна — vendeuse dans un magasin\n🏨 Отто — réceptionniste d'hôtel\n\n2. Choisis un thème : Faire connaissance, Café, Achats, Hôtel, S'orienter ou Conversation libre\n\n3. Clique sur « Démarrer la conversation » — et discute !\n\nLe personnage répond en allemand. Sous la réponse :\n• Traduction en russe/ukrainien\n• Correction de tes erreurs (s'il y en a)\n• Bouton 🔊 pour écouter\n\nTu écris en russe ou en ukrainien — l'IA comprend et poursuit le dialogue."
      },
      {
        "icon": "💬",
        "title": "Guide de conversation",
        "body": "Les élèves peuvent enregistrer des phrases depuis les exercices avec le bouton 📖. Ou les ajouter manuellement — en saisissant une phrase allemande, l'IA la traduit automatiquement.\n\nLes phrases peuvent être modifiées, marquées comme apprises, filtrées par catégories."
      },
      {
        "icon": "🌍",
        "title": "Traductions",
        "body": "La section « Traductions » affiche tout ce qui est traduit sur le site :\n• Les mots du dictionnaire (901 mots, 10 langues)\n• Les titres des leçons\n• Les phrases du guide de conversation\n• Les textes de l'interface\n\nUne recherche globale permet de chercher instantanément dans tous les groupes."
      },
      {
        "icon": "⚙️",
        "title": "Opérations admin",
        "body": "Dans le panneau latéral (ordinateur) ou le menu se trouvent des boutons admin pour les opérations en masse :\n\n• 🖼 Images — photos pour les mots depuis Unsplash\n• ⭐ Dictionnaire++ — exemples de phrases générés par l'IA\n• 🌐 Mots → 10 langues — traduction du dictionnaire\n• 📝 Exercices → langues — traduction des réponses proposées\n• 🔤 Titres → langues — traduction des titres de leçons\n• 🔊 Prononciation — ajouter des exercices vocaux à toutes les leçons\n• 🔄 Tout recréer — mettre à jour tous les exercices (réinitialise la progression !)\n\nLes opérations s'exécutent en arrière-plan avec une progression « fait/total ». L'état est visible directement dans le menu."
      },
      {
        "icon": "🚀",
        "title": "« Tout traiter » — un seul bouton (NOUVEAU)",
        "body": "Désormais, lors du chargement d'une leçon, le traitement fait TOUT lui-même, pas besoin d'appuyer sur des boutons :\n\n1. Lit le texte des photos\n2. Extrait les mots (📘 manuel + ✏️ cahier séparément)\n3. Crée 7 types d'exercices (allemand simple, compréhensible même pour des enfants)\n4. Invente un titre et une description pour la leçon\n5. Sélectionne des images pour les mots\n6. Traduit les mots et les exercices dans les 10 langues\n\nTitre automatique : si aucun thème n'a été défini — « Leçon N : <thème IA> ».\n\nPour une leçon déjà créée — le bouton « ✨ Tout traiter » : complète ce qui manque (images, traductions) SANS réinitialiser la progression des élèves."
      },
      {
        "icon": "✏️",
        "title": "Exercices personnalisés à partir du dictionnaire (NOUVEAU)",
        "body": "Compose un ensemble d'exercices à partir des mots de ton choix :\n\n1. Ouvre le « Dictionnaire »\n2. Filtre les mots — par exemple « en cours d'apprentissage », ou par leçon/nature grammaticale/recherche\n3. Clique sur « ✏️ Ensemble » (en haut)\n4. Saisis un nom → le système composera un ensemble d'exercices à partir de ces mots et l'ouvrira\n\nPratique pour préparer une dictée de façon ciblée ou pour consolider des mots difficiles. L'ensemble est une « leçon » à part, les mots ne sont pas dupliqués."
      },
      {
        "icon": "📐",
        "title": "Grammaire — aide-mémoire (NOUVEAU)",
        "body": "La section « Grammaire » dans le menu — un aide-mémoire sur les cas, les prépositions, les verbes, le Konjunktiv.\n\nTu as photographié une affiche de grammaire — l'IA en a extrait les règles dans des tableaux clairs :\n• Couleurs des genres comme à l'école : 🔵 der · 🔴 die · 🟢 das · ⚫ pluriel\n• Question du cas (wer/wen/wem) et une explication claire pour chacun\n• Photo originale — accessible via le bouton « afficher l'original »\n\nC'est séparé des leçons de vocabulaire — on ne mélange pas la grammaire avec les mots."
      },
      {
        "icon": "🎥",
        "title": "Avatar vidéo du coach (payant, D-ID)",
        "body": "Dans le Coach IA, le mentor Pablo peut vraiment prendre vie (mouvement des lèvres) grâce au service D-ID — c'est une option PAYANTE.\n\n🟢 Le mode vocal ✨ et les clips vidéo prêts à l'emploi (accueil, « correct/incorrect ») fonctionnent GRATUITEMENT et sans limite.\n\nLe bouton 🎥 « animer » apparaît uniquement lorsqu'il reste des crédits sur le solde D-ID. Plus de détails dans les Paramètres."
      },
      {
        "icon": "📊",
        "title": "Analyse de la classe (NOUVEAU)",
        "body": "La section « 📊 Analyse de la classe » — un bouton sur la page « Élèves » (ou un bloc sur la page d'accueil).\n\nCe que tu peux voir sur tes leçons :\n• Récapitulatif : nombre d'élèves, qui est actif sur 7 jours, total des réponses, précision globale\n• Pour chaque élève : nombre de réponses (et sur la semaine), précision en %, nombre de mots connus/en cours d'apprentissage, dernière connexion\n• 🔥 Mots difficiles — là où il y a le plus d'erreurs (à retravailler)\n• Points de blocage — précision par type d'exercice (dictée, prononciation, choix multiple…)\n\nCouleur de précision : rouge <60 %, jaune <80 %, vert au-dessus. Les données s'accumulent automatiquement au fur et à mesure que les élèves font les exercices."
      },
      {
        "icon": "🔍",
        "title": "Filtres du Dictionnaire : scan, lettres (NOUVEAU)",
        "body": "Dans le Dictionnaire, il est maintenant possible de trier rapidement les mots :\n\n📄 Par SCAN — choisis une leçon, et des étiquettes « Scan 1 / Scan 2… » apparaîtront (pages du manuel). Affiche uniquement les mots de cette page. Fonctionne pour les leçons chargées avec plusieurs photos.\n\n🔤 Par LETTRE — étiquettes alphabétiques : seulement les mots commençant par la lettre choisie.\n\nLes filtres se combinent avec le cours/la leçon/le statut et la recherche."
      },
      {
        "icon": "🗣️",
        "title": "Le Coach IA est devenu plus naturel (MIS À JOUR)",
        "body": "Le coach mène désormais une vraie conversation, et non plus un « cours » :\n• Par défaut, il NE traduit PAS ses répliques en russe — l'élève comprend grâce au contexte (la traduction peut être activée séparément)\n• Il ne dit pas bonjour à chaque message et ne félicite/gronde pas de façon rituelle\n• L'analyse des erreurs et l'évaluation globale figurent dans le rapport final, pas après chaque phrase\n\nC'est plus proche d'une vraie conversation avec un locuteur natif."
      }
    ],
    "student": [
      {
        "icon": "🎯",
        "title": "Comment fonctionne l'apprentissage — en clair",
        "body": "Imagine que le programme est un coach intelligent. Il se souvient des mots que tu connais déjà bien et de ceux que tu ne connais pas encore.\n\n📅 Tu connais bien le mot → tu le reverras dans une semaine\n😐 Tu le connais presque → dans 2-3 jours\n❌ Tu l'as oublié → il revient tout de suite aujourd'hui\n\n🔑 Règle principale : connecte-toi CHAQUE JOUR et fais les exercices. Même 10 minutes par jour donnent un excellent résultat !"
      },
      {
        "icon": "1️⃣",
        "title": "Inscription",
        "body": "Inscris-toi avec le rôle « Élève ». Demande à ton enseignant l'adresse du site.\n\nAprès la connexion, tu arriveras directement sur la page principale « Aujourd'hui »."
      },
      {
        "icon": "2️⃣",
        "title": "📅 Page « Aujourd'hui »",
        "body": "Ici s'affichent les exercices à faire aujourd'hui.\n\nTu vois des chiffres ? Ce sont les nombres d'exercices par type :\n🃏 Cartes flash\n✏️ Mots à compléter\n☑️ Choix multiple\n✍️ Écrire une phrase\n🔤 Ajouter une lettre\n🎙️ Dictée\n\nClique sur « Commencer la révision » — et c'est parti !"
      },
      {
        "icon": "🃏",
        "title": "Carte flash",
        "body": "On te montre un mot allemand. Rappelle-toi sa traduction, puis clique sur la carte — tu verras la réponse.\n\nÉvalue-toi honnêtement :\n❌ Je ne m'en souviens pas — le mot reviendra aujourd'hui\n😐 Avec difficulté — dans 1 jour\n🙂 Normal — dans 3 jours\n✅ Je m'en souviens facilement — dans 1 semaine ou plus"
      },
      {
        "icon": "✏️",
        "title": "Complète le mot manquant",
        "body": "Dans la phrase allemande, il y a un blanc ___. Tape le bon mot et clique sur « Vérifier ».\n\n💡 Astuce : le contexte de la phrase t'aidera à te souvenir du mot. La casse n'a pas d'importance — « Haus » et « haus » sont acceptés de la même façon."
      },
      {
        "icon": "☑️",
        "title": "Choix multiple",
        "body": "Tu vois une question et 4 options ? Clique sur la bonne réponse.\n\n🟢 Vert — correct, on passe à la suite\n🔴 Rouge — erreur, regarde la bonne réponse\n\nAprès ta réponse, l'exercice suivant s'ouvrira automatiquement au bout d'une seconde."
      },
      {
        "icon": "✍️",
        "title": "Écris une phrase",
        "body": "On te donne un mot allemand et un indice. Écris N'IMPORTE QUELLE phrase simple en allemand avec ce mot.\n\nExemple : le mot « Hund » → « Ich habe einen Hund. » ✓\n\nL'IA vérifiera :\n• Si le mot est utilisé correctement\n• S'il n'y a pas de grosses fautes\nEt attribuera une note de ★ à ★★★★★"
      },
      {
        "icon": "🔤",
        "title": "Ajoute une lettre",
        "body": "On te montre un mot allemand avec une lettre manquante (ou plusieurs). Il faut deviner quelle lettre manque.\n\nExemple : « _aus » → « H » → « Haus » ✓\n\nCela aide à mémoriser l'orthographe des mots allemands avec les umlauts (ä, ö, ü)."
      },
      {
        "icon": "🎙️",
        "title": "Dictée",
        "body": "Le mot est prononcé à voix haute en allemand. Tu l'entends, mais tu ne le vois pas — il faut l'écrire correctement !\n\n1. Écoute attentivement 🎵\n2. Clique sur ◄ si tu veux réécouter\n3. Tape le mot\n4. Clique sur « Vérifier »\n\nC'est l'exercice le plus difficile — il teste à la fois l'oreille et l'orthographe !"
      },
      {
        "icon": "🗣️",
        "title": "Prononciation — parle en allemand",
        "body": "On te montre la traduction du mot en russe — tu dois DIRE le mot allemand à voix haute.\n\n1. Lis la traduction en russe\n2. Clique sur le bouton 🎤 (ou parle directement — le bouton apparaîtra tout seul)\n3. Prononce le mot allemand dans le micro\n4. Le système affichera ce qu'il a entendu et la correspondance\n\n✅ Correct — on continue\n😕 Imprécis — réessaie ou clique sur « Passer »\n\n⚠️ Fonctionne dans Chrome sur Android/PC. Sur iPhone, pour l'instant seule la lecture est disponible.\n\n💡 Conseil : clique sur le bouton 🔊 pour écouter d'abord comment le mot se prononce correctement."
      },
      {
        "icon": "📖",
        "title": "Lecteur — lire et traduire des textes",
        "body": "La section « Lecteur » propose trois modes :\n\n▶ Lire — colle un texte, clique sur le bouton et écoute. Clique sur un mot pour voir sa traduction dans le dictionnaire.\n\n🌐 Bilingue — l'IA traduit le texte paragraphe par paragraphe. Choisis les langues (par exemple allemand → russe). Clique sur « Traduire ».\n\n💬 Conversation — comme Google Translate ! Deux personnes parlent chacune leur tour au micro — le système traduit et prononce la réponse à voix haute. Pratique en cours ou pour discuter avec un locuteur natif.\n\n⚠️ Les modes avec micro fonctionnent uniquement dans Chrome."
      },
      {
        "icon": "💬",
        "title": "Guide de conversation — tes phrases",
        "body": "Le guide de conversation regroupe les phrases que tu as enregistrées depuis les exercices (bouton 📖).\n\nTu peux aussi ajouter une phrase manuellement :\n1. Clique sur « + Ajouter une phrase »\n2. Tape la phrase en allemand\n3. Sors du champ — l'IA la traduira automatiquement !\n4. Corrige si besoin et enregistre\n\nMarque la phrase ✅ quand tu l'auras apprise."
      },
      {
        "icon": "🤖",
        "title": "Coach IA — dialogues en direct (MIS À JOUR)",
        "body": "La section « Coach IA » — une conversation en direct avec un mentor. Le premier est 🤓 Pablo (le fondateur), ainsi que Лена, Макс, Ганна, Отто.\n\nChoisis un personnage et un thème (ou « Mots de la leçon N ») → « Démarrer la conversation ».\n\nLe personnage répond en allemand, sous le message : traduction, tes erreurs, 🔊 écouter.\n\n✨ MODE VOCAL (comme dans Gemini) : clique sur ✨ à côté du champ de saisie → une grande photo de Pablo apparaît, il te salue et t'écoute. Parle simplement — les mains libres ! Il répond à voix haute, réagit par « correct/incorrect » (couleurs de l'Allemagne), et en bas défile le journal de chat (allemand + traduction, 🔊 écouter). Tu peux parler en allemand (reconnaissance précise) ou basculer vers ta propre langue.\n\n⚠️ La voix fonctionne dans Chrome (Android/PC)."
      },
      {
        "icon": "📐",
        "title": "Grammaire — antisèche (NOUVEAU)",
        "body": "La section « Grammaire » dans le menu — un guide sur les cas, les prépositions, les verbes.\n\nOuvre n'importe quel thème → tu verras une explication claire et des tableaux colorés :\n🔵 der (masc.) · 🔴 die (fém.) · 🟢 das (neutre) · ⚫ pluriel\n\nPour chaque cas : une question (qui ? qui/quoi ? à qui ?) et une explication de quand l'utiliser. Regarde et révise avant les exercices."
      },
      {
        "icon": "🎬",
        "title": "Pablo dans les exercices (NOUVEAU)",
        "body": "Désormais, dans les exercices, le mentor Pablo réagit à ta réponse : son visage s'anime et dit « Sehr gut! » si c'est correct, ou « Nicht ganz » en cas d'erreur.\n\nSi tu préfères juste le texte sans vidéo, tu peux désactiver cette option : Paramètres → Voix → « Coach dans les exercices »."
      },
      {
        "icon": "👤",
        "title": "Profil — avatar et informations",
        "body": "Clique sur l'avatar (le cercle avec une lettre ou un emoji) dans le menu de gauche — ton profil s'ouvrira.\n\nCe que tu peux configurer :\n• Avatar — choisis parmi 12 emojis ou garde la lettre de ton prénom\n• Nom complet, profession\n• Téléphone, Telegram, WhatsApp\n• Changement de mot de passe\n\nCes informations sont visibles par l'enseignant dans la section « Élèves »."
      },
      {
        "icon": "🔊",
        "title": "Voix et paramètres",
        "body": "Dans le menu (bouton ☰ à gauche ou en bas sur téléphone) :\n\n🔊 on/off — activer la prononciation automatique des mots\n🎤 Voix — choisir une voix allemande (Google Deutsch sonne le mieux)\n🌙/☀️ — thème sombre ou clair\n🌍 Langue — changer la langue de l'interface\n\nTu peux activer la prononciation de la traduction — le mot allemand sera alors suivi de sa version russe."
      },
      {
        "icon": "🔗",
        "title": "Partager une carte (NOUVEAU)",
        "body": "Un mot te plaît — partage-le avec un ami !\n\nDans le Dictionnaire, chaque mot a un bouton 🔗. Clique dessus — le lien vers la carte sera copié (ou le menu « Partager » s'ouvrira sur téléphone : Telegram, WhatsApp…).\n\nTon ami ouvrira le lien et verra la carte : le mot, sa traduction dans SA propre langue, une image, un exemple, un bouton 🔊 pour écouter et « ➕ au guide de conversation » pour ajouter le mot chez lui."
      },
      {
        "icon": "🔍",
        "title": "Dictionnaire : filtre par lettre et par scan (NOUVEAU)",
        "body": "Dans le Dictionnaire, il est maintenant facile de trouver les mots dont tu as besoin :\n\n🔤 Lettre — clique sur une lettre de l'alphabet, seuls les mots commençant par celle-ci resteront.\n\n📄 Scan — si tu choisis une leçon, des étiquettes « Scan 1 / Scan 2… » apparaîtront (pages du manuel) — les mots de cette page précise.\n\nTu peux combiner avec la recherche et le statut (nouveau/en cours/connu)."
      },
      {
        "icon": "🗣️",
        "title": "Le Coach IA — plus vivant (MIS À JOUR)",
        "body": "Le coach communique maintenant comme un vrai interlocuteur :\n• Il ne traduit pas chaque phrase — essaie de comprendre par le sens (la traduction peut être activée dans les paramètres)\n• Il ne dit pas bonjour et ne félicite pas à chaque message — juste une conversation naturelle\n• L'analyse des erreurs arrive à la fin, dans le rapport\n\nAinsi, tu t'habitues plus vite à comprendre l'allemand à l'oreille."
      }
    ],
    "install": [
      {
        "icon": "📱",
        "title": "Qu'est-ce que l'installation de l'application ?",
        "body": "Notre site est ce qu'on appelle une PWA (Progressive Web App, « application web progressive »).\n\nCela signifie que le site PEUT être installé comme une application classique sur ton téléphone ou ton ordinateur portable. Après l'installation :\n✅ Se lance sans navigateur, comme une vraie application\n✅ S'ouvre plus rapidement\n✅ Fonctionne en plein écran (sans barre d'adresse)\n✅ Apparaît dans la liste des applications sur le téléphone"
      },
      {
        "icon": "🤖",
        "title": "Installation sur Android (téléphone/tablette)",
        "body": "1. Ouvre le site dans Chrome\n2. Attends 10 à 15 secondes\n3. Une bannière apparaîtra en bas de l'écran : « Ajouter Deutsch Lernen à l'écran d'accueil »\n4. Clique sur « Installer » ou « Ajouter »\n\nSi la bannière n'apparaît pas :\n• Clique sur les trois points ⋮ en haut à droite de Chrome\n• Choisis « Ajouter à l'écran d'accueil »\n• Clique sur « Installer »\n\nTerminé ! L'application apparaîtra sur ton écran d'accueil."
      },
      {
        "icon": "🍎",
        "title": "Installation sur iPhone/iPad",
        "body": "1. Ouvre le site dans le navigateur Safari (bien Safari, pas Chrome !)\n2. Clique sur le bouton « Partager » en bas de l'écran — l'icône du carré avec une flèche vers le haut ⬆️\n3. Fais défiler la liste vers le bas\n4. Clique sur « Sur l'écran d'accueil »\n5. Clique sur « Ajouter »\n\nL'application apparaîtra sur l'écran d'accueil, comme une application classique.\n\n⚠️ Important : sur iPhone, cela ne fonctionne que via Safari. Chrome et les autres navigateurs ne prennent pas encore en charge l'installation des PWA sur iOS."
      },
      {
        "icon": "💻",
        "title": "Installation sur ordinateur (Windows/Mac)",
        "body": "Dans le navigateur Chrome ou Edge :\n\n1. Ouvre le site\n2. Une icône ⊕ ou une icône d'écran apparaîtra à droite dans la barre d'adresse — clique dessus\n3. Clique sur « Installer »\n\nOu via le menu :\n• Chrome : trois points ⋮ → « Enregistrer et partager » → « Créer un raccourci » → « Ouvrir comme fenêtre » ✓\n• Edge : trois points … → « Applications » → « Installer ce site en tant qu'application »\n\nUne fois installée, l'application se lance dans une fenêtre séparée, sans barre d'adresse."
      },
      {
        "icon": "🏪",
        "title": "Google Play (bientôt)",
        "body": "À l'avenir, l'application sera disponible sur le Google Play Store — il sera alors possible de l'installer comme une application classique via la boutique.\n\nLa version actuelle est toujours accessible sur le site deutschlernen.ai — les mises à jour y apparaissent instantanément, sans attendre la validation de la boutique.\n\nL'application PWA (installation via le navigateur) fonctionne tout aussi bien qu'une application venant de la boutique."
      },
      {
        "icon": "🔄",
        "title": "Mises à jour",
        "body": "L'application se met à jour automatiquement — à la prochaine ouverture, elle téléchargera elle-même la nouvelle version.\n\nTu n'as rien à faire — toutes les améliorations apparaîtront d'elles-mêmes."
      }
    ]
  },
  sq: {
    "title": "Ndihmë",
    "tabs": [
      "👨‍🏫 Për mësuesin",
      "👨‍🎓 Për nxënësin",
      "📲 Instalimi"
    ],
    "teacher": [
      {
        "icon": "🎯",
        "title": "Si funksionon mësimi",
        "body": "Sistemi përdor përsëritjen me intervale (algoritmi SM-2).\n\nMësuesi ngarkon foto të faqeve të tekstit shkollor → IA i lexon dhe krijon karta → nxënësi përsërit fjalët në momentet optimale.\n\nSa më mirë nxënësi e mban mend fjalën, aq më rrallë ajo shfaqet. Fjala e harruar kthehet menjëherë."
      },
      {
        "icon": "1️⃣",
        "title": "Regjistrimi",
        "body": "Regjistrohu me rolin «Mësues / Prind». Kjo jep akses të plotë: krijim mësimesh, shikim i nxënësve, menaxhim kursesh, nisje operacionesh admin."
      },
      {
        "icon": "2️⃣",
        "title": "Krijo një kurs",
        "body": "Shko te «Kurset» → «+ Kurs». Fut emrin (p.sh. «Klasa 6, 2024/2025»). Kursi është një dosje për mësimet. Nxënësi mund të lidhet me një kurs të caktuar."
      },
      {
        "icon": "3️⃣",
        "title": "Ngarko një mësim",
        "body": "1. Brenda kursit shtyp «+ Shto mësim»\n2. Fotografo faqet e tekstit shkollor dhe/ose fletores (mund të ngarkosh disa foto njëherësh)\n3. Nëse dëshiron, shto një regjistrim audio të mësimit\n4. Shtyp «Përpuno mësimin»\n\nMund të krijosh mësimin edhe nga menyja «+ Mësim» në të majtë."
      },
      {
        "icon": "⏳",
        "title": "Përpunimi i fotove",
        "body": "IA lexon çdo foto dhe nxjerr fjalët, gramatikën, shembuj fjalish.\n\n• ~10 sekonda për foto\n• 24 foto ≈ 5-8 minuta\n• Progresi: «Foto 3 nga 24…» → «Duke krijuar ushtrimet…» → «Gati!»\n\nMund ta mbyllësh faqen — përpunimi vazhdon në server. Statusi shihet te seksioni «Mësimet»."
      },
      {
        "icon": "4️⃣",
        "title": "Çfarë krijohet automatikisht",
        "body": "Nga çdo fjalë e mësimit IA krijon 7 lloje ushtrimesh:\n\n🃏 Kartë-blic — ktheje dhe vetëvlerësohu\n✏️ Plotëso boshllëkun — shkruaj fjalën në fjali\n☑️ Zgjedhje përgjigjeje — 4 variante\n✍️ Shkruaj një fjali — IA e kontrollon\n🔤 Shto shkronjën — gjej shkronjën që mungon\n🎙️ Diktim — fjala thuhet me zë, duhet ta shkruash\n🗣️ Shqiptim — thuaje fjalën me zë, sistemi kontrollon saktësinë"
      },
      {
        "icon": "5️⃣",
        "title": "Nxënësit",
        "body": "Nxënësit regjistrohen vetë me rolin «Nxënës». Progresi i tyre shihet te seksioni «Nxënësit»:\n• Sa fjalë janë mësuar\n• Sa përpjekje sot\n• Cilat mësime po ndjekin\n\nNxënësi mund të lidhet me një kurs të caktuar."
      },
      {
        "icon": "📖",
        "title": "Lexuesi",
        "body": "Seksioni «Lexuesi» — tre mënyra pune me tekste:\n\n▶ Lexo — tekst i klikueshëm me TTS (shpejtësi 0.7×–1.2×). Shtyp mbi fjalën — përkthimi nga fjalori.\n\n🌐 Dygjuhësh — IA përkthen paragrafët. Zgjidh çdo çift gjuhësh nga 8 gjuhë (de→ru, ru→en etj.). Modelet: ⚡ Shpejt (GPT-4o-mini) ose ✨ Saktë (GPT-4o).\n\n💬 Bisedë — regjim si te Google Translate. Dy pjesëmarrës flasin me radhë në mikrofon — sistemi përkthen dhe shqipton përgjigjen. Punon vetëm në Chrome."
      },
      {
        "icon": "🤖",
        "title": "Trajneri IA",
        "body": "Seksioni «Trajneri IA» — stërvitje bisedore të gjalla me një mentor IA.\n\n1. Zgjidh personazhin:\n🧑‍🏫 Лена — mësuese nga Berlini\n☕ Макс — barista në kafene\n🛒 Ганна — shitëse në dyqan\n🏨 Отто — recepsionist në hotel\n\n2. Zgjidh temën: Njohja, Kafeneja, Blerjet, Hoteli, Orientimi ose Bisedë e lirë\n\n3. Shtyp «Fillo bisedën» — dhe bisedo!\n\nPersonazhi përgjigjet në gjermanisht. Nën përgjigje:\n• Përkthimi në ukrainisht/rusisht\n• Korrigjimi i gabimeve të tua (nëse ka)\n• Butoni 🔊 për ta dëgjuar\n\nShkruan në rusisht ose ukrainisht — IA e kupton dhe vazhdon dialogun."
      },
      {
        "icon": "💬",
        "title": "Fjalori i bisedës",
        "body": "Nxënësit mund të ruajnë fraza nga ushtrimet me butonin 📖. Ose t'i shtojnë manualisht — kur shkruhet një frazë gjermane, IA e përkthen automatikisht.\n\nFrazat mund të redaktohen, të shënohen si të mësuara, të filtrohen sipas kategorive."
      },
      {
        "icon": "🌍",
        "title": "Përkthimet",
        "body": "Seksioni «Përkthimet» tregon gjithçka që është përkthyer në sajt:\n• Fjalët e fjalorit (901 fjalë, 10 gjuhë)\n• Titujt e mësimeve\n• Frazat e fjalorit të bisedës\n• Tekstet e ndërfaqes\n\nKa kërkim global — kërkon menjëherë në të gjitha grupet."
      },
      {
        "icon": "⚙️",
        "title": "Operacionet admin",
        "body": "Në panelin anësor (desktop) ose në meny ka butona admin për operacione masive:\n\n• 🖼 Imazhe — foto për fjalët nga Unsplash\n• ⭐ Fjalori++ — shembuj fjalish me anë të IA\n• 🌐 Fjalët → 10 gjuhë — përkthimi i fjalorit\n• 📝 Ushtrimet → gjuhë — përkthimi i variantëve të përgjigjeve\n• 🔤 Titujt → gjuhë — përkthimi i titujve të mësimeve\n• 🔊 Shqiptimi — shto ushtrime zanore në të gjitha mësimet\n• 🔄 Rikrijo gjithçka — përditëso të gjitha ushtrimet (do të fshijë progresin!)\n\nOperacionet punojnë në sfond me progres «bërë/gjithsej». Statusi shihet direkt në meny."
      },
      {
        "icon": "🚀",
        "title": "«Përpuno gjithçka» — një buton (E RE)",
        "body": "Tani, kur ngarkohet mësimi, përpunimi bën GJITHÇKA vetë, nuk duhet të shtypësh butona:\n\n1. Lexon tekstin nga foto\n2. Nxjerr fjalët (📘 tekst shkollor + ✏️ fletore veç e veç)\n3. Krijon 7 lloje ushtrimesh (gjermanisht e pastër, e kuptueshme edhe për fëmijë)\n4. Krijon titullin dhe përshkrimin e mësimit\n5. Zgjedh imazhe për fjalët\n6. Përkthen fjalët dhe ushtrimet në të gjitha 10 gjuhët\n\nTitulli automatik: nëse nuk ke vendosur temën — «Mësimi N: <tema nga IA>».\n\nPër një mësim tashmë ekzistues — butoni «✨ Përpuno gjithçka»: plotëson atë që mungon (imazhe, përkthime) PA fshirë progresin e nxënësve."
      },
      {
        "icon": "✏️",
        "title": "Ushtrime të tua nga fjalori (E RE)",
        "body": "Krijo një grup ushtrimesh nga fjalët që të nevojiten:\n\n1. Hap «Fjalorin»\n2. Filtro fjalët — p.sh. «duke u mësuar», ose sipas mësimit/pjesës së ligjëratës/kërkimit\n3. Shtyp «✏️ Grup» (lart)\n4. Fut emrin → sistemi do të krijojë një grup ushtrimesh nga këto fjalë dhe do ta hapë\n\nE dobishme për përgatitje të synuar për diktim ose përforcim të fjalëve të vështira. Grupi është një «mësim» më vete, fjalët nuk dyfishohen."
      },
      {
        "icon": "📐",
        "title": "Gramatika — udhëzues (E RE)",
        "body": "Seksioni «Gramatika» në meny — fletë ndihmëse për rasat, parafjalët, foljet, Konjunktiv.\n\nFotografove një poster gramatikor — IA nxori prej tij rregullat në tabela të rregullta:\n• Ngjyrat e gjinive si në shkollë: 🔵 der · 🔴 die · 🟢 das · ⚫ shumës\n• Pyetja e rasës (wer/wen/wem) dhe shpjegim i qartë për secilën\n• Foto origjinale — me butonin «shfaq origjinalin»\n\nKjo është veçmas nga mësimet e fjalorit — gramatikën nuk e përziejmë me fjalët."
      },
      {
        "icon": "🎥",
        "title": "Avatar-video i trajnerit (me pagesë, D-ID)",
        "body": "Në Trajnerin IA, mentori Pablo mund të \"gjallërohet\" vërtet (lëvizje buzësh) përmes shërbimit D-ID — kjo është një opsion ME PAGESË.\n\n🟢 Regjimi zanor ✨ dhe klipet video të gatshme (përshëndetja, «saktë/gabim») punojnë FALAS dhe pa kufizim.\n\nButoni 🎥 «gjallëro» shfaqet vetëm kur bilanci i D-ID ka kredite. Më shumë detaje — te Cilësimet."
      },
      {
        "icon": "📊",
        "title": "Analitika e klasës (E RE)",
        "body": "Seksioni «📊 Analitika e klasës» — buton në faqen «Nxënësit» (ose bllok në faqen kryesore).\n\nÇfarë shihet për mësimet e tua:\n• Përmbledhje: sa nxënës, kush është aktiv brenda 7 ditëve, gjithsej përgjigje, saktësia e përgjithshme\n• Për çdo nxënës: sa përgjigje (dhe për javën), saktësia %, sa fjalë di/po mëson, kur ishte aktiv/e herën e fundit\n• 🔥 Fjalë të vështira — ku ka më shumë gabime (çfarë ia vlen të riprovohet)\n• Ku ngecin — saktësia sipas llojeve të ushtrimeve (diktim, shqiptim, zgjedhje…)\n\nNgjyra e saktësisë: kuqe <60%, e verdhë <80%, jeshile mbi këtë. Të dhënat mblidhen vetë, ndërsa nxënësit zgjidhin ushtrimet."
      },
      {
        "icon": "🔍",
        "title": "Filtrat e Fjalorit: skanim, shkronja (E RE)",
        "body": "Në Fjalor tani mund të zgjedhësh shpejt fjalët:\n\n📄 Sipas SKANIMIT — zgjidh mësimin dhe do të shfaqen etiketa «Skanimi 1 / Skanimi 2…» (faqet e tekstit shkollor). Tregon fjalët pikërisht nga ajo faqe. Funksionon për mësimet e ngarkuara me disa foto.\n\n🔤 Sipas SHKRONJËS — etiketa të alfabetit: vetëm fjalët që fillojnë me shkronjën e zgjedhur.\n\nFiltrat kombinohen me kursin/mësimin/statusin dhe kërkimin."
      },
      {
        "icon": "🗣️",
        "title": "Trajneri IA u bë më natyral (PËRDITËSUAR)",
        "body": "Trajneri tani zhvillon një dialog të gjallë, jo një «mësim»:\n• Si parazgjedhje NUK i përkthen replikat e veta në rusisht — nxënësi kupton nga konteksti (përkthimi mund të aktivizohet veç e veç)\n• Nuk përshëndet në çdo mesazh dhe nuk lavdëron/qorton ritualisht\n• Analiza e gabimeve dhe vlerësimi i përgjithshëm — në raportin final, jo pas çdo fraze\n\nKjo i afrohet më shumë një bisede reale me një folës amtar."
      }
    ],
    "student": [
      {
        "icon": "🎯",
        "title": "Si funksionon mësimi — thjesht",
        "body": "Imagjino që programi është një trajner i mençur. Ai mban mend cilat fjalë i di tashmë mirë dhe cilat jo akoma.\n\n📅 E di mirë fjalën → do ta shohësh pas një jave\n😐 E di pothuajse → pas 2-3 ditësh\n❌ E harrove → përsëritet menjëherë sot\n\n🔑 Rregulli kryesor: hyr ÇDO DITË dhe bëj ushtrimet. Edhe 10 minuta në ditë japin rezultat të shkëlqyer!"
      },
      {
        "icon": "1️⃣",
        "title": "Regjistrimi",
        "body": "Regjistrohu me rolin «Nxënës». Pyet mësuesin për adresën e sajtit.\n\nPas hyrjes do të shkosh menjëherë te faqja kryesore «Sot»."
      },
      {
        "icon": "2️⃣",
        "title": "📅 Faqja «Sot»",
        "body": "Këtu shfaqen ushtrimet që DUHET t'i bësh sot.\n\nSheh numra? Këto janë sasitë e ushtrimeve sipas llojeve:\n🃏 Karta-blic\n✏️ Boshllëqe\n☑️ Zgjedhje përgjigjeje\n✍️ Shkruaj fjali\n🔤 Shto shkronjën\n🎙️ Diktim\n\nShtyp «Fillo përsëritjen» — dhe fillo!"
      },
      {
        "icon": "🃏",
        "title": "Karta-blic",
        "body": "Të shfaqet një fjalë gjermane. Kujto përkthimin, pastaj shtyp mbi kartën — do të shohësh përgjigjen.\n\nVetëvlerësohu me sinqeritet:\n❌ Nuk e mbaj mend — fjala do të vijë përsëri sot\n😐 Me vështirësi — pas 1 dite\n🙂 Normal — pas 3 ditësh\n✅ E mbaj mend lehtë — pas 1 jave ose më shumë"
      },
      {
        "icon": "✏️",
        "title": "Plotëso boshllëkun",
        "body": "Në fjalinë gjermane ka një boshllëk ___. Shkruaj fjalën e saktë dhe shtyp «Kontrollo».\n\n💡 Këshillë: në fjali shihet konteksti, kjo të ndihmon të kujtosh fjalën. Shkronjat e mëdha/vogla nuk kanë rëndësi — «Haus» dhe «haus» konsiderohen njësoj."
      },
      {
        "icon": "☑️",
        "title": "Zgjedhje përgjigjeje",
        "body": "Sheh një pyetje dhe 4 variante? Shtyp mbi atë të saktin.\n\n🟢 E gjelbër — saktë, vazhdojmë më tej\n🔴 E kuqe — gabim, shiko përgjigjen e saktë\n\nPas përgjigjes, pas një sekonde do të hapet automatikisht ushtrimi tjetër."
      },
      {
        "icon": "✍️",
        "title": "Shkruaj një fjali",
        "body": "Të jepet një fjalë gjermane dhe një këshillë. Shkruaj ÇFARËDO fjalie të thjeshtë në gjermanisht me këtë fjalë.\n\nShembull: fjala «Hund» → «Ich habe einen Hund.» ✓\n\nIA do të kontrollojë:\n• Nëse fjala është përdorur saktë\n• Nëse ka gabime të rënda\nDhe do të vendosë një vlerësim nga ★ deri në ★★★★★"
      },
      {
        "icon": "🔤",
        "title": "Shto shkronjën",
        "body": "Shfaqet një fjalë gjermane me një shkronjë (ose disa) që mungon. Duhet të gjesh cila shkronjë mungon.\n\nShembull: «_aus» → «H» → «Haus» ✓\n\nKjo ndihmon të mbash mend drejtshkrimin e fjalëve gjermane me umlaute (ä, ö, ü)."
      },
      {
        "icon": "🎙️",
        "title": "Diktimi",
        "body": "Fjala shqiptohet me zë në gjermanisht. Ti e dëgjon, por nuk e sheh — duhet ta shkruash saktë!\n\n1. Dëgjo me vëmendje 🎵\n2. Shtyp ◄ nëse dëshiron ta dëgjosh përsëri\n3. Shkruaj fjalën\n4. Shtyp «Kontrollo»\n\nKy është ushtrimi më i vështirë — kontrollon njëkohësisht dëgjimin dhe drejtshkrimin!"
      },
      {
        "icon": "🗣️",
        "title": "Shqiptimi — fol në gjermanisht",
        "body": "Të shfaqet përkthimi i fjalës — ti duhet ta THUASH me zë fjalën gjermane.\n\n1. Lexo përkthimin\n2. Shtyp butonin 🎤 (ose fol menjëherë — butoni shfaqet vetë)\n3. Shqipto fjalën gjermane në mikrofon\n4. Sistemi do të tregojë çfarë dëgjoi dhe përputhjen\n\n✅ Saktë — vazhdojmë më tej\n😕 Jo saktë — provo përsëri ose shtyp «Kapërce»\n\n⚠️ Punon në Chrome në Android/PC. Në iPhone për momentin vetëm leximi.\n\n💡 Këshillë: shtyp butonin 🔊 që të dëgjosh fillimisht si tingëllon fjala saktë."
      },
      {
        "icon": "📖",
        "title": "Lexuesi — lexojmë dhe përkthejmë tekste",
        "body": "Seksioni «Lexuesi» — tre mënyra:\n\n▶ Lexo — ngjit tekstin, shtyp butonin dhe dëgjo. Shtyp mbi fjalën — do të shohësh përkthimin nga fjalori.\n\n🌐 Dygjuhësh — IA e përkthen tekstin paragraf pas paragrafi. Zgjidh gjuhët (p.sh. gjermanisht → rusisht). Shtyp «Përkthe».\n\n💬 Bisedë — si Google Translate! Dy njerëz flasin me radhë në mikrofon — sistemi përkthen dhe shqipton me zë. E dobishme në mësim ose për bisedë me një folës amtar.\n\n⚠️ Regjimet me mikrofon punojnë vetëm në Chrome."
      },
      {
        "icon": "💬",
        "title": "Fjalori i bisedës — frazat e tua",
        "body": "Në fjalorin e bisedës futen frazat që ke ruajtur nga ushtrimet (butoni 📖).\n\nMund të shtosh një frazë edhe manualisht:\n1. Shtyp «+ Shto frazë»\n2. Shkruaj frazën gjermane\n3. Dil nga fusha — IA do ta përkthejë vetë!\n4. Korrigjoje nëse nevojitet dhe ruaje\n\nShëno frazën me ✅ kur ta mësosh."
      },
      {
        "icon": "🤖",
        "title": "Trajneri IA — dialogje të gjalla (PËRDITËSUAR)",
        "body": "Seksioni «Trajneri IA» — bisedë e gjallë me mentorin. I pari — 🤓 Pablo (themeluesi), si dhe Лена, Макс, Ганна, Отто.\n\nZgjidh personazhin dhe temën (ose «Fjalët e mësimit N») → «Fillo bisedën».\n\nPersonazhi përgjigjet në gjermanisht, nën mesazh: përkthimi, gabimet e tua, 🔊 dëgjo.\n\n✨ REGJIMI ZANOR (si te Gemini): shtyp ✨ pranë fushës së shkrimit → foto e madhe e Pablo-s, ai përshëndet dhe dëgjon. Thjesht fol — duart të lira! Ai përgjigjet me zë, reagon «saktë/gabim» (ngjyrat e Gjermanisë), dhe poshtë shfaqet regjistri i bisedës (gjermanisht + përkthimi, 🔊 dëgjo). Mund të flasësh në gjermanisht (njohje e saktë) ose të kalosh në gjuhën tënde.\n\n⚠️ Zëri punon në Chrome (Android/PC)."
      },
      {
        "icon": "📐",
        "title": "Gramatika — fletë ndihmëse (E RE)",
        "body": "Seksioni «Gramatika» në meny — udhëzues për rasat, parafjalët, foljet.\n\nHap çdo temë → do të shohësh një shpjegim të qartë dhe tabela me ngjyra:\n🔵 der (m.) · 🔴 die (f.) · 🟢 das (asnjanëse) · ⚫ shumës\n\nPër çdo rasë — pyetja (kush? kë? kujt?) dhe shpjegimi kur përdoret. Shiko dhe përsërit para ushtrimeve."
      },
      {
        "icon": "🎬",
        "title": "Pablo në ushtrime (E RE)",
        "body": "Tani në ushtrime mentori Pablo reagon ndaj përgjigjes tënde: fytyra e tij gjallërohet dhe thotë «Sehr gut!» nëse është saktë ose «Nicht ganz» nëse ke gabuar.\n\nNëse do vetëm tekst pa video — mund ta çaktivizosh: Cilësimet → Zëri → «Trajneri në ushtrime»."
      },
      {
        "icon": "👤",
        "title": "Profili — avatari dhe të dhënat",
        "body": "Shtyp mbi avatarin (rrethi me shkronjë ose emoji) në menynë e majtë — do të hapet profili.\n\nÇfarë mund të konfigurosh:\n• Avatari — zgjidh nga 12 emoji ose mbetet shkronja e emrit\n• Emri i plotë, profesioni\n• Telefoni, Telegram, WhatsApp\n• Ndryshimi i fjalëkalimit\n\nKëto të dhëna i sheh mësuesi te seksioni «Nxënësit»."
      },
      {
        "icon": "🔊",
        "title": "Zëri dhe cilësimet",
        "body": "Në meny (butoni ☰ majtas ose poshtë në telefon):\n\n🔊 ndez/fik — aktivizo shqiptimin automatik të fjalëve\n🎤 Zëri — zgjidh zërin gjerman (Google Deutsch tingëllon më mirë se të tjerët)\n🌙/☀️ — tema e errët ose e çelët\n🌍 Gjuha — ndrysho gjuhën e ndërfaqes\n\nMund të aktivizosh shqiptimin e përkthimit — atëherë pas fjalës gjermane do të dëgjohet edhe përkthimi."
      },
      {
        "icon": "🔗",
        "title": "Ndaj kartën (E RE)",
        "body": "Të pëlqeu një fjalë — ndaje me një shok!\n\nNë Fjalor, çdo fjalë ka butonin 🔗. Shtype — lidhja e kartës do të kopjohet (ose do të hapet menyja «Ndaj» në telefon: Telegram, WhatsApp…).\n\nShoku do ta hapë lidhjen dhe do të shohë kartën: fjala, përkthimi në gjuhën E TIJ, imazhi, shembulli, butoni 🔊 dëgjo dhe «➕ në fjalorin e bisedës» — për ta shtuar fjalën te vetja."
      },
      {
        "icon": "🔍",
        "title": "Fjalori: filtër sipas shkronjës dhe skanimit (E RE)",
        "body": "Në Fjalor tani është e lehtë të gjesh fjalët e nevojshme:\n\n🔤 Shkronja — shtyp një shkronjë të alfabetit, do të mbeten vetëm fjalët me atë shkronjë.\n\n📄 Skanimi — nëse zgjedh një mësim, do të shfaqen etiketa «Skanimi 1 / Skanimi 2…» (faqet e tekstit shkollor) — fjalët pikërisht nga ajo faqe.\n\nMund të kombinohet me kërkimin dhe statusin (e re/duke u mësuar/e ditur)."
      },
      {
        "icon": "🗣️",
        "title": "Trajneri IA — më i gjallë (PËRDITËSUAR)",
        "body": "Trajneri tani komunikon si një bashkëbisedues i vërtetë:\n• Nuk përkthen çdo frazë të vetën — përpiqu ta kuptosh nga kuptimi (përkthimi mund të aktivizohet te cilësimet)\n• Nuk përshëndet dhe nuk lavdëron në çdo mesazh — thjesht bisedë e gjallë\n• Analiza e gabimeve — në fund, në raport\n\nKështu mësohesh më shpejt të kuptosh gjermanishten me dëgjim."
      }
    ],
    "install": [
      {
        "icon": "📱",
        "title": "Çfarë është instalimi i aplikacionit?",
        "body": "Sajti ynë është i ashtuquajturi PWA (Progressive Web App, «Aplikacion Web Progresiv»).\n\nKjo do të thotë: sajti MUND të instalohet si një aplikacion i zakonshëm në telefon ose laptop. Pas instalimit:\n✅ Niset pa shfletues, si një aplikacion i vërtetë\n✅ Hapet më shpejt\n✅ Punon në ekran të plotë (pa shiritin e adresës)\n✅ Shfaqet në listën e aplikacioneve në telefon"
      },
      {
        "icon": "🤖",
        "title": "Instalimi në Android (telefon/tablet)",
        "body": "1. Hap sajtin në Chrome\n2. Prit 10-15 sekonda\n3. Poshtë ekranit do të shfaqet një njoftim: «Shto Deutsch Lernen në ekranin kryesor»\n4. Shtyp «Instalo» ose «Shto»\n\nNëse njoftimi nuk u shfaq:\n• Shtyp tri pikat ⋮ në cepin e sipërm djathtas të Chrome\n• Zgjidh «Shto në ekranin kryesor»\n• Shtyp «Instalo»\n\nGati! Aplikacioni do të shfaqet në ekranin kryesor."
      },
      {
        "icon": "🍎",
        "title": "Instalimi në iPhone/iPad",
        "body": "1. Hap sajtin në shfletuesin Safari (patjetër Safari, jo Chrome!)\n2. Shtyp butonin «Ndaj» poshtë ekranit — është ikona e katrorit me shigjetë lart ⬆️\n3. Rrëshqit listën poshtë\n4. Shtyp «Në ekranin Home»\n5. Shtyp «Shto»\n\nAplikacioni do të shfaqet në ekranin kryesor, si një aplikacion i zakonshëm.\n\n⚠️ E rëndësishme: në iPhone funksionon vetëm përmes Safari. Chrome dhe shfletuesit e tjerë ende nuk mbështesin instalimin e PWA në iOS."
      },
      {
        "icon": "💻",
        "title": "Instalimi në laptop (Windows/Mac)",
        "body": "Në shfletuesin Chrome ose Edge:\n\n1. Hap sajtin\n2. Në shiritin e adresës djathtas do të shfaqet ikona ⊕ ose ikona e monitorit — shtype\n3. Shtyp «Instalo»\n\nOse përmes menysë:\n• Chrome: tri pikat ⋮ → «Ruaj dhe ndaj» → «Krijo shkurtore» → «Hap si dritare» ✓\n• Edge: tri pikat … → «Aplikacionet» → «Instalo këtë sajt si aplikacion»\n\nPas instalimit, aplikacioni niset si një dritare e veçantë pa shiritin e adresës."
      },
      {
        "icon": "🏪",
        "title": "Google Play (së shpejti)",
        "body": "Në të ardhmen aplikacioni do të shfaqet në Google Play Store — atëherë do të mund të instalohet si një aplikacion i zakonshëm nga dyqani.\n\nVersioni aktual është gjithmonë i disponueshëm në sajtin deutschlernen.ai — atje përditësimet shfaqen menjëherë, pa pritur verifikimin në dyqan.\n\nAplikacioni PWA (instalimi përmes shfletuesit) punon po aq mirë sa aplikacioni nga dyqani."
      },
      {
        "icon": "🔄",
        "title": "Përditësimet",
        "body": "Aplikacioni përditësohet automatikisht — herën tjetër që e hap, do të ngarkojë vetë versionin e ri.\n\nNuk duhet të bësh asgjë — të gjitha përmirësimet do të shfaqen vetë."
      }
    ]
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
// ─── Как считается прогресс и «баллы» (для всех языков, учителю и ученику) ────
// Контент на русском — прикрепляется ко всем языкам одинаково (как ADMIN_SECTION/GAME_*).
const PROGRESS_SECTION = {
  icon: '🎓', title: 'Как считается прогресс и «баллы»',
  body: 'Коротко, за что растут цифры на странице прогресса — чтобы было понятно и ученику, и учителю.\n\n'
    + '📘 КОГДА УРОК СЧИТАЕТСЯ ПРОЙДЕННЫМ\n'
    + 'Урок засчитан, когда КАЖДОЕ слово урока отработано хотя бы в одном упражнении (любого из 7 типов). '
    + 'Не нужно проходить все 7 упражнений каждого слова — достаточно один раз встретить слово и ответить. '
    + 'Как только все слова урока «задеты» — урок пройден: в курсе открывается следующий урок, а счётчик «📘 уроки» на дашборде растёт.\n\n'
    + '💪 СТАТУСЫ СЛОВ (🆕 новое → 📖 учу → ✅ знаю)\n'
    + '• «учу» — после первого успешного ответа по слову.\n'
    + '• «знаю» — после 5 успешных повторений.\n'
    + 'Счётчик «💪 слова» = сколько слов в статусе «знаю».\n\n'
    + '🔁 ИНТЕРВАЛЬНОЕ ПОВТОРЕНИЕ (алгоритм SM-2)\n'
    + 'Чем увереннее отвечаешь — тем реже слово возвращается (сегодня → завтра → через несколько дней → неделю…). '
    + 'Ошибся — слово вернётся уже скоро. Так оно закрепляется надолго, а не зубрится за один раз.\n\n'
    + '🔥 СЕРИЯ и 🏆 ВЕХИ\n'
    + '• Серия — сколько дней подряд ты занимался (прервётся, если пропустить день).\n'
    + '• Вехи — поздравления за пороги: слова (10, 25, 50, 100, 200, 300, 500, 1000) и уроки (3, 5, 10, 20, 30, 50, 100).\n\n'
    + '📅 ДНЕВНОЙ ЛИМИТ\n'
    + 'За день показывается ограниченное число упражнений (по умолчанию 50, меняется в Настройках). '
    + 'Большой урок можно закрывать по частям в разные дни — прогресс сохраняется.\n\n'
    + '🔔 НАПОМИНАНИЯ\n'
    + 'Пуши приходят по твоему местному времени (таймзона определяется автоматически). '
    + 'Утреннее/вечернее напоминание и поздравления с вехами можно настроить в «Настройки → ⏰ Когда напоминать».',
}

for (const l of Object.keys(WIKI)) {
  WIKI[l].teacher = [...WIKI[l].teacher, GAME_TEACHER, CAMERA_TEACHER, PROGRESS_SECTION]
  WIKI[l].student = [...WIKI[l].student, GAME_STUDENT, CAMERA_STUDENT, PROGRESS_SECTION]
}

// ─── Компонент ───────────────────────────────────────────────────────────────

const TAB_SUBTITLES = {
  ru: ['Инструкции для учителей и родителей', 'Инструкции для учеников', 'Как установить приложение'],
  en: ['Instructions for teachers and parents', 'Instructions for students', 'How to install the app'],
  de: ['Anleitungen für Lehrer und Eltern', 'Anleitungen für Schüler', 'App installieren'],
  uk: ['Інструкції для вчителів і батьків', 'Інструкції для учнів', 'Як встановити додаток'],
  bg: ["Инструкции за учители и родители","Инструкции за ученици","Как да инсталирате приложението"],
  tr: ["Öğretmenler ve veliler için talimatlar","Öğrenciler için talimatlar","Uygulama nasıl kurulur"],
  ar: ["تعليمات للمعلمين وأولياء الأمور","تعليمات للطلاب","كيفية تثبيت التطبيق"],
  es: ["Instrucciones para profesores y padres","Instrucciones para alumnos","Cómo instalar la aplicación"],
  fr: ["Instructions pour les enseignants et les parents","Instructions pour les élèves","Comment installer l'application"],
  sq: ["Udhëzime për mësuesit dhe prindërit","Udhëzime për nxënësit","Si të instaloni aplikacionin"],
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
