import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18nStore } from '../store/i18n.js'
import LangSwitcher from '../components/LangSwitcher.jsx'
import { speak } from '../hooks/useSpeech.jsx'

const ALPHA_PREVIEW = [
  { l: 'A', n: 'a',    ipa: 'аа' }, { l: 'B', n: 'be',   ipa: 'бэ' },
  { l: 'D', n: 'de',   ipa: 'дэ' }, { l: 'E', n: 'e',    ipa: 'э'  },
  { l: 'G', n: 'ge',   ipa: 'гэ' }, { l: 'H', n: 'ha',   ipa: 'хаа'},
  { l: 'I', n: 'i',    ipa: 'ии' }, { l: 'K', n: 'ka',   ipa: 'каа'},
  { l: 'O', n: 'o',    ipa: 'оо' }, { l: 'R', n: 'er',   ipa: 'эр' },
  { l: 'S', n: 'es',   ipa: 'эс' }, { l: 'T', n: 'te',   ipa: 'тэ' },
  { l: 'U', n: 'u',    ipa: 'уу' }, { l: 'W', n: 'we',   ipa: 'вэ' },
  { l: 'Z', n: 'zet',  ipa: 'цэт'}, { l: 'Ä', n: 'ä',   ipa: 'э↑' },
  { l: 'Ö', n: 'ö',    ipa: 'о↑' }, { l: 'Ü', n: 'ü',   ipa: 'у↑' },
]

