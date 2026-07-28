import { useState, useEffect } from 'react'
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
    body: `В системе 8 типов упражнений. Для каждого слова создаются все автоматически.

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
Слово с пропущенной буквой: «H_us» → «a» → «Haus».
Артикль не прячется, первая и последняя буквы всегда видны. Длинное слово
переносится целиком: «der Kugelschreiber» — артикль на одной строке, слово на другой.

🎙️ ДИКТАНТ
Слово произносится вслух — нужно написать, не видя его.
Если у слова несколько форм («die Lehrerin / die Kursleiterin»), достаточно написать
ЛЮБУЮ одну — засчитывается. Вслух диктуется тоже одна форма.
Регистр важен: в немецком существительные пишутся с большой буквы.

🗣️ ПРОИЗНОШЕНИЕ
Скажи слово в микрофон — система проверит правильность произношения.

🧩 СКЛОНЕНИЕ
Спряжение глагола по лицам: ich / du / er / wir / ihr / sie.
Создаётся только для глаголов — существительным оно ни к чему.`,
  },
  {
    id: 'progress',
    icon: '📊',
    title: 'Как считаются уроки, прогресс и «баллы»',
    body: `ДВА РАЗНЫХ ПОНЯТИЯ: «УРОК ЗАСЧИТАН» И «УРОК ОСВОЕН»

Урок ЗАСЧИТАН, когда каждое слово отработано хотя бы одним упражнением любого типа.
С этого момента открывается следующий урок курса и растёт счётчик «📘 уроки».
Двигаться вперёд специально не мешаем: упереться в стену и бросить — худший исход.

Урок ОСВОЕН, когда пройдены ВСЕ его упражнения. На карточке урока видно полосу
«Пройдено упражнений — 12 / 47», а вместо галочки стоит процент, пока он не 100.

Зачем так. Слово запоминается, когда встретилось в разных заданиях: узнал на карточке,
собрал по буквам, вставил в предложение, написал сам, услышал в диктанте. Если
прощёлкать только карточки, урок засчитается — но слова забудутся через неделю.
Поэтому на финише урока главная кнопка — «Продолжить упражнения», а «следующий урок»
становится второстепенным, пока в текущем осталось незакрытое.

ЕСЛИ УПРАЖНЕНИЕ СЕЙЧАС НЕУДОБНО
Произношение и диктант можно отложить кнопкой — они уйдут в «хвосты» и не будут
мешать. Ночью или в транспорте это нормально: вернётесь к ним, когда сможете говорить
вслух. Отложенные засчитываются как пройденные — вы их не пропустили, а перенесли.

СТАТУС СЛОВА (🔵 новое → 🟡 учу → 🟢 знаю)
• 🟡 «учу» — после первого успешного ответа по слову
• 🟢 «знаю» — после 5 успешных повторений (по алгоритму SM-2)
Счётчик «💪 слова» = сколько слов в статусе «знаю».

ДОСТИЖЕНИЯ
• 🔥 Серия — сколько дней подряд ты занимался (прервётся, если пропустить день)
• 🏆 Вехи — поздравления за пороги: слова (10, 25, 50, 100, 200, 300, 500, 1000)
  и уроки (3, 5, 10, 20, 30, 50, 100)

НА ГЛАВНОЙ «СЕГОДНЯ»
Показываются упражнения с датой повторения ≤ сегодня + новые.
Дневной лимит задаётся в Настройках (по умолчанию 50). Большой урок можно
закрывать по частям в разные дни — прогресс сохраняется.

НАПОМИНАНИЯ
Пуши приходят по твоему местному времени (Настройки → ⏰ Когда напоминать).

ОТЧЁТ (/report)
  • Попытки по дням (за 30 дней)
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
    id: 'quality',
    icon: '🔍',
    title: 'Качество материала — что система проверяет сама',
    body: `Упражнения создаёт ИИ, а он ошибается. Часть ошибок делает упражнение
НЕПРОХОДИМЫМ: ученик при всём желании не может его решить, и винит себя или программу.
Поэтому система проверяет материал сама.

ЧТО ОТЛАВЛИВАЕТСЯ АВТОМАТИЧЕСКИ

• «Добавь букву» с невыполнимой маской — когда пропуски не сходятся с ответом
  («h___d__t» при ответе «hundert»: сколько букв ни вставляй, слово не соберётся).
  Такая маска перестраивается заново, без участия ИИ.

• «Заполни пропуск» без самого пропуска или где правильного ответа нет среди вариантов.

• Мусор в словах: служебные пометки модели («verb: kochen») срезаются, а опечатки
  приводятся к уже принятому написанию — «Enthschuldigung» становится
  «die Entschuldigung», если это слово в системе уже есть.
  Иначе диктант требовал бы ввести слово с ошибкой.

• Текст не на том языке: в испанском курсе не должно появляться немецких предложений.

• Дубли слова внутри урока («das Auge» и «Auge») — сводятся к одному варианту,
  картинка и упражнения переносятся на него.

ЧТО ЭТО ЗНАЧИТ ДЛЯ УЧИТЕЛЯ

Загрузил урок — материал уже прошёл проверку. Но ИИ не всесилен: смысловые ошибки
(неверный перевод, неудачный пример) он не ловит. Пролистайте новый урок глазами,
прежде чем давать классу. Любое упражнение можно отредактировать или удалить.`,
  },
  {
    id: 'images',
    icon: '🖼',
    title: 'Картинки к словам — откуда берутся',
    body: `У каждого слова может быть картинка — она сильно помогает запоминанию.

ТРИ ИСТОЧНИКА

1. Банк слов. Если такое слово уже есть в системе, картинка берётся оттуда.
   Картинка передаёт СМЫСЛ, а не слово, поэтому одна и та же годится для всех языков:
   «стол» = Tisch = mesa = table — рисунок один.

2. Фотографии. Реальные фото по теме слова.

3. Рисунки ИИ. Детские иллюстрации в едином стиле, без текста на картинке —
   именно поэтому они и работают для любого языка.

ЧТО ВАЖНО ЗНАТЬ

Служебным словам картинка не рисуется: «восемьдесят», «мы повторяем», «для» —
нарисовать их нельзя, и это нормально, а не пропуск в материале.

Генерация рисунков может быть платной или бесплатной — режим переключается в
настройках платформы. Ученику разницы не видно.`,
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
    title: 'How lessons, progress & points are counted',
    body: `TWO DIFFERENT THINGS: "LESSON COMPLETED" AND "LESSON MASTERED"

A lesson is COMPLETED once every word has been practiced in at least one exercise of
any type. From that moment the next lesson unlocks and the "📘 lessons" counter grows.
We deliberately don't block your way forward: hitting a wall and quitting is the worst
possible outcome.

A lesson is MASTERED once ALL its exercises are done. The lesson card shows a bar
"Exercises completed — 12 / 47", and instead of a checkmark you see the percentage
until it reaches 100.

Why this way. A word sticks when you meet it in different tasks: recognise it on a card,
spell it out, drop it into a sentence, write your own, hear it in dictation. Click
through flashcards only and the lesson will count — but the words fade within a week.
That's why on the lesson finish screen the main button is "Continue exercises", while
"next lesson" stays secondary as long as something is left unfinished.

IF AN EXERCISE IS AWKWARD RIGHT NOW
Pronunciation and dictation can be postponed — they move to "leftovers" and stop getting
in the way. At night or on a bus that's perfectly fine: come back when you can speak out
loud. Postponed exercises count as done — you didn't skip them, you rescheduled them.

WORD STATUS (🔵 new → 🟡 learning → 🟢 known)
• 🟡 "learning" — after the first correct answer for the word
• 🟢 "known" — after 5 successful repetitions (SM-2 algorithm)
The "💪 words" counter = how many words are "known".

ACHIEVEMENTS
• 🔥 Streak — consecutive days you practiced (breaks if you skip a day)
• 🏆 Milestones — congrats at thresholds: words (10, 25, 50, 100, 200, 300, 500,
  1000) and lessons (3, 5, 10, 20, 30, 50, 100)

TODAY'S PAGE
Shows exercises due today + new ones. Daily limit set in Settings (default 50).
A big lesson can be finished across several days — progress is saved.

REMINDERS
Push notifications arrive at your local time (Settings → ⏰ When to remind).

REPORT (/report)
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
    id: 'quality',
    icon: '🔍',
    title: 'Material quality — what the system checks itself',
    body: `Exercises are generated by AI, and AI makes mistakes. Some of them make an
exercise IMPOSSIBLE to solve — the student cannot pass it no matter what, and blames
themselves or the app. So the system checks the material on its own.

CAUGHT AUTOMATICALLY

• "Fill the letter" with an impossible mask — when the gaps do not match the answer
  ("h___d__t" for "hundert"). Such a mask is rebuilt from scratch, without AI.

• "Fill the blank" with no blank at all, or where the correct answer is missing
  from the options.

• Junk in words: model tags ("verb: kochen") are stripped, and typos are matched to the
  spelling already accepted — "Enthschuldigung" becomes "die Entschuldigung" if that word
  already exists. Otherwise dictation would demand a misspelled word.

• Wrong language: a Spanish course must not contain German sentences.

• Duplicates of a word inside one lesson ("das Auge" and "Auge") — merged into one,
  with the picture and exercises moved onto it.

WHAT THIS MEANS FOR THE TEACHER

Once a lesson is uploaded, the material has already passed these checks. But AI is not
almighty: meaning errors (a wrong translation, a poor example) are not caught. Skim a new
lesson before giving it to the class. Any exercise can be edited or deleted.`,
  },
  {
    id: 'images',
    icon: '🖼',
    title: 'Word pictures — where they come from',
    body: `Every word may have a picture — it helps memorisation a lot.

THREE SOURCES

1. Word bank. If the word already exists in the system, its picture is reused.
   A picture carries MEANING, not a word, so the same one fits every language:
   "table" = Tisch = mesa — one drawing.

2. Photographs — real photos matching the word.

3. AI drawings — children's illustrations in one style, with no text on the image,
   which is exactly why they work for any language.

WORTH KNOWING

Function words get no picture: "eighty", "we repeat", "for" cannot be drawn, and that is
normal, not a gap in the material.

Drawing can be paid or free — the mode is switched in platform settings. The student
sees no difference.`,
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

// Группировка разделов — для структуры страницы и PDF-выгрузки
const SECTION_GROUP = {
  import: 'teacher', roles: 'teacher', quality: 'teacher', images: 'teacher',
  exercises: 'student', progress: 'student', justify: 'student', install: 'student', faq: 'student',
  srs: 'how',
}
const GROUP_ORDER = ['teacher', 'student', 'how']

const UI = {
  ru: { title: 'Deutsch Lernen — Документация', subtitle: 'Как работает система обучения немецкому языку', search: 'Поиск по документации…', empty: 'Ничего не найдено', footer1: 'Deutsch Lernen — Платформа для изучения немецкого языка', footer2: 'Есть вопрос?', footer3: 'Войдите', footer4: 'и напишите учителю.', pdf: 'Скачать PDF', groups: { teacher: '👩‍🏫 Для учителя', student: '🎓 Для ученика', how: '⚙️ Как работает' } },
  en: { title: 'Deutsch Lernen — Documentation', subtitle: 'How the German learning system works', search: 'Search documentation…', empty: 'Nothing found', footer1: 'Deutsch Lernen — German learning platform', footer2: 'Have a question?', footer3: 'Log in', footer4: 'and write to your teacher.', pdf: 'Download PDF', groups: { teacher: '👩‍🏫 For the teacher', student: '🎓 For the student', how: '⚙️ How it works' } },
}

function DocSection({ section, forceOpen }) {
  const [openState, setOpenState] = useState(false)
  const open = openState || forceOpen // при печати PDF все секции раскрыты
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 10, breakInside: 'avoid' }}>
      <button onClick={() => setOpenState(v => !v)} style={{
        width: '100%', textAlign: 'left', background: open ? 'var(--surface-2)' : 'var(--surface)',
        border: 'none', cursor: 'pointer', padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 24, flexShrink: 0 }}>{section.icon}</span>
        <span style={{ fontWeight: 700, fontSize: 16, flex: 1, color: 'var(--ink)' }}>{section.title}</span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'} no-print`} style={{ color: 'var(--ink-soft)', fontSize: 13 }} />
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
  const [printing, setPrinting] = useState(false)
  const q = search.trim().toLowerCase()
  const filtered = q
    ? SECTIONS.filter(s => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    : SECTIONS

  // «Скачать PDF» = браузерная печать в PDF: раскрываем все секции → window.print().
  // Без внешних библиотек (CSP запрещает CDN), типографика — от браузера.
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const id = setTimeout(() => window.print(), 100) // дать секциям раскрыться
    return () => { clearTimeout(id); window.removeEventListener('afterprint', done) }
  }, [printing])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
      <div className="no-print"><PublicHeader /></div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📚</div>
          <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 28, margin: '0 0 8px', color: 'var(--ink)' }}>
            {ui.title}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
            {ui.subtitle}
          </p>
          <button className="no-print" onClick={() => setPrinting(true)}
            style={{ marginTop: 14, padding: '9px 20px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            ⬇️ {ui.pdf}
          </button>
        </div>

        <div className="no-print" style={{ position: 'relative', marginBottom: 24 }}>
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
          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
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
        {/* Разделы: Для учителя / Для ученика / Как работает */}
        {GROUP_ORDER.map(g => {
          const items = filtered.filter(s => (SECTION_GROUP[s.id] || 'how') === g)
          if (items.length === 0) return null
          return (
            <div key={g}>
              <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 19, margin: '26px 0 12px', color: 'var(--ink)' }}>
                {ui.groups[g]}
              </h2>
              {items.map(s => (
                <div key={s.id} id={s.id}>
                  <DocSection section={s} forceOpen={printing} />
                </div>
              ))}
            </div>
          )
        })}

        <div className="no-print" style={{ marginTop: 40, textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>
          <p>{ui.footer1}</p>
          <p>{ui.footer2} <a href="/login" style={{ color: 'var(--accent)' }}>{ui.footer3}</a> {ui.footer4}</p>
        </div>
      </div>
    </div>
  )
}
