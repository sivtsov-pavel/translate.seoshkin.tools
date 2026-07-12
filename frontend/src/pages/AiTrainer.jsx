import { useState, useRef, useEffect } from 'react'
import { api } from '../api/client.js'
import { speak } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'

// Локализованные строки UI тренера — все языки интерфейса
const STR = {
  uk: { title: '🤖 AI тренер', subtitle: 'Живі розмовні тренування з AI-наставником. Обери персонажа та тему.', persona: 'Персонаж', topic: 'Тема розмови', start: 'Почати розмову →', change: '← Змінити', typing: '⏳ Відповідає...', placeholder: 'Напиши по-німецьки або по-українськи...', hint: 'Enter — надіслати · Shift+Enter — новий рядок', connErr: 'Помилка з\'єднання. Спробуй ще раз.' },
  ru: { title: '🤖 AI тренер', subtitle: 'Живые разговорные тренировки с AI-наставником. Выбери персонажа и тему.', persona: 'Персонаж', topic: 'Тема разговора', start: 'Начать разговор →', change: '← Сменить', typing: '⏳ Отвечает...', placeholder: 'Напиши по-немецки или по-русски...', hint: 'Enter — отправить · Shift+Enter — новая строка', connErr: 'Ошибка соединения. Попробуй ещё раз.' },
  en: { title: '🤖 AI Trainer', subtitle: 'Live conversation practice with an AI mentor. Choose a character and a topic.', persona: 'Character', topic: 'Topic', start: 'Start conversation →', change: '← Change', typing: '⏳ Replying...', placeholder: 'Write in German or English...', hint: 'Enter — send · Shift+Enter — new line', connErr: 'Connection error. Try again.' },
  de: { title: '🤖 KI-Trainer', subtitle: 'Lebendiges Gesprächstraining mit einem KI-Mentor. Wähle einen Charakter und ein Thema.', persona: 'Charakter', topic: 'Thema', start: 'Gespräch starten →', change: '← Ändern', typing: '⏳ Antwortet...', placeholder: 'Schreibe auf Deutsch...', hint: 'Enter — senden · Shift+Enter — neue Zeile', connErr: 'Verbindungsfehler. Versuche es erneut.' },
  bg: { title: '🤖 AI треньор', subtitle: 'Живи разговорни тренировки с AI-наставник. Избери герой и тема.', persona: 'Герой', topic: 'Тема', start: 'Започни разговор →', change: '← Смени', typing: '⏳ Отговаря...', placeholder: 'Пиши на немски или български...', hint: 'Enter — прати · Shift+Enter — нов ред', connErr: 'Грешка във връзката. Опитай пак.' },
  tr: { title: '🤖 AI Eğitmen', subtitle: 'AI mentoruyla canlı konuşma pratiği. Bir karakter ve konu seç.', persona: 'Karakter', topic: 'Konu', start: 'Konuşmaya başla →', change: '← Değiştir', typing: '⏳ Yanıtlıyor...', placeholder: 'Almanca veya Türkçe yaz...', hint: 'Enter — gönder · Shift+Enter — yeni satır', connErr: 'Bağlantı hatası. Tekrar dene.' },
  ar: { title: '🤖 مدرب الذكاء الاصطناعي', subtitle: 'تدريبات محادثة حية مع مرشد ذكاء اصطناعي. اختر شخصية وموضوعًا.', persona: 'الشخصية', topic: 'الموضوع', start: 'ابدأ المحادثة →', change: '← تغيير', typing: '⏳ يرد...', placeholder: 'اكتب بالألمانية أو العربية...', hint: 'Enter — إرسال · Shift+Enter — سطر جديد', connErr: 'خطأ في الاتصال. حاول مرة أخرى.' },
  es: { title: '🤖 Entrenador IA', subtitle: 'Práctica de conversación en vivo con un mentor de IA. Elige un personaje y un tema.', persona: 'Personaje', topic: 'Tema', start: 'Iniciar conversación →', change: '← Cambiar', typing: '⏳ Respondiendo...', placeholder: 'Escribe en alemán o español...', hint: 'Enter — enviar · Shift+Enter — nueva línea', connErr: 'Error de conexión. Inténtalo de nuevo.' },
  fr: { title: '🤖 Coach IA', subtitle: 'Entraînement à la conversation en direct avec un mentor IA. Choisis un personnage et un thème.', persona: 'Personnage', topic: 'Thème', start: 'Commencer la conversation →', change: '← Changer', typing: '⏳ Répond...', placeholder: 'Écris en allemand ou en français...', hint: 'Entrée — envoyer · Maj+Entrée — nouvelle ligne', connErr: 'Erreur de connexion. Réessaie.' },
  sq: { title: '🤖 Trajneri AI', subtitle: 'Praktikë bisede e drejtpërdrejtë me një mentor AI. Zgjidh një personazh dhe një temë.', persona: 'Personazhi', topic: 'Tema', start: 'Fillo bisedën →', change: '← Ndrysho', typing: '⏳ Po përgjigjet...', placeholder: 'Shkruaj në gjermanisht ose shqip...', hint: 'Enter — dërgo · Shift+Enter — rresht i ri', connErr: 'Gabim lidhjeje. Provo përsëri.' },
}
const uiStr = (lang) => STR[lang] || STR.uk
// Достаём локализованное значение из {uk, ru}-карты
const loc = (obj, lang) => (obj && (obj[lang] || obj.uk)) || ''

