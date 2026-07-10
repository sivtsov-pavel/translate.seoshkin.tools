import { useState } from 'react'
import PublicHeader from '../components/PublicHeader.jsx'
import { useI18nStore } from '../store/i18n.js'

// Публичная страница — доступна без авторизации
// URL: /docs

const SECTIONS_RU = [
  {
    id: 'srs',
    icon: '🧠',
    title: 'Как работает умное повторение (SRS)',
    body: `Система использует алгоритм SM-2 (SuperMemo 2) — тот же, что в Anki и Duolingo.

Идея: чем лучше ты помнишь слово — тем реже его нужно повторять. Чем хуже — тем чаще.

Алгоритм SM-2:
• После каждого ответа ты выставляешь оценку от 0 до 5
• Алгоритм считает следующий интервал: interval_new = interval_old × EF
• EF (Easiness Factor) — коэффициент лёгкости, начинается с 2.5
• Хорошо ответил → EF растёт → интервал больше
• Плохо ответил → EF падает → слово возвращается быстрее

Типичные интервалы:
  1-й раз: 1 день
  2-й раз: 6 дней
  3-й раз: ~2 недели
  4-й раз: ~1 месяц
  ...и так далее, экспоненциально

Пример: слово «Apfel»
  День 1: видишь впервые → отвечаешь → следующий показ через 1 день
  День 2: помнишь хорошо → через 6 дней
  День 8: помнишь → через 15 дней
  День 23: помнишь → через 35 дней
  Забыл → интервал сбрасывается, начинаем заново

Результат: 20 минут в день = 1000+ слов за год.`,
  },
  {
    id: 'exercises',
    icon: '✏️',
    title: 'Типы упражнений',
    body: `В системе 7 типов упражнений. Для каждого слова создаются все автоматически.

🃏 ФЛЕШ-КАРТА
Видишь немецкое слово → вспоминаешь перевод → переворачиваешь карточку.
Оцениваешь себя: ❌ не помню / 😐 с трудом / 🙂 нормально / ✅ легко.

✏️ ЗАПОЛНИ ПРОПУСК
Немецкое предложение с пропуском ___. Нужно вписать правильное слово.

☑️ ВЫБОР ОТВЕТА
Вопрос и 4 варианта ответа. Нажми правильный.

✍️ НАПИШИ ПРЕДЛОЖЕНИЕ
Напиши предложение по-немецки. ИИ проверяет и объясняет ошибки.

🔤 ДОБАВЬ БУКВУ
Слово с пропущенной буквой: «_aus» → «H» → «Haus».

🎙️ ДИКТАНТ
Слово произносится вслух — нужно написать, не видя его.

🗣️ ПРОИЗНОШЕНИЕ
Скажи слово в микрофон — система проверит правильность произношения.`,
  },
  {
    id: 'progress',
    icon: '📊',
    title: 'Прогресс и статистика',
    body: `Статус слова:
• 🔵 Новое — ещё не изучалось
• 🟡 Изучается — в процессе (следующий показ в будущем)
• 🟢 Выучено — отвечено правильно несколько раз подряд

На главной «Сегодня»:
  Показываются упражнения с датой ≤ сегодня + все новые.
  Лимит задаётся в Настройках (по умолчанию 50 в день).

Отчёт (/report):
  • Количество попыток по дням (за 30 дней)
  • Прогресс по каждому уроку
  • Активность учеников (для учителя)`,
  },
  {
    id: 'import',
    icon: '📷',
    title: 'Загрузка уроков — требования к фото',
    body: `Что можно фотографировать:
✅ Страницы учебника (список слов, диалоги, тексты)
✅ Рукописные записи учителя
✅ Распечатки и карточки
✅ Экран с текстом (скриншот)

Требования к фото:
• Чёткое, не размытое
• Хорошее освещение
• Текст занимает бо́льшую часть кадра

Что делает ИИ:
1. Читает текст (GPT-4o Vision)
2. Выделяет немецкие слова и переводы
3. Создаёт упражнения на каждое слово
4. Переводит на все доступные языки

Время обработки: ~10 сек на фото, 24 фото ≈ 5–8 минут.`,
  },
  {
    id: 'roles',
    icon: '👥',
    title: 'Роли пользователей',
    body: `УЧИТЕЛЬ / РОДИТЕЛЬ (owner):
• Создаёт курсы и уроки
• Загружает фото учебников
• Видит всех учеников и их прогресс
• Настраивает API-ключи

УЧЕНИК (student):
• Делает задания на странице «Сегодня»
• Видит свой прогресс
• Пишет в чат учителю

Как прикрепить ученика к курсу:
  1. Ученик регистрируется
  2. Учитель → «Ученики» → прикрепить к курсу
  3. Ученик видит уроки курса`,
  },
  {
    id: 'justify',
    icon: '💡',
    title: 'Кнопка «Обоснуй»',
    body: `В каждом упражнении есть кнопка 💡 Обоснуй.

ИИ объясняет:
• Что слово означает буквально
• Все его значения
• В каких ситуациях используется
• Живой пример из жизни

До ответа → работает как подсказка.
После ответа → помогает понять контекст.

Если ошибка → кнопка ❓ Почему ошибка? объясняет грамматическое правило.`,
  },
  {
    id: 'install',
    icon: '📱',
    title: 'Установка приложения',
    body: `Android (Chrome):
  1. Открой сайт в Chrome
  2. Нажми ⊕ в адресной строке или ⋮ → «Установить приложение»

iPhone / iPad (Safari):
  1. Открой в Safari
  2. Кнопка «Поделиться» ⬆️ → «На экран "Домой"»

Windows / Mac (Chrome/Edge):
  1. Нажми значок ⊕ в адресной строке → «Установить»

После установки: запускается без браузера, работает полноэкранно.`,
  },
  {
    id: 'faq',
    icon: '❓',
    title: 'Частые вопросы',
    body: `Нет упражнений на сегодня?
→ Все задания выполнены — приходи завтра!
→ Или не прикреплён к курсу — спроси учителя.

Приложение не произносит слова?
→ Нужны немецкие голоса — загружаются автоматически.

ИИ не проверяет предложения?
→ Нужен OpenAI API-ключ. Обратись к учителю.

Как сменить язык интерфейса?
→ Кнопка с флагом в меню.`,
  },
]

