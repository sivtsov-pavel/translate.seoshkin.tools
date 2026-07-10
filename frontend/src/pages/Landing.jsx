import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18nStore } from '../store/i18n.js'
import LangSwitcher from '../components/LangSwitcher.jsx'

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
      { icon: '✏️', title: 'Вставь букву', desc: 'Упражнение на правописание: ä, ö, ü, ß — частые трудности' },
      { icon: '💬', title: 'Разговорник', desc: 'Сохраняй полезные фразы из уроков и учи их отдельно' },
      { icon: '📖', title: 'Читалка', desc: 'Немецкие тексты с переводом слов по клику и ИИ-разбором' },
      { icon: '📊', title: 'Аналитика', desc: 'Прогресс по дням, лучшая серия, слова в изучении' },
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
      { icon: '✏️', title: 'Letter Fill', desc: 'Spelling practice: ä, ö, ü, ß — the tricky ones' },
      { icon: '💬', title: 'Phrasebook', desc: 'Save useful phrases from lessons and study them separately' },
      { icon: '📖', title: 'Text Reader', desc: 'German texts with click-to-translate and AI analysis' },
      { icon: '📊', title: 'Analytics', desc: 'Daily progress, best streaks, words in learning' },
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
      { icon: '✏️', title: 'Buchstabe ergänzen', desc: 'Rechtschreibübung: ä, ö, ü, ß — die schwierigen' },
      { icon: '💬', title: 'Sprachführer', desc: 'Speichere nützliche Phrasen und lerne sie separat' },
      { icon: '📖', title: 'Lesegerät', desc: 'Deutsche Texte mit Klick-Übersetzung und KI-Analyse' },
      { icon: '📊', title: 'Analytik', desc: 'Tagesfortschritt, beste Serie, Wörter im Lernen' },
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
      { icon: '✏️', title: 'Встав букву', desc: 'Вправа на правопис: ä, ö, ü, ß — типові труднощі' },
      { icon: '💬', title: 'Розмовник', desc: 'Зберігай корисні фрази з уроків та вчи їх окремо' },
      { icon: '📖', title: 'Читалка', desc: 'Німецькі тексти з перекладом за кліком та ШІ-розбором' },
      { icon: '📊', title: 'Аналітика', desc: 'Прогрес по днях, найкраща серія, слова у вивченні' },
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
      { icon: '✏️', title: 'Вмъкни буква', desc: 'Упражнение по правопис: ä, ö, ü, ß' },
      { icon: '💬', title: 'Разговорник', desc: 'Запазвай полезни фрази и ги учи отделно' },
      { icon: '📖', title: 'Четец', desc: 'Немски текстове с превод при клик и AI анализ' },
      { icon: '📊', title: 'Аналитика', desc: 'Прогрес по дни, най-добра серия, думи в обучение' },
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
      { icon: '✏️', title: 'Harf Doldur', desc: 'Yazım alıştırması: ä, ö, ü, ß' },
      { icon: '💬', title: 'Konuşma Kılavuzu', desc: 'Derslerden faydalı ifadeleri kaydet ve ayrıca öğren' },
      { icon: '📖', title: 'Metin Okuyucu', desc: 'Tıklamayla çeviri ve AI analiziyle Almanca metinler' },
      { icon: '📊', title: 'Analitik', desc: 'Günlük ilerleme, en iyi seri, öğrenilen kelimeler' },
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
      { icon: '✏️', title: 'أكمل الحرف', desc: 'تدريب على الإملاء: ä، ö، ü، ß' },
      { icon: '💬', title: 'كتاب المحادثة', desc: 'احفظ العبارات المفيدة من الدروس' },
      { icon: '📖', title: 'قارئ النصوص', desc: 'نصوص ألمانية مع ترجمة بالنقر وتحليل الذكاء الاصطناعي' },
      { icon: '📊', title: 'التحليلات', desc: 'التقدم اليومي، أفضل سلسلة، الكلمات قيد التعلم' },
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
      { icon: '✏️', title: 'Rellena la letra', desc: 'Práctica de ortografía: ä, ö, ü, ß' },
      { icon: '💬', title: 'Diccionario de frases', desc: 'Guarda frases útiles de las lecciones' },
      { icon: '📖', title: 'Lector de textos', desc: 'Textos alemanes con traducción al clic y análisis IA' },
      { icon: '📊', title: 'Analítica', desc: 'Progreso diario, mejor racha, palabras en aprendizaje' },
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
      { icon: '✏️', title: 'Compléter la lettre', desc: 'Exercice d\'orthographe: ä, ö, ü, ß' },
      { icon: '💬', title: 'Guide de conversation', desc: 'Enregistre des phrases utiles des leçons' },
      { icon: '📖', title: 'Lecteur de texte', desc: 'Textes allemands avec traduction au clic et analyse IA' },
      { icon: '📊', title: 'Analytique', desc: 'Progrès quotidien, meilleure série, mots en apprentissage' },
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
      { icon: '✏️', title: 'Plotëso shkronjën', desc: 'Ushtrim drejtshkrimi: ä, ö, ü, ß' },
      { icon: '💬', title: 'Udhëzues bisede', desc: 'Ruaj fraza të dobishme nga mësimet' },
      { icon: '📖', title: 'Lexues teksti', desc: 'Tekste gjermane me përkthim me klik dhe analizë AI' },
      { icon: '📊', title: 'Analitikë', desc: 'Progresi ditor, seria më e mirë, fjalët në mësim' },
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
            <Link to="/docs" key={i} style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 16, padding: '20px 20px 18px',
                transition: 'border-color .2s, transform .15s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
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
          <Link to="/login" style={{ color: 'var(--ink-soft)' }}>Login</Link>
          <Link to="/register" style={{ color: 'var(--ink-soft)' }}>Register</Link>
          <Link to="/docs" style={{ color: 'var(--ink-soft)' }}>Docs</Link>
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