const CHARACTERS = [
  { id: 'lena',  emoji: '🧑‍🏫', name: 'Лена',  color: '#4A7FA5', role: { uk: 'Вчителька з Берліна', ru: 'Учительница из Берлина', en: 'Teacher from Berlin', de: 'Lehrerin aus Berlin', bg: 'Учителка от Берлин', tr: 'Berlin\'den öğretmen', ar: 'معلمة من برلين', es: 'Profesora de Berlín', fr: 'Professeure de Berlin', sq: 'Mësuese nga Berlini' } },
  { id: 'max',   emoji: '☕',    name: 'Макс',   color: '#8B5E3C', role: { uk: 'Бариста в кав\'ярні', ru: 'Бариста в кафе', en: 'Barista in a café', de: 'Barista im Café', bg: 'Бариста в кафене', tr: 'Kafede barista', ar: 'باريستا في مقهى', es: 'Barista en una cafetería', fr: 'Barista dans un café', sq: 'Barist në kafe' } },
  { id: 'hanna', emoji: '🛒',   name: 'Ганна',  color: '#5A9E6E', role: { uk: 'Продавчиня в магазині', ru: 'Продавщица в магазине', en: 'Shop assistant', de: 'Verkäuferin im Laden', bg: 'Продавачка в магазин', tr: 'Mağaza görevlisi', ar: 'بائعة في متجر', es: 'Dependienta de tienda', fr: 'Vendeuse en magasin', sq: 'Shitëse në dyqan' } },
  { id: 'otto',  emoji: '🏨',   name: 'Отто',   color: '#7B5EA7', role: { uk: 'Портьє в готелі', ru: 'Портье в отеле', en: 'Hotel receptionist', de: 'Portier im Hotel', bg: 'Рецепционист в хотел', tr: 'Otel resepsiyonisti', ar: 'موظف استقبال فندق', es: 'Recepcionista de hotel', fr: 'Réceptionniste d\'hôtel', sq: 'Recepsionist hoteli' } },
  { id: 'hr',    emoji: '💼',   name: 'Фрау Вебер', color: '#5A6B8C', role: { uk: 'HR — співбесіда', ru: 'HR — собеседование', en: 'HR — interview', de: 'HR — Vorstellungsgespräch', bg: 'HR — интервю', tr: 'İK — mülakat', ar: 'موارد بشرية — مقابلة', es: 'RRHH — entrevista', fr: 'RH — entretien', sq: 'HR — intervistë' } },
]