const SECTIONS_EN = [
  {
    id: 'srs',
    icon: '🧠',
    title: 'How Spaced Repetition (SRS) Works',
    body: `The system uses the SM-2 algorithm (SuperMemo 2) — the same one used in Anki and Duolingo.

Idea: the better you remember a word, the less often you need to review it.

SM-2 algorithm:
• After each answer you rate yourself from 0 to 5
• The algorithm calculates the next interval: interval_new = interval_old × EF
• EF (Easiness Factor) starts at 2.5
• Good answer → EF grows → longer interval
• Bad answer → EF drops → word comes back sooner

Typical intervals:
  1st time: 1 day
  2nd time: 6 days
  3rd time: ~2 weeks
  4th time: ~1 month
  ...exponentially growing

Example: word "Apfel"
  Day 1: first encounter → next review in 1 day
  Day 2: remembered well → next in 6 days
  Day 8: remembered → next in 15 days
  Day 23: remembered → next in 35 days
  Forgot → interval resets

Result: 20 minutes a day = 1000+ words per year.`,
  },
  {
    id: 'exercises',
    icon: '✏️',
    title: 'Exercise Types',
    body: `There are 7 exercise types. All are generated automatically for each word.

🃏 FLASHCARD
See the German word → recall the translation → flip the card.
Rate yourself: ❌ forgot / 😐 hard / 🙂 okay / ✅ easy.

✏️ FILL IN THE BLANK
A German sentence with a gap ___. Type the correct word.

☑️ MULTIPLE CHOICE
A question with 4 options. Tap the correct one.

✍️ WRITE A SENTENCE
Write any simple sentence in German. AI checks and explains mistakes.

🔤 ADD THE LETTER
Word with a missing letter: "_aus" → "H" → "Haus".

🎙️ DICTATION
The word is spoken aloud — write it without seeing it.

🗣️ PRONUNCIATION
Say the word into the microphone — the system checks your pronunciation.`,
  },
  {
    id: 'progress',
    icon: '📊',
    title: 'Progress & Statistics',
    body: `Word status:
• 🔵 New — not yet studied
• 🟡 Learning — in progress (next review in the future)
• 🟢 Mastered — answered correctly several times in a row

Today's page shows:
  Exercises due today + all new ones.
  Daily limit set in Settings (default: 50).

Report (/report):
  • Attempts by day (last 30 days)
  • Progress per lesson
  • Student activity (teacher view)`,
  },
  {
    id: 'import',
    icon: '📷',
    title: 'Uploading Lessons — Photo Requirements',
    body: `What you can photograph:
✅ Textbook pages (word lists, dialogues, texts)
✅ Teacher's handwritten notes
✅ Printed materials and cards
✅ Screen with text (screenshot)

Photo requirements:
• Sharp, not blurry
• Good lighting
• Text fills most of the frame

What the AI does:
1. Reads the text (GPT-4o Vision)
2. Extracts German words and translations
3. Creates exercises for each word
4. Translates into all available languages

Processing time: ~10 sec per photo, 24 photos ≈ 5–8 minutes.`,
  },
  {
    id: 'roles',
    icon: '👥',
    title: 'User Roles',
    body: `TEACHER / PARENT (owner):
• Creates courses and lessons
• Uploads textbook photos
• Sees all students and their progress
• Configures API keys

STUDENT:
• Does exercises on the "Today" page
• Sees their own progress
• Chats with the teacher

How to assign a student to a course:
  1. Student registers
  2. Teacher → "Students" → assign to course
  3. Student sees the course lessons`,
  },
  {
    id: 'justify',
    icon: '💡',
    title: '"Explain" Button',
    body: `Every exercise has a 💡 Explain button.

The AI explains:
• What the word literally means
• All its meanings
• When it's actually used in real life
• A real-life example

Before answering → works as a hint.
After answering → helps understand context.

Wrong answer → ❓ "Why wrong?" button explains the grammar rule.`,
  },
  {
    id: 'install',
    icon: '📱',
    title: 'Installing the App',
    body: `Android (Chrome):
  1. Open the site in Chrome
  2. Tap ⊕ in the address bar or ⋮ → "Install app"

iPhone / iPad (Safari):
  1. Open in Safari
  2. Share button ⬆️ → "Add to Home Screen"

Windows / Mac (Chrome/Edge):
  1. Click the ⊕ icon in the address bar → "Install"

After installing: launches without browser, works fullscreen.`,
  },
  {
    id: 'faq',
    icon: '❓',
    title: 'FAQ',
    body: `No exercises today?
→ All done — come back tomorrow!
→ Or you're not assigned to a course — ask your teacher.

App doesn't speak words?
→ German voices need to download automatically.

AI doesn't check sentences?
→ Requires an OpenAI API key. Contact your teacher.

How to change the interface language?
→ Flag button in the sidebar menu.`,
  },
]

