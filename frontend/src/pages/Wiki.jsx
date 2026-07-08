import { useState } from 'react'
import { useI18nStore } from '../store/i18n.js'

const WIKI = {
  ru: {
    title: 'Справка',
    tabs: ['Для учителя', 'Для ученика'],
    teacher: [
      { icon: '1️⃣', title: 'Регистрация', body: 'Зарегистрируйтесь с ролью «Учитель / Родитель». Это даёт доступ к созданию уроков, просмотру учеников и управлению курсами.' },
      { icon: '2️⃣', title: 'Создайте курс', body: 'Перейдите в «Курсы» → «+ Курс». Введите название (например "6 класс 2024/2025"). Курс — это папка для уроков.' },
      { icon: '3️⃣', title: 'Загрузите урок', body: 'Внутри курса нажмите «+ Добавить урок». Или через «+ Урок» в меню. Сфотографируйте страницы учебника и/или тетради (можно несколько фото). Необязательно: добавьте аудиозапись урока. Нажмите «Обработать урок».' },
      { icon: '⏳', title: 'Ожидание обработки', body: 'Claude AI читает фото и создаёт карточки. На каждое фото ~10 секунд. 24 фото ≈ 5-8 минут. Прогресс виден на странице: «Фото 3 из 24...» → «Создаю упражнения...» → «Готово!». Страницу можно не держать открытой — обработка идёт на сервере. Статус видно в разделе «Уроки».' },
      { icon: '4️⃣', title: 'Что создаётся', body: 'Из каждого слова в уроке Claude создаёт 4 упражнения:\n🃏 Флеш-карта — перевернуть и оценить\n✏️ Заполни пропуск — вписать слово в предложение\n☑️ Выбери ответ — 4 варианта\n✍️ Напиши предложение — своё предложение, Claude проверит' },
      { icon: '5️⃣', title: 'Ученики', body: 'Ученики регистрируются сами с ролью «Ученик». Их прогресс виден в разделе «Ученики»: сколько слов выучено, сколько попыток сегодня.' },
      { icon: '🔑', title: 'API ключи', body: 'Ключи хранятся в файле .env на сервере. ANTHROPIC_API_KEY обязателен для обработки фото. OPENAI_API_KEY нужен только для расшифровки аудио.' },
    ],
    student: [
      { icon: '1️⃣', title: 'Регистрация', body: 'Зарегистрируйтесь с ролью «Ученик». Спросите у учителя адрес сайта.' },
      { icon: '2️⃣', title: 'Раздел "Сегодня"', body: 'Здесь показаны упражнения для повторения на сегодня. Видно сколько каждого типа ждёт. Нажмите «Начать повторение» чтобы начать сессию.' },
      { icon: '🃏', title: 'Флеш-карта', body: 'Показывается немецкое слово. Вспомни перевод, потом нажми на карточку чтобы увидеть ответ. Оцени насколько хорошо помнишь:\n❌ Не помню — повторится сегодня\n😐 С трудом — повторится через 1 день\n✅ Помню — повторится через 6+ дней' },
      { icon: '✏️', title: 'Заполни пропуск', body: 'В предложении есть пропуск ___. Введи правильное слово и нажми «Проверить». Регистр не важен.' },
      { icon: '☑️', title: 'Выбери ответ', body: 'Показывается вопрос и 4 варианта ответа. Нажми на правильный. Зелёный = верно, красный = неверно. Через секунду автоматически переходит к следующему.' },
      { icon: '✍️', title: 'Напиши предложение', body: 'Дано слово и подсказка. Составь любое простое предложение на немецком с этим словом. Claude проверит: правильно ли использовано слово, нет ли грубых ошибок. Получишь оценку (★☆☆☆☆) и комментарий.' },
      { icon: '📊', title: 'Интервальное повторение', body: 'Программа сама решает когда повторять слова. Чем лучше помнишь — тем реже показывает. Слова делятся на:\n🆕 Новое — ещё не изучалось\n📖 Изучается — в процессе\n✅ Выучено — помнишь хорошо (5+ повторений подряд)' },
    ],
  },
  de: {
    title: 'Hilfe',
    tabs: ['Für Lehrer', 'Für Schüler'],
    teacher: [
      { icon: '1️⃣', title: 'Registrierung', body: 'Registriere dich mit der Rolle „Lehrer / Elternteil". Das gibt dir Zugang zu Lektionen, Schülern und Kursen.' },
      { icon: '2️⃣', title: 'Kurs erstellen', body: 'Gehe zu „Kurse" → „+ Kurs". Gib einen Namen ein (z.B. „Klasse 6, 2024/2025"). Ein Kurs ist ein Ordner für Lektionen.' },
      { icon: '3️⃣', title: 'Lektion hochladen', body: 'Klicke im Kurs auf „+ Lektion hinzufügen". Fotografiere die Seiten des Lehrbuchs (mehrere Fotos möglich). Optional: Audioaufnahme hinzufügen. Klicke auf „Lektion verarbeiten".' },
      { icon: '⏳', title: 'Verarbeitung', body: 'Claude AI liest die Fotos und erstellt Übungen. Pro Foto ca. 10 Sekunden. 24 Fotos ≈ 5-8 Minuten. Fortschritt wird angezeigt.' },
      { icon: '4️⃣', title: 'Was erstellt wird', body: 'Aus jedem Wort erstellt Claude 4 Übungen:\n🃏 Lernkarte\n✏️ Lückentext\n☑️ Mehrfachauswahl\n✍️ Satz schreiben' },
      { icon: '5️⃣', title: 'Schüler', body: 'Schüler registrieren sich selbst. Ihren Fortschritt siehst du unter „Schüler".' },
    ],
    student: [
      { icon: '1️⃣', title: 'Registrierung', body: 'Registriere dich mit der Rolle „Schüler". Frage deinen Lehrer nach der Webseite.' },
      { icon: '2️⃣', title: '„Heute"-Bereich', body: 'Hier siehst du die Übungen für heute. Klicke auf „Wiederholung starten".' },
      { icon: '🃏', title: 'Lernkarte', body: 'Ein deutsches Wort wird angezeigt. Denke an die Übersetzung, dann tippe auf die Karte. Bewerte wie gut du es weißt.' },
      { icon: '✏️', title: 'Lückentext', body: 'Fülle die Lücke ___ im Satz aus und klicke auf „Prüfen".' },
      { icon: '☑️', title: 'Mehrfachauswahl', body: 'Wähle die richtige Antwort aus 4 Optionen.' },
      { icon: '✍️', title: 'Satz schreiben', body: 'Schreibe einen einfachen deutschen Satz mit dem gegebenen Wort. Claude prüft ihn.' },
    ],
  },
  en: {
    title: 'Help',
    tabs: ['For Teacher', 'For Student'],
    teacher: [
      { icon: '1️⃣', title: 'Registration', body: 'Sign up with the role "Teacher / Parent". This gives access to lessons, students, and courses.' },
      { icon: '2️⃣', title: 'Create a course', body: 'Go to "Courses" → "+ Course". Enter a name (e.g. "Grade 6, 2024/2025"). A course is a folder for lessons.' },
      { icon: '3️⃣', title: 'Upload a lesson', body: 'Inside a course click "+ Add lesson". Photo the textbook pages (multiple photos OK). Optionally add audio. Click "Process lesson".' },
      { icon: '⏳', title: 'Processing', body: 'Claude AI reads the photos and creates exercises. ~10 sec per photo. 24 photos ≈ 5-8 min. Progress is shown on-screen.' },
      { icon: '4️⃣', title: 'What is created', body: 'For each word Claude creates 4 exercises:\n🃏 Flashcard\n✏️ Fill in the blank\n☑️ Multiple choice\n✍️ Write a sentence' },
      { icon: '5️⃣', title: 'Students', body: 'Students register themselves. View their progress under "Students".' },
    ],
    student: [
      { icon: '1️⃣', title: 'Registration', body: 'Sign up with the "Student" role. Ask your teacher for the site address.' },
      { icon: '2️⃣', title: '"Today" section', body: 'Shows exercises due today. Click "Start review" to begin.' },
      { icon: '🃏', title: 'Flashcard', body: 'A German word is shown. Think of the translation, then tap the card to reveal it. Rate how well you remembered.' },
      { icon: '✏️', title: 'Fill in the blank', body: 'Type the missing word in the sentence and click "Check".' },
      { icon: '☑️', title: 'Multiple choice', body: 'Choose the correct answer from 4 options.' },
      { icon: '✍️', title: 'Write a sentence', body: 'Write a simple German sentence using the given word. Claude will check it.' },
    ],
  },
  uk: {
    title: 'Довідка',
    tabs: ['Для вчителя', 'Для учня'],
    teacher: [
      { icon: '1️⃣', title: 'Реєстрація', body: 'Зареєструйтесь з роллю «Вчитель / Батьки». Це дає доступ до уроків, учнів і курсів.' },
      { icon: '2️⃣', title: 'Створіть курс', body: 'Перейдіть до «Курси» → «+ Курс». Введіть назву (наприклад «6 клас 2024/2025»). Курс — це папка для уроків.' },
      { icon: '3️⃣', title: 'Завантажте урок', body: 'У курсі натисніть «+ Додати урок». Сфотографуйте сторінки підручника (можна кілька фото). За бажанням додайте аудіо. Натисніть «Обробити урок».' },
      { icon: '⏳', title: 'Обробка', body: 'Claude AI читає фото та створює вправи. На кожне фото ~10 секунд. 24 фото ≈ 5-8 хвилин. Прогрес відображається на екрані.' },
      { icon: '4️⃣', title: 'Що створюється', body: 'З кожного слова Claude створює 4 вправи:\n🃏 Картка\n✏️ Заповни пропуск\n☑️ Обери відповідь\n✍️ Напиши речення' },
      { icon: '5️⃣', title: 'Учні', body: 'Учні реєструються самостійно. Їхній прогрес видно у розділі «Учні».' },
    ],
    student: [
      { icon: '1️⃣', title: 'Реєстрація', body: 'Зареєструйтесь з роллю «Учень». Запитайте у вчителя адресу сайту.' },
      { icon: '2️⃣', title: 'Розділ «Сьогодні»', body: 'Тут відображені вправи для повторення. Натисніть «Почати повторення».' },
      { icon: '🃏', title: 'Картка', body: 'Показується німецьке слово. Пригадай переклад, потім натисни на картку. Оціни наскільки добре пам\'ятаєш.' },
      { icon: '✏️', title: 'Заповни пропуск', body: 'Введи слово у пропуск ___ та натисни «Перевірити».' },
      { icon: '☑️', title: 'Обери відповідь', body: 'Вибери правильну відповідь з 4 варіантів.' },
      { icon: '✍️', title: 'Напиши речення', body: 'Напиши просте речення німецькою з даним словом. Claude перевірить його.' },
    ],
  },
}

export default function Wiki() {
  const { lang } = useI18nStore()
  const [tab, setTab] = useState(0)
  const content = WIKI[lang] || WIKI.ru
  const sections = tab === 0 ? content.teacher : content.student

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>{content.title}</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {content.tabs.map((label, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding: '8px 20px', fontSize: 14, fontWeight: 600, borderRadius: 20, border: 'none', cursor: 'pointer',
            background: tab === i ? 'var(--accent)' : 'var(--surface-2)',
            color: tab === i ? 'var(--accent-ink)' : 'var(--ink)',
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sections.map((sec, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>{sec.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{sec.title}</div>
                <div style={{ color: 'var(--ink)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{sec.body}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