const SCENARIOS = [
  { id: 'intro',     label: { uk: '👋 Знайомство', ru: '👋 Знакомство', en: '👋 Introduction', de: '👋 Kennenlernen', bg: '👋 Запознанство', tr: '👋 Tanışma', ar: '👋 التعارف', es: '👋 Presentación', fr: '👋 Rencontre', sq: '👋 Njohje' } },
  { id: 'cafe',      label: { uk: '☕ У кав\'ярні', ru: '☕ В кафе', en: '☕ At the café', de: '☕ Im Café', bg: '☕ В кафенето', tr: '☕ Kafede', ar: '☕ في المقهى', es: '☕ En la cafetería', fr: '☕ Au café', sq: '☕ Në kafe' } },
  { id: 'shopping',  label: { uk: '🛒 Покупки', ru: '🛒 Покупки', en: '🛒 Shopping', de: '🛒 Einkaufen', bg: '🛒 Пазаруване', tr: '🛒 Alışveriş', ar: '🛒 التسوق', es: '🛒 Compras', fr: '🛒 Courses', sq: '🛒 Blerje' } },
  { id: 'hotel',     label: { uk: '🏨 Готель', ru: '🏨 Отель', en: '🏨 Hotel', de: '🏨 Hotel', bg: '🏨 Хотел', tr: '🏨 Otel', ar: '🏨 الفندق', es: '🏨 Hotel', fr: '🏨 Hôtel', sq: '🏨 Hotel' } },
  { id: 'direction', label: { uk: '🗺️ Орієнтування', ru: '🗺️ Ориентирование', en: '🗺️ Directions', de: '🗺️ Orientierung', bg: '🗺️ Ориентиране', tr: '🗺️ Yön bulma', ar: '🗺️ الاتجاهات', es: '🗺️ Orientación', fr: '🗺️ Orientation', sq: '🗺️ Orientim' } },
  { id: 'free',      label: { uk: '💬 Вільна бесіда', ru: '💬 Свободная беседа', en: '💬 Free talk', de: '💬 Freies Gespräch', bg: '💬 Свободен разговор', tr: '💬 Serbest sohbet', ar: '💬 محادثة حرة', es: '💬 Charla libre', fr: '💬 Discussion libre', sq: '💬 Bisedë e lirë' } },
  { id: 'interview_it',    label: { uk: '💻 Співбесіда: IT-агентство', ru: '💻 Собеседование: IT-агентство', en: '💻 Interview: IT agency', de: '💻 Bewerbung: IT-Agentur', bg: '💻 Интервю: IT агенция', tr: '💻 Mülakat: IT ajansı', ar: '💻 مقابلة: وكالة IT', es: '💻 Entrevista: agencia IT', fr: '💻 Entretien : agence IT', sq: '💻 Intervistë: agjenci IT' } },
  { id: 'interview_clean', label: { uk: '🧹 Співбесіда: клінінг', ru: '🧹 Собеседование: клининг', en: '🧹 Interview: cleaning', de: '🧹 Bewerbung: Reinigung', bg: '🧹 Интервю: почистване', tr: '🧹 Mülakat: temizlik', ar: '🧹 مقابلة: تنظيف', es: '🧹 Entrevista: limpieza', fr: '🧹 Entretien : nettoyage', sq: '🧹 Intervistë: pastrim' } },
  { id: 'interview_food',  label: { uk: '🍽️ Співбесіда: кафе/ресторан', ru: '🍽️ Собеседование: кафе/ресторан', en: '🍽️ Interview: café/restaurant', de: '🍽️ Bewerbung: Café/Restaurant', bg: '🍽️ Интервю: кафе/ресторант', tr: '🍽️ Mülakat: kafe/restoran', ar: '🍽️ مقابلة: مقهى/مطعم', es: '🍽️ Entrevista: café/restaurante', fr: '🍽️ Entretien : café/restaurant', sq: '🍽️ Intervistë: kafe/restorant' } },
  { id: 'interview_hotel', label: { uk: '🛎️ Співбесіда: готель', ru: '🛎️ Собеседование: отель', en: '🛎️ Interview: hotel', de: '🛎️ Bewerbung: Hotel', bg: '🛎️ Интервю: хотел', tr: '🛎️ Mülakat: otel', ar: '🛎️ مقابلة: فندق', es: '🛎️ Entrevista: hotel', fr: '🛎️ Entretien : hôtel', sq: '🛎️ Intervistë: hotel' } },
]