function AlphabetPreview() {
  const [active, setActive] = useState(null)
  const play = (item) => {
    speak(item.n, 'de-DE')
    setActive(item.l)
    setTimeout(() => setActive(null), 1000)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
      {ALPHA_PREVIEW.map(item => (
        <button key={item.l} onClick={() => play(item)}
          style={{
            width: 70, padding: '10px 4px',
            border: `2px solid ${active === item.l ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 12, background: active === item.l ? 'var(--accent-soft)' : 'var(--surface)',
            cursor: 'pointer', textAlign: 'center',
            transition: 'all .15s',
          }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--ink)', fontFamily: 'Georgia,serif', lineHeight: 1 }}>
            {item.l}
          </div>
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>«{item.ipa}»</div>
          <div style={{ fontSize: 10, color: 'var(--ink-soft)', marginTop: 1 }}>{item.n}</div>
        </button>
      ))}
      <Link to="/register" style={{
        width: 70, padding: '10px 4px',
        border: '2px dashed var(--accent)', borderRadius: 12,
        background: 'transparent', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        textDecoration: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700,
      }}>
        <span style={{ fontSize: 20 }}>+</span>
        <span>Все 30</span>
      </Link>
    </div>
  )
}

// Контент лендинга на всех поддерживаемых языках
const L = {
  ru: {
    tagline: 'Немецкий для эмигрантов',
    subtitle: 'Учи немецкий с умным повторением, диктантами и ИИ-объяснениями. Бесплатно.',
    cta: 'Начать бесплатно',
    ctaLogin: 'Уже есть аккаунт',
    docsLink: 'Документация',
    modules: [
      { icon: '🃏', title: 'Флеш-карты', desc: 'Классические карточки с произношением и SM-2 интервальным повторением' },
      { icon: '🎙️', title: 'Диктант', desc: 'Тренировка на слух — слушаешь немецкое слово, пишешь его' },
      { icon: '🗣️', title: 'Произношение', desc: 'Скажи слово в микрофон — система проверит правильность. Голосовые тренировки', isNew: true },
      { icon: '✏️', title: 'Вставь букву', desc: 'Упражнение на правописание: ä, ö, ü, ß — частые трудности' },
      { icon: '💬', title: 'Разговорник', desc: 'Сохраняй полезные фразы из уроков и учи их отдельно' },
      { icon: '📖', title: 'Читалка', desc: 'Двуязычный режим, кликабельные слова и 💬 Разговор с переводом речи в реальном времени', isNew: true },
      { icon: '🤖', title: 'AI тренер', desc: 'Живые разговорные тренировки: выбери персонажа и сценарий — и говори по-немецки. Ошибки исправляются мягко.', isNew: true },
      { icon: '📊', title: 'Аналитика', desc: 'Прогресс по дням, лучшая серия, слова в изучении' },
      { icon: '🃏', title: 'Словопара', desc: 'Мини-игра: найди пары немецких слов и переводов. 8 пар, таймер, 4×4 поле', isNew: true, link: '/game/match' },
      { icon: '🤝', title: 'Знакомства — скоро', desc: 'Найди партнёра по языку: практикуй немецкий с носителем или другим учеником в живом чате', isSoon: true },
    ],
    steps: {
      title: 'Как начать',
      items: [
        { n: '1', text: 'Зарегистрируйся — это бесплатно и без карты' },
        { n: '2', text: 'Учитель добавит тебя в класс или создай уроки сам' },
        { n: '3', text: 'Каждый день — 15 минут повторения по расписанию' },
      ],
    },
    install: {
      title: 'Работает как приложение',
      text: 'Установи на телефон через браузер — без App Store, без Google Play.',
      android: 'Android: Chrome → меню ⋮ → «Установить приложение»',
      ios: 'iPhone: Safari → поделиться → «На экран Домой»',
    },
    ai: {
      title: 'ИИ объясняет, а не просто проверяет',
      text: 'Нажми «Обоснуй» — и получи объяснение смысла слова простым языком. Нажми «Почему ошибка?» — разбор твоей ошибки.',
    },
    teacher: {
      title: 'Преподаёте немецкий? Ведите учеников здесь',
      subtitle: 'Бесплатный кабинет учителя: соберите класс, давайте задания и держите учеников в тонусе — всё в одном месте.',
      items: [
        { icon: '📚', title: 'Свои уроки из учебника', desc: 'Загрузите фото страниц — ИИ распознаёт слова и сам соберёт 7 типов упражнений' },
        { icon: '🔔', title: 'Домашка в push', desc: 'Отправляйте задания и напоминания прямо на телефон ученика push-уведомлением' },
        { icon: '👥', title: 'Класс и курсы', desc: 'Добавляйте учеников, ведите курсы, распределяйте уроки по группам' },
        { icon: '📊', title: 'Прогресс каждого', desc: 'Видно, кто занимается, сколько слов выучил и где буксует' },
        { icon: '💬', title: 'Чат с классом', desc: 'Общайтесь с учениками прямо в приложении' },
        { icon: '🤖', title: 'ИИ на ваших учеников', desc: 'AI-тренер, объяснения и разбор ошибок работают для класса автоматически' },
      ],
    },
    footer: 'Читать документацию',
  },
  en: {
    tagline: 'German for immigrants',
    subtitle: 'Learn German with smart repetition, dictations and AI explanations. Free.',
    cta: 'Start for free',
    ctaLogin: 'Already have an account',
    docsLink: 'Documentation',
    modules: [
      { icon: '🃏', title: 'Flashcards', desc: 'Classic cards with pronunciation and SM-2 spaced repetition' },
      { icon: '🎙️', title: 'Dictation', desc: 'Listen to the German word and write it down' },
      { icon: '🗣️', title: 'Speaking', desc: 'Say the word into the microphone — the system checks your pronunciation', isNew: true },
      { icon: '✏️', title: 'Letter Fill', desc: 'Spelling practice: ä, ö, ü, ß — the tricky ones' },
      { icon: '💬', title: 'Phrasebook', desc: 'Save useful phrases from lessons and study them separately' },
      { icon: '📖', title: 'Text Reader', desc: 'Bilingual mode, clickable words and 💬 Conversation: translate speech in real time', isNew: true },
      { icon: '📊', title: 'Analytics', desc: 'Daily progress, best streaks, words in learning' },
      { icon: '🃏', title: 'WordPair', desc: 'Mini-game: match German words with their translations. 8 pairs, timer, 4×4 grid', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'How to start',
      items: [
        { n: '1', text: 'Register — it\'s free, no credit card needed' },
        { n: '2', text: 'A teacher adds you to a class or create lessons yourself' },
        { n: '3', text: 'Every day — 15 minutes of scheduled repetition' },
      ],
    },
    install: {
      title: 'Works as an app',
      text: 'Install on your phone via browser — no App Store, no Google Play.',
      android: 'Android: Chrome → menu ⋮ → "Install app"',
      ios: 'iPhone: Safari → share → "Add to Home Screen"',
    },
    ai: {
      title: 'AI explains, not just checks',
      text: 'Tap "Justify" — get the word meaning explained simply. Tap "Why wrong?" — get a breakdown of your mistake.',
    },
    footer: 'Read documentation',
  },
  de: {
    tagline: 'Deutsch für Einwanderer',
    subtitle: 'Lerne Deutsch mit intelligentem Wiederholen, Diktaten und KI-Erklärungen. Kostenlos.',
    cta: 'Kostenlos starten',
    ctaLogin: 'Schon ein Konto',
    docsLink: 'Dokumentation',
    modules: [
      { icon: '🃏', title: 'Lernkarten', desc: 'Klassische Karten mit Aussprache und SM-2 Wiederholung' },
      { icon: '🎙️', title: 'Diktat', desc: 'Höre das deutsche Wort und schreibe es auf' },
      { icon: '🗣️', title: 'Aussprache', desc: 'Sprich das Wort ins Mikrofon — das System prüft deine Aussprache', isNew: true },
      { icon: '✏️', title: 'Buchstabe ergänzen', desc: 'Rechtschreibübung: ä, ö, ü, ß — die schwierigen' },
      { icon: '💬', title: 'Sprachführer', desc: 'Speichere nützliche Phrasen und lerne sie separat' },
      { icon: '📖', title: 'Lesegerät', desc: 'Zweisprachiger Modus, klickbare Wörter und 💬 Gespräch mit Echtzeit-Übersetzung', isNew: true },
      { icon: '📊', title: 'Analytik', desc: 'Tagesfortschritt, beste Serie, Wörter im Lernen' },
      { icon: '🃏', title: 'Wortpaar', desc: 'Mini-Spiel: Ordne deutschen Wörtern ihre Übersetzungen zu. 8 Paare, Timer, 4×4 Feld', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'So fängst du an',
      items: [
        { n: '1', text: 'Registriere dich — kostenlos, keine Kreditkarte' },
        { n: '2', text: 'Ein Lehrer fügt dich hinzu oder erstelle eigene Lektionen' },
        { n: '3', text: 'Jeden Tag — 15 Minuten planmäßige Wiederholung' },
      ],
    },
    install: {
      title: 'Funktioniert als App',
      text: 'Installiere auf dem Handy über den Browser — kein App Store, kein Google Play.',
      android: 'Android: Chrome → Menü ⋮ → „App installieren"',
      ios: 'iPhone: Safari → Teilen → „Zum Startbildschirm"',
    },
    ai: {
      title: 'KI erklärt, nicht nur prüft',
      text: 'Tippe auf „Begründe" — erhalte einfache Worterklärungen. Tippe auf „Warum falsch?" — Fehleranalyse.',
    },
    footer: 'Dokumentation lesen',
  },
  uk: {
    tagline: 'Німецька для емігрантів',
    subtitle: 'Вчи німецьку з розумним повторенням, диктантами та ШІ-поясненнями. Безкоштовно.',
    cta: 'Почати безкоштовно',
    ctaLogin: 'Вже є акаунт',
    docsLink: 'Документація',
    modules: [
      { icon: '🃏', title: 'Флеш-картки', desc: 'Класичні картки з вимовою та SM-2 інтервальним повторенням' },
      { icon: '🎙️', title: 'Диктант', desc: 'Тренування на слух — слухаєш слово, пишеш його' },
      { icon: '🗣️', title: 'Вимова', desc: 'Скажи слово у мікрофон — система перевірить правильність', isNew: true },
      { icon: '✏️', title: 'Встав букву', desc: 'Вправа на правопис: ä, ö, ü, ß — типові труднощі' },
      { icon: '💬', title: 'Розмовник', desc: 'Зберігай корисні фрази з уроків та вчи їх окремо' },
      { icon: '📖', title: 'Читалка', desc: 'Двомовний режим, клікабельні слова та 💬 Розмова з перекладом мовлення в реальному часі', isNew: true },
      { icon: '📊', title: 'Аналітика', desc: 'Прогрес по днях, найкраща серія, слова у вивченні' },
      { icon: '🃏', title: 'Словопара', desc: 'Міні-гра: знайди пари німецьких слів і перекладів. 8 пар, таймер, поле 4×4', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'Як почати',
      items: [
        { n: '1', text: 'Зареєструйся — безкоштовно та без картки' },
        { n: '2', text: 'Вчитель додасть тебе до класу або створи уроки сам' },
        { n: '3', text: 'Щодня — 15 хвилин повторення за розкладом' },
      ],
    },
    install: {
      title: 'Працює як додаток',
      text: 'Встанови на телефон через браузер — без App Store, без Google Play.',
      android: 'Android: Chrome → меню ⋮ → «Встановити додаток»',
      ios: 'iPhone: Safari → поділитися → «На екран Домівки»',
    },
    ai: {
      title: 'ШІ пояснює, а не просто перевіряє',
      text: 'Натисни «Обґрунтуй» — отримай пояснення значення слова простою мовою.',
    },
    footer: 'Читати документацію',
  },
  bg: {
    tagline: 'Немски за емигранти',
    subtitle: 'Учи немски с умно повторение, диктовки и AI обяснения. Безплатно.',
    cta: 'Започни безплатно',
    ctaLogin: 'Вече имам акаунт',
    docsLink: 'Документация',
    modules: [
      { icon: '🃏', title: 'Флашкарти', desc: 'Класически карти с произношение и SM-2 интервално повторение' },
      { icon: '🎙️', title: 'Диктовка', desc: 'Слушай немската дума и я напиши' },
      { icon: '🗣️', title: 'Произношение', desc: 'Кажи думата в микрофона — системата проверява правилността', isNew: true },
      { icon: '✏️', title: 'Вмъкни буква', desc: 'Упражнение по правопис: ä, ö, ü, ß' },
      { icon: '💬', title: 'Разговорник', desc: 'Запазвай полезни фрази и ги учи отделно' },
      { icon: '📖', title: 'Четец', desc: 'Двуезичен режим, кликабелни думи и 💬 Разговор с превод в реално време', isNew: true },
      { icon: '📊', title: 'Аналитика', desc: 'Прогрес по дни, най-добра серия, думи в обучение' },
      { icon: '🃏', title: 'Двойка думи', desc: 'Мини-игра: намери двойките немски думи и преводи. 8 двойки, таймер, поле 4×4', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'Как да започнеш',
      items: [
        { n: '1', text: 'Регистрирай се — безплатно, без карта' },
        { n: '2', text: 'Учителят те добавя в клас или създаваш уроци сам' },
        { n: '3', text: 'Всеки ден — 15 минути планирано повторение' },
      ],
    },
    install: {
      title: 'Работи като приложение',
      text: 'Инсталирай на телефона чрез браузър — без App Store, без Google Play.',
      android: 'Android: Chrome → меню ⋮ → „Инсталиране на приложението"',
      ios: 'iPhone: Safari → споделяне → „Добавяне към начален екран"',
    },
    ai: {
      title: 'AI обяснява, не само проверява',
      text: 'Натисни „Обоснови" — получи обяснение на значението на думата.',
    },
    footer: 'Прочети документацията',
  },
  tr: {
    tagline: 'Göçmenler için Almanca',
    subtitle: 'Akıllı tekrar, dikte ve AI açıklamalarıyla Almanca öğren. Ücretsiz.',
    cta: 'Ücretsiz başla',
    ctaLogin: 'Zaten hesabım var',
    docsLink: 'Dokümantasyon',
    modules: [
      { icon: '🃏', title: 'Flaş Kartlar', desc: 'Telaffuzlu klasik kartlar ve SM-2 aralıklı tekrar' },
      { icon: '🎙️', title: 'Dikte', desc: 'Almanca kelimeyi dinle ve yaz' },
      { icon: '🗣️', title: 'Telaffuz', desc: 'Kelimeyi mikrofona söyle — sistem doğruluğunu kontrol eder', isNew: true },
      { icon: '✏️', title: 'Harf Doldur', desc: 'Yazım alıştırması: ä, ö, ü, ß' },
      { icon: '💬', title: 'Konuşma Kılavuzu', desc: 'Derslerden faydalı ifadeleri kaydet ve ayrıca öğren' },
      { icon: '📖', title: 'Metin Okuyucu', desc: 'İki dilli mod, tıklanabilir kelimeler ve 💬 gerçek zamanlı konuşma çevirisi', isNew: true },
      { icon: '📊', title: 'Analitik', desc: 'Günlük ilerleme, en iyi seri, öğrenilen kelimeler' },
      { icon: '🃏', title: 'Kelime Çifti', desc: 'Mini oyun: Almanca kelimelerle çevirilerini eşleştir. 8 çift, zamanlayıcı, 4×4 alan', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'Nasıl başlanır',
      items: [
        { n: '1', text: 'Kaydol — ücretsiz, kart gerekmez' },
        { n: '2', text: 'Öğretmen seni sınıfa ekler veya kendi derslerini oluştur' },
        { n: '3', text: 'Her gün — 15 dakika planlı tekrar' },
      ],
    },
    install: {
      title: 'Uygulama gibi çalışır',
      text: 'Tarayıcı üzerinden telefona yükle — App Store veya Google Play gerekmez.',
      android: 'Android: Chrome → menü ⋮ → "Uygulamayı yükle"',
      ios: 'iPhone: Safari → paylaş → "Ana Ekrana Ekle"',
    },
    ai: {
      title: 'AI açıklar, sadece kontrol etmez',
      text: '"Gerekçele" ye bas — kelime anlamını basitçe açıkla. "Neden yanlış?" — hata analizi.',
    },
    footer: 'Dokümantasyonu oku',
  },
  ar: {
    tagline: 'الألمانية للمهاجرين',
    subtitle: 'تعلم الألمانية بالتكرار الذكي والإملاء وشروحات الذكاء الاصطناعي. مجانًا.',
    cta: 'ابدأ مجانًا',
    ctaLogin: 'لديّ حساب بالفعل',
    docsLink: 'التوثيق',
    modules: [
      { icon: '🃏', title: 'بطاقات تعليمية', desc: 'بطاقات كلاسيكية مع النطق وتكرار SM-2' },
      { icon: '🎙️', title: 'الإملاء', desc: 'استمع إلى الكلمة الألمانية واكتبها' },
      { icon: '🗣️', title: 'النطق', desc: 'قل الكلمة في الميكروفون — يتحقق النظام من صحة نطقك', isNew: true },
      { icon: '✏️', title: 'أكمل الحرف', desc: 'تدريب على الإملاء: ä، ö، ü، ß' },
      { icon: '💬', title: 'كتاب المحادثة', desc: 'احفظ العبارات المفيدة من الدروس' },
      { icon: '📖', title: 'قارئ النصوص', desc: 'وضع ثنائي اللغة، كلمات قابلة للنقر، و💬 ترجمة الكلام في الوقت الفعلي', isNew: true },
      { icon: '📊', title: 'التحليلات', desc: 'التقدم اليومي، أفضل سلسلة، الكلمات قيد التعلم' },
      { icon: '🃏', title: 'أزواج الكلمات', desc: 'لعبة صغيرة: طابق الكلمات الألمانية مع ترجماتها. 8 أزواج، مؤقت، شبكة 4×4', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'كيف تبدأ',
      items: [
        { n: '1', text: 'سجّل — مجاني، لا بطاقة مطلوبة' },
        { n: '2', text: 'يضيفك المعلم إلى الفصل أو أنشئ دروسًا بنفسك' },
        { n: '3', text: 'كل يوم — 15 دقيقة من التكرار المنتظم' },
      ],
    },
    install: {
      title: 'يعمل كتطبيق',
      text: 'ثبّته على هاتفك عبر المتصفح — بدون App Store أو Google Play.',
      android: 'أندرويد: Chrome → القائمة ⋮ → "تثبيت التطبيق"',
      ios: 'آيفون: Safari → مشاركة → "إضافة إلى الشاشة الرئيسية"',
    },
    ai: {
      title: 'الذكاء الاصطناعي يشرح ولا يكتفي بالفحص',
      text: 'اضغط "برّر" — احصل على شرح بسيط لمعنى الكلمة.',
    },
    footer: 'اقرأ التوثيق',
  },
  es: {
    tagline: 'Alemán para inmigrantes',
    subtitle: 'Aprende alemán con repetición inteligente, dictados y explicaciones de IA. Gratis.',
    cta: 'Empezar gratis',
    ctaLogin: 'Ya tengo cuenta',
    docsLink: 'Documentación',
    modules: [
      { icon: '🃏', title: 'Tarjetas', desc: 'Tarjetas clásicas con pronunciación y repetición espaciada SM-2' },
      { icon: '🎙️', title: 'Dictado', desc: 'Escucha la palabra alemana y escríbela' },
      { icon: '🗣️', title: 'Pronunciación', desc: 'Di la palabra al micrófono — el sistema comprueba tu pronunciación', isNew: true },
      { icon: '✏️', title: 'Rellena la letra', desc: 'Práctica de ortografía: ä, ö, ü, ß' },
      { icon: '💬', title: 'Diccionario de frases', desc: 'Guarda frases útiles de las lecciones' },
      { icon: '📖', title: 'Lector de textos', desc: 'Modo bilingüe, palabras clicables y 💬 conversación con traducción en tiempo real', isNew: true },
      { icon: '📊', title: 'Analítica', desc: 'Progreso diario, mejor racha, palabras en aprendizaje' },
      { icon: '🃏', title: 'Par de Palabras', desc: 'Minijuego: empareja palabras alemanas con sus traducciones. 8 pares, cronómetro, campo 4×4', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'Cómo empezar',
      items: [
        { n: '1', text: 'Regístrate — es gratis, sin tarjeta' },
        { n: '2', text: 'Un profesor te añade a una clase o crea tus propias lecciones' },
        { n: '3', text: 'Cada día — 15 minutos de repetición programada' },
      ],
    },
    install: {
      title: 'Funciona como una app',
      text: 'Instálala en tu móvil desde el navegador — sin App Store ni Google Play.',
      android: 'Android: Chrome → menú ⋮ → "Instalar aplicación"',
      ios: 'iPhone: Safari → compartir → "Añadir a pantalla de inicio"',
    },
    ai: {
      title: 'La IA explica, no solo comprueba',
      text: 'Toca "Justifica" — obtén una explicación simple del significado de la palabra.',
    },
    footer: 'Leer documentación',
  },
  fr: {
    tagline: 'Allemand pour les immigrants',
    subtitle: 'Apprenez l\'allemand avec une répétition intelligente, des dictées et des explications IA. Gratuit.',
    cta: 'Commencer gratuitement',
    ctaLogin: 'J\'ai déjà un compte',
    docsLink: 'Documentation',
    modules: [
      { icon: '🃏', title: 'Cartes flash', desc: 'Cartes classiques avec prononciation et répétition espacée SM-2' },
      { icon: '🎙️', title: 'Dictée', desc: 'Écoute le mot allemand et écris-le' },
      { icon: '🗣️', title: 'Prononciation', desc: 'Dis le mot dans le microphone — le système vérifie ta prononciation', isNew: true },
      { icon: '✏️', title: 'Compléter la lettre', desc: 'Exercice d\'orthographe: ä, ö, ü, ß' },
      { icon: '💬', title: 'Guide de conversation', desc: 'Enregistre des phrases utiles des leçons' },
      { icon: '📖', title: 'Lecteur de texte', desc: 'Mode bilingue, mots cliquables et 💬 conversation avec traduction en temps réel', isNew: true },
      { icon: '📊', title: 'Analytique', desc: 'Progrès quotidien, meilleure série, mots en apprentissage' },
      { icon: '🃏', title: 'Paire de mots', desc: 'Mini-jeu: associe les mots allemands à leurs traductions. 8 paires, minuteur, grille 4×4', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'Comment commencer',
      items: [
        { n: '1', text: 'Inscris-toi — gratuit, sans carte' },
        { n: '2', text: 'Un professeur t\'ajoute à une classe ou crée tes propres leçons' },
        { n: '3', text: 'Chaque jour — 15 minutes de répétition planifiée' },
      ],
    },
    install: {
      title: 'Fonctionne comme une app',
      text: 'Installe sur ton téléphone via le navigateur — sans App Store ni Google Play.',
      android: 'Android: Chrome → menu ⋮ → «Installer l\'application»',
      ios: 'iPhone: Safari → partager → «Sur l\'écran d\'accueil»',
    },
    ai: {
      title: 'L\'IA explique, pas seulement vérifie',
      text: 'Appuie sur «Justifier» — obtiens une explication simple du sens du mot.',
    },
    footer: 'Lire la documentation',
  },
  sq: {
    tagline: 'Gjermanisht për emigrantët',
    subtitle: 'Mëso gjermanisht me përsëritje inteligjente, diktate dhe shpjegime AI. Falas.',
    cta: 'Fillo falas',
    ctaLogin: 'Kam tashmë llogari',
    docsLink: 'Dokumentacion',
    modules: [
      { icon: '🃏', title: 'Karta mësimi', desc: 'Karta klasike me shqiptim dhe përsëritje SM-2' },
      { icon: '🎙️', title: 'Diktim', desc: 'Dëgjo fjalën gjermane dhe shkruaje' },
      { icon: '🗣️', title: 'Shqiptim', desc: 'Thuaj fjalën në mikrofon — sistemi kontrollon saktësinë', isNew: true },
      { icon: '✏️', title: 'Plotëso shkronjën', desc: 'Ushtrim drejtshkrimi: ä, ö, ü, ß' },
      { icon: '💬', title: 'Udhëzues bisede', desc: 'Ruaj fraza të dobishme nga mësimet' },
      { icon: '📖', title: 'Lexues teksti', desc: 'Mënyra dysgjuhëshe, fjalë të klikueshme dhe 💬 bisedë me përkthim në kohë reale', isNew: true },
      { icon: '📊', title: 'Analitikë', desc: 'Progresi ditor, seria më e mirë, fjalët në mësim' },
      { icon: '🃏', title: 'Çift Fjalësh', desc: 'Mini-lojë: gjej çiftet e fjalëve gjermane dhe përkthimeve. 8 çifte, kohëmatës, fushë 4×4', isNew: true, link: '/game/match' },
    ],
    steps: {
      title: 'Si të fillosh',
      items: [
        { n: '1', text: 'Regjistrohu — falas, pa kartë' },
        { n: '2', text: 'Mësuesi të shton në klasë ose krijo mësime vetë' },
        { n: '3', text: 'Çdo ditë — 15 minuta përsëritje të planifikuar' },
      ],
    },
    install: {
      title: 'Funksionon si aplikacion',
      text: 'Instalo në telefon nëpërmjet shfletuesit — pa App Store apo Google Play.',
      android: 'Android: Chrome → menu ⋮ → "Instalo aplikacionin"',
      ios: 'iPhone: Safari → ndaj → "Shto në ekranin kryesor"',
    },
    ai: {
      title: 'AI shpjegon, jo vetëm kontrollon',
      text: 'Shtyp "Arsyeto" — merr shpjegim të thjeshtë të kuptimit të fjalës.',
    },
    footer: 'Lexo dokumentacionin',
  },
}

const LANGS_AVAILABLE = Object.keys(L)

export default function Landing() {
  const { lang } = useI18nStore()
  const c = L[lang] || L.en
  const isRTL = lang === 'ar'

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* Навбар */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 56,
      }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.5px' }}>
          🇩🇪 Deutsch.lernen
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LangSwitcher />
          <Link to="/login" style={{ ...navBtn, background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
            {c.ctaLogin}
          </Link>
          <Link to="/register" style={{ ...navBtn, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>
            {c.cta}
          </Link>
        </div>
      </nav>

      {/* Герой */}
      <section style={{ textAlign: 'center', padding: '72px 20px 56px', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🇩🇪</div>
        <h1 style={{
          fontSize: 'clamp(28px, 6vw, 52px)', fontWeight: 900, lineHeight: 1.15,
          margin: '0 0 20px', color: 'var(--ink)',
          letterSpacing: '-1px',
        }}>
          {c.tagline}
        </h1>
        <p style={{ fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.6, margin: '0 0 36px', maxWidth: 540, marginLeft: 'auto', marginRight: 'auto' }}>
          {c.subtitle}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" style={{
            padding: '14px 32px', borderRadius: 12, fontWeight: 700, fontSize: 16,
            background: 'var(--accent)', color: 'var(--accent-ink)', textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(201,165,74,0.35)',
            transition: 'transform .15s',
          }}>
            {c.cta} →
          </Link>
          <Link to="/docs" style={{
            padding: '14px 32px', borderRadius: 12, fontWeight: 600, fontSize: 16,
            background: 'var(--surface)', color: 'var(--ink)', textDecoration: 'none',
            border: '1px solid var(--line)',
          }}>
            {c.docsLink}
          </Link>
        </div>

        {/* Плашки языков */}
        <div style={{ marginTop: 32, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['🇷🇺 RU','🇺🇦 UK','🇩🇪 DE','🇬🇧 EN','🇧🇬 BG','🇹🇷 TR','🇸🇦 AR','🇪🇸 ES','🇫🇷 FR','🇦🇱 SQ'].map(l => (
            <span key={l} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 12,
              background: 'var(--surface-2)', color: 'var(--ink-soft)',
              border: '1px solid var(--line)',
            }}>{l}</span>
          ))}
        </div>
      </section>

      {/* Модули */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 64px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {c.modules.map((m, i) => (
            <Link to={m.link || '/docs'} key={i} style={{ textDecoration: 'none' }}>
              <div style={{
                background: m.isSoon ? 'var(--surface-2)' : 'var(--surface)',
                border: `1px solid ${m.isNew ? 'var(--accent)' : m.isSoon ? 'var(--line)' : 'var(--line)'}`,
                borderRadius: 16, padding: '20px 20px 18px',
                transition: 'border-color .2s, transform .15s',
                cursor: m.isSoon ? 'default' : 'pointer', position: 'relative', overflow: 'hidden',
                opacity: m.isSoon ? 0.75 : 1,
              }}
                onMouseEnter={e => { if (!m.isSoon) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = m.isNew ? 'var(--accent)' : 'var(--line)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                {m.isNew && (
                  <span style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.5px',
                    padding: '2px 7px', borderRadius: 20,
                  }}>NEW</span>
                )}
                {m.isSoon && (
                  <span style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'var(--surface-2)', color: 'var(--ink-soft)',
                    border: '1px solid var(--line)',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
                    padding: '2px 7px', borderRadius: 20,
                  }}>СКОРО</span>
                )}
                <div style={{ fontSize: 32, marginBottom: 10 }}>{m.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--ink)' }}>{m.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ИИ объясняет */}
      <section style={{
        maxWidth: 900, margin: '0 auto 48px', padding: '0 16px',
      }}>
        <div style={{
          background: 'var(--accent-soft)', border: '1px solid var(--accent)',
          borderRadius: 20, padding: '28px 32px',
          display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 40, flexShrink: 0 }}>💡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: 'var(--ink)' }}>{c.ai.title}</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{c.ai.text}</div>
          </div>
        </div>
      </section>

      {/* Блок для учителей — привлекаем преподавателей */}
      {c.teacher && (
        <section style={{ maxWidth: 900, margin: '0 auto 56px', padding: '0 16px' }}>
          <div style={{
            background: 'var(--surface)', border: '2px solid var(--accent)',
            borderRadius: 20, padding: '28px 32px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 34 }}>🧑‍🏫</span>
              <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--ink)' }}>{c.teacher.title}</div>
            </div>
            <div style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 20 }}>{c.teacher.subtitle}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {c.teacher.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{it.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{it.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{it.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Как начать */}
      <section style={{ maxWidth: 640, margin: '0 auto 64px', padding: '0 20px' }}>
        <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, marginBottom: 32, color: 'var(--ink)' }}>
          {c.steps.title}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {c.steps.items.map((step, i) => (
            <div key={i} style={{
              display: 'flex', gap: 16, alignItems: 'flex-start',
              background: 'var(--surface)', borderRadius: 14,
              padding: '18px 20px', border: '1px solid var(--line)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 16, flexShrink: 0,
              }}>{step.n}</div>
              <div style={{ paddingTop: 6, fontSize: 15, color: 'var(--ink)', lineHeight: 1.5 }}>{step.text}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <Link to="/register" style={{
            display: 'inline-block', padding: '13px 40px', borderRadius: 12,
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontWeight: 700, fontSize: 16, textDecoration: 'none',
          }}>
            {c.cta} →
          </Link>
        </div>
      </section>

      {/* Алфавит с произношением */}
      <section style={{ maxWidth: 900, margin: '0 auto 48px', padding: '0 16px' }}>
        <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 22, marginBottom: 6, color: 'var(--ink)' }}>
          🔤 Алфавит с произношением
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 14, marginBottom: 20 }}>
          Нажми на букву — услышишь как она называется по-немецки
        </p>
        <AlphabetPreview />
      </section>

      {/* Установка как PWA */}
      <section style={{
        maxWidth: 720, margin: '0 auto 64px', padding: '0 16px',
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 20, padding: '28px 28px 24px',
        }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
            <span style={{ fontSize: 36, flexShrink: 0 }}>📲</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6, color: 'var(--ink)' }}>{c.install.title}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{c.install.text}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={installPill}>🤖 {c.install.android}</div>
            <div style={installPill}>🍎 {c.install.ios}</div>
          </div>
        </div>
      </section>

      {/* Футер */}
      <footer style={{
        borderTop: '1px solid var(--line)', textAlign: 'center',
        padding: '28px 16px 40px', color: 'var(--ink-soft)', fontSize: 14,
      }}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/docs" style={{ color: 'var(--accent)', fontWeight: 600 }}>{c.footer} →</Link>
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/login"    style={{ color: 'var(--ink-soft)' }}>Login</Link>
          <Link to="/register" style={{ color: 'var(--ink-soft)' }}>Register</Link>
          <Link to="/docs"     style={{ color: 'var(--ink-soft)' }}>Docs</Link>
          <Link to="/privacy"  style={{ color: 'var(--ink-soft)' }}>Privacy</Link>
          <Link to="/terms"    style={{ color: 'var(--ink-soft)' }}>Terms</Link>
          <Link to="/cookies"  style={{ color: 'var(--ink-soft)' }}>Cookies</Link>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.5 }}>
          © 2026 Deutsch.lernen · translate.seoshkin.tools
        </div>
      </footer>
    </div>
  )
}

const navBtn = {
  padding: '7px 14px', borderRadius: 8, fontSize: 13,
  fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const installPill = {
  background: 'var(--surface-2)', border: '1px solid var(--line)',
  borderRadius: 10, padding: '8px 14px', fontSize: 13,
  color: 'var(--ink-soft)', lineHeight: 1.5, flex: '1 1 220px',
}