// Для языков кроме RU — используем EN
function getSections(lang) {
  return lang === 'ru' ? SECTIONS_RU : SECTIONS_EN
}

const UI = {
  ru: { title: 'Deutsch Lernen — Документация', subtitle: 'Как работает система обучения немецкому языку', search: 'Поиск по документации…', empty: 'Ничего не найдено', footer1: 'Deutsch Lernen — Платформа для изучения немецкого языка', footer2: 'Есть вопрос?', footer3: 'Войдите', footer4: 'и напишите учителю.' },
  en: { title: 'Deutsch Lernen — Documentation', subtitle: 'How the German learning system works', search: 'Search documentation…', empty: 'Nothing found', footer1: 'Deutsch Lernen — German learning platform', footer2: 'Have a question?', footer3: 'Log in', footer4: 'and write to your teacher.' },
}

function DocSection({ section }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', textAlign: 'left', background: open ? 'var(--surface-2)' : 'var(--surface)',
        border: 'none', cursor: 'pointer', padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 24, flexShrink: 0 }}>{section.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 16, flex: 1, color: 'var(--ink)' }}>{section.title}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'}`} style={{ color: 'var(--ink-soft)', fontSize: 13 }} />
      </button>
      {open && (
        <div style={{
          padding: '16px 20px 20px 56px', color: 'var(--ink)', fontSize: 14,
          lineHeight: 1.75, whiteSpace: 'pre-line', borderTop: '1px solid var(--line)',
        }}>
          {section.body}
        </div>
      )}
    </div>
  )
}

export default function Docs() {
  const { lang } = useI18nStore()
  const ui = UI[lang] || UI.en
  const SECTIONS = getSections(lang)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const filtered = q
    ? SECTIONS.filter(s => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    : SECTIONS

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <PublicHeader />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📚</div>
          <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 28, margin: '0 0 8px', color: 'var(--ink)' }}>
            {ui.title}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
            {ui.subtitle}
          </p>
        </div>

        <div style={{ position: 'relative', marginBottom: 24 }}>
          <i className="bi bi-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={ui.search}
            style={{ width: '100%', paddingLeft: 40, fontSize: 15 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18 }}>×</button>
          )}
        </div>

        {!q && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }) }}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', textDecoration: 'none' }}>
                {s.icon} {s.title.split(' ').slice(0, 2).join(' ')}
              </a>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-soft)' }}>{ui.empty}</div>
        )}
        {filtered.map(s => (
          <div key={s.id} id={s.id}>
            <DocSection section={s} />
          </div>
        ))}

        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>
          <p>{ui.footer1}</p>
          <p>{ui.footer2} <a href="/login" style={{ color: 'var(--accent)' }}>{ui.footer3}</a> {ui.footer4}</p>
        </div>
      </div>
    </div>
  )
}