const STARTER_PHRASES = {
  lena:  { intro: 'Hallo! Wie heißt du?', cafe: 'Guten Morgen! Möchtest du Deutsch lernen?', shopping: 'Was möchtest du kaufen?', hotel: 'Willkommen! Wie kann ich helfen?', direction: 'Wo möchtest du hin?', free: 'Hallo! Wie geht es dir?' },
  max:   { intro: 'Hallo! Was möchtest du trinken?', cafe: 'Guten Tag! Was darf es sein?', shopping: 'Hallo! Kann ich helfen?', hotel: 'Willkommen!', direction: 'Guten Tag!', free: 'Hey! Was möchtest du?' },
  hanna: { intro: 'Hallo! Willkommen im Supermarkt!', cafe: 'Hallo!', shopping: 'Guten Tag! Suchen Sie etwas?', hotel: 'Hallo!', direction: 'Guten Tag!', free: 'Hallo! Wie kann ich helfen?' },
  otto:  { intro: 'Guten Tag! Willkommen im Hotel!', cafe: 'Guten Morgen!', shopping: 'Hallo!', hotel: 'Guten Tag! Haben Sie eine Reservierung?', direction: 'Guten Tag! Wie kann ich helfen?', free: 'Willkommen! Was wünschen Sie?' },
  hr:    {
    intro: 'Guten Tag! Schön, dass Sie da sind. Erzählen Sie mir von sich.',
    interview_it:    'Guten Tag! Schön, dass Sie da sind. Erzählen Sie mir von sich.',
    interview_clean: 'Guten Tag! Bitte setzen Sie sich. Haben Sie Erfahrung mit Reinigung?',
    interview_food:  'Guten Tag! Willkommen. Haben Sie schon in einem Café oder Restaurant gearbeitet?',
    interview_hotel: 'Guten Tag! Schön, Sie kennenzulernen. Warum möchten Sie im Hotel arbeiten?',
    free:  'Guten Tag! Wie kann ich Ihnen helfen?',
  },
}

function BubbleAI({ msg, onSpeak }) {
  const char = CHARACTERS.find(c => c.id === msg.character) || CHARACTERS[0]
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: char.color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0, border: `2px solid ${char.color}44`,
      }}>
        {char.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: 'var(--surface-2)', borderRadius: '4px 16px 16px 16px',
          padding: '10px 14px', fontSize: 15, lineHeight: 1.55,
          border: '1px solid var(--line)',
        }}>
          <span style={{ fontWeight: 600 }}>{msg.reply}</span>
          <button onClick={() => onSpeak(msg.reply)} title="Прослухати"
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, opacity: 0.6, verticalAlign: 'middle' }}>
            🔊
          </button>
        </div>
        {msg.translation && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4, paddingLeft: 4 }}>
            {msg.translation}
          </div>
        )}
        {msg.correction && (
          <div style={{
            marginTop: 6, padding: '6px 10px', borderRadius: 8,
            background: 'rgba(220,140,60,0.1)', border: '1px solid rgba(220,140,60,0.25)',
            fontSize: 12, color: 'var(--ink)',
          }}>
            ✏️ {msg.correction}
          </div>
        )}
      </div>
    </div>
  )
}

function BubbleUser({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
      <div style={{
        maxWidth: '75%', background: 'var(--accent)', color: 'var(--accent-ink)',
        borderRadius: '16px 4px 16px 16px', padding: '10px 14px',
        fontSize: 15, lineHeight: 1.55,
      }}>
        {text}
      </div>
    </div>
  )
}

export default function AiTrainer() {
  const [step, setStep] = useState('select') // 'select' | 'chat'
  const [character, setCharacter] = useState('lena')
  const [scenario, setScenario] = useState('intro')
  const [messages, setMessages] = useState([]) // [{role, content, reply, correction, translation, character}]
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [memoryHint, setMemoryHint] = useState('')
  const bottomRef = useRef()
  const inputRef = useRef()
  const lang = useI18nStore(s => s.lang)
  const S = uiStr(lang)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Держим актуальный sessionId для авто-завершения при уходе со страницы
  const sessionIdRef = useRef(null)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  // Авто-finish при размонтировании (навигация из чата) — чтобы память
  // обновлялась, даже если пользователь не нажал «Сменить»
  useEffect(() => () => {
    if (sessionIdRef.current) {
      const userLang = localStorage.getItem('lang') || 'uk'
      api.post(`/ai-trainer/sessions/${sessionIdRef.current}/finish`, { userLang }).catch(() => {})
    }
  }, [])

  const startSession = async () => {
    const starter = STARTER_PHRASES[character]?.[scenario]
      || (scenario.startsWith('interview') ? 'Guten Tag! Setzen Sie sich bitte. Erzählen Sie mir von sich.' : 'Hallo!')
    setMessages([{ role: 'ai', reply: starter, translation: null, correction: null, character }])
    setMemoryHint('')
    setStep('chat')
    if (starter) speak(starter, 'de-DE')  // тренер приветствует голосом
    setTimeout(() => inputRef.current?.focus(), 100)
    // Создаём серверную сессию (для памяти между сессиями). Если упадёт —
    // тренер всё равно работает через stateless-фолбэк в sendMessage.
    try {
      const res = await api.post('/ai-trainer/sessions', { character, scenario, starter })
      setSessionId(res.session_id)
      if (res.memory?.summary_text) setMemoryHint(res.memory.summary_text)
    } catch {
      setSessionId(null)
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError('')

    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setLoading(true)

    // Формуємо history для OpenAI (тільки role+content)
    const history = []
    for (const m of messages) {
      if (m.role === 'ai') history.push({ role: 'assistant', content: m.reply })
      else if (m.role === 'user') history.push({ role: 'user', content: m.content })
    }
    history.push({ role: 'user', content: text })

    const userLang = localStorage.getItem('lang') || 'uk'
    try {
      // С сессией сервер сам держит историю и память; иначе — stateless-фолбэк
      const result = sessionId
        ? await api.post(`/ai-trainer/sessions/${sessionId}/message`, { text, userLang })
        : await api.post('/ai-trainer/chat', { messages: history, character, scenario, userLang })
      setMessages(prev => [...prev, {
        role: 'ai',
        reply: result.reply,
        translation: result.translation,
        correction: result.correction !== 'null' ? result.correction : null,
        character,
      }])
      // Тренер отвечает голосом (немецкий) — озвучиваем реплику автоматически
      if (result.reply) speak(result.reply, 'de-DE')
    } catch (e) {
      setError(S.connErr)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleSpeak = (text) => {
    speak(text, 'de-DE')
  }

  const resetSession = () => {
    // Завершаем сессию — сервер сгенерит отчёт и обновит память (не ждём ответа)
    if (sessionId) {
      const userLang = localStorage.getItem('lang') || 'uk'
      api.post(`/ai-trainer/sessions/${sessionId}/finish`, { userLang }).catch(() => {})
    }
    setSessionId(null)
    setMemoryHint('')
    setMessages([])
    setStep('select')
    setShowSummary(false)
  }

  const char = CHARACTERS.find(c => c.id === character)

  if (step === 'select') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 40px' }}>
        <h1 style={{ marginBottom: 4, fontSize: 22 }}>{S.title}</h1>
        <p style={{ color: 'var(--ink-soft)', marginBottom: 28, fontSize: 14 }}>
          {S.subtitle}
        </p>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: 12 }}>
            {S.persona}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CHARACTERS.map(c => (
              <button key={c.id} onClick={() => setCharacter(c.id)} style={{
                padding: '14px 16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${character === c.id ? c.color : 'var(--line)'}`,
                background: character === c.id ? c.color + '18' : 'var(--surface-2)',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>{c.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{loc(c.role, lang)}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: 12 }}>
            {S.topic}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SCENARIOS.map(s => (
              <button key={s.id} onClick={() => setScenario(s.id)} style={{
                padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 14,
                border: `1.5px solid ${scenario === s.id ? 'var(--accent)' : 'var(--line)'}`,
                background: scenario === s.id ? 'var(--accent)' : 'var(--surface-2)',
                color: scenario === s.id ? 'var(--accent-ink)' : 'var(--ink)',
                fontWeight: scenario === s.id ? 600 : 400,
              }}>
                {loc(s.label, lang)}
              </button>
            ))}
          </div>
        </div>

        <button onClick={startSession} style={{
          width: '100%', padding: '14px 24px', borderRadius: 14, border: 'none',
          background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16,
          fontWeight: 700, cursor: 'pointer',
        }}>
          {S.start}
        </button>
      </div>
    )
  }

  return (
    <div className="full-page-layout" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 700, margin: '0 auto', width: '100%' }}>
      {/* Хедер сесії */}
      <div style={{
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: char.color + '22', border: `2px solid ${char.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>
          {char.emoji}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{char.name} — {loc(char.role, lang)}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {loc(SCENARIOS.find(s => s.id === scenario)?.label, lang)}
          </div>
        </div>
        <button onClick={resetSession} style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)',
          background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13, color: 'var(--ink-soft)',
        }}>
          {S.change}
        </button>
      </div>

      {/* Баннер «тренер помнит» — из накопленной памяти (§3 ТЗ) */}
      {memoryHint && (
        <div style={{
          margin: '8px 16px 0', padding: '8px 12px', borderRadius: 10,
          background: 'var(--accent-soft)', border: '1px solid var(--line)',
          fontSize: 12, color: 'var(--ink-soft)', display: 'flex', gap: 6, alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0 }}>🧠</span>
          <span>{memoryHint}</span>
        </div>
      )}

      {/* Повідомлення */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messages.map((m, i) => (
          m.role === 'ai'
            ? <BubbleAI key={i} msg={m} onSpeak={handleSpeak} />
            : <BubbleUser key={i} text={m.content} />
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: char.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{char.emoji}</div>
            <div style={{ background: 'var(--surface-2)', borderRadius: '4px 16px 16px 16px', padding: '12px 16px', border: '1px solid var(--line)', color: 'var(--ink-soft)', fontSize: 14 }}>
              <span style={{ animation: 'pulse 1s infinite' }}>{S.typing}</span>
            </div>
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Введення */}
      <div style={{ padding: '10px 16px 16px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={S.placeholder}
            rows={1}
            style={{
              flex: 1, resize: 'none', borderRadius: 12, padding: '10px 14px',
              fontSize: 15, lineHeight: 1.5, border: '1.5px solid var(--line)',
              background: 'var(--surface)', color: 'var(--ink)',
              maxHeight: 120, overflowY: 'auto',
              fontFamily: 'inherit',
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              width: 42, height: 42, borderRadius: 12, border: 'none',
              background: input.trim() && !loading ? 'var(--accent)' : 'var(--line)',
              color: 'var(--accent-ink)', cursor: input.trim() && !loading ? 'pointer' : 'default',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ➤
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, textAlign: 'center' }}>
          {S.hint}
        </div>
      </div>
      </div>
    </div>
  )
}
