import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { speak, speakWithEvents, cancel as cancelSpeak } from '../hooks/useSpeech.jsx'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.jsx'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'

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

// Строки экрана отчёта и истории сессий
const RSTR = {
  ru: { finish: 'Завершить', reportTitle: 'Итог диалога', replies: 'реплик', mistakes: 'Работа над ошибками', noMistakes: 'Без ошибок — отлично! 🎉', again: 'Ещё раз', toStart: 'К выбору', history: 'История', empty: 'Пока нет диалогов', was: 'было', became: 'стало' },
  uk: { finish: 'Завершити', reportTitle: 'Підсумок діалогу', replies: 'реплік', mistakes: 'Робота над помилками', noMistakes: 'Без помилок — чудово! 🎉', again: 'Ще раз', toStart: 'До вибору', history: 'Історія', empty: 'Поки немає діалогів', was: 'було', became: 'стало' },
  en: { finish: 'Finish', reportTitle: 'Session summary', replies: 'replies', mistakes: 'Work on mistakes', noMistakes: 'No mistakes — great! 🎉', again: 'Again', toStart: 'Back', history: 'History', empty: 'No sessions yet', was: 'was', became: 'correct' },
  de: { finish: 'Beenden', reportTitle: 'Zusammenfassung', replies: 'Antworten', mistakes: 'Fehler bearbeiten', noMistakes: 'Keine Fehler — super! 🎉', again: 'Nochmal', toStart: 'Zurück', history: 'Verlauf', empty: 'Noch keine Sitzungen', was: 'war', became: 'richtig' },
  bg: { finish: 'Завърши', reportTitle: 'Обобщение', replies: 'реплики', mistakes: 'Работа върху грешките', noMistakes: 'Без грешки — чудесно! 🎉', again: 'Пак', toStart: 'Назад', history: 'История', empty: 'Още няма сесии', was: 'беше', became: 'правилно' },
  tr: { finish: 'Bitir', reportTitle: 'Özet', replies: 'yanıt', mistakes: 'Hatalar üzerine çalışma', noMistakes: 'Hata yok — harika! 🎉', again: 'Tekrar', toStart: 'Geri', history: 'Geçmiş', empty: 'Henüz oturum yok', was: 'yanlış', became: 'doğru' },
  ar: { finish: 'إنهاء', reportTitle: 'ملخص الجلسة', replies: 'ردود', mistakes: 'العمل على الأخطاء', noMistakes: 'لا أخطاء — رائع! 🎉', again: 'مرة أخرى', toStart: 'رجوع', history: 'السجل', empty: 'لا توجد جلسات بعد', was: 'كان', became: 'الصحيح' },
  es: { finish: 'Terminar', reportTitle: 'Resumen', replies: 'respuestas', mistakes: 'Trabajo sobre errores', noMistakes: 'Sin errores — ¡genial! 🎉', again: 'Otra vez', toStart: 'Volver', history: 'Historial', empty: 'Aún no hay sesiones', was: 'era', became: 'correcto' },
  fr: { finish: 'Terminer', reportTitle: 'Résumé', replies: 'réponses', mistakes: 'Travail sur les erreurs', noMistakes: 'Aucune erreur — super ! 🎉', again: 'Encore', toStart: 'Retour', history: 'Historique', empty: 'Aucune session', was: 'était', became: 'correct' },
  sq: { finish: 'Përfundo', reportTitle: 'Përmbledhje', replies: 'përgjigje', mistakes: 'Puna me gabimet', noMistakes: 'Pa gabime — shkëlqyeshëm! 🎉', again: 'Përsëri', toStart: 'Kthehu', history: 'Historiku', empty: 'Ende asnjë seancë', was: 'ishte', became: 'saktë' },
}
const reportStr = (lang) => RSTR[lang] || RSTR.en

// Строки голосового режима (Gemini-стиль)
const VSTR = {
  ru: { voice: 'Голос', text: 'Текст', listening: 'Слушаю…', thinking: 'Думаю…', speaking: 'Говорит…', tap: 'Нажми и говори', paused: 'Пауза', exit: 'Выйти', animate: 'Оживить (видео)' },
  uk: { voice: 'Голос', text: 'Текст', listening: 'Слухаю…', thinking: 'Думаю…', speaking: 'Говорить…', tap: 'Натисни і говори', paused: 'Пауза', exit: 'Вийти', animate: 'Оживити (відео)' },
  en: { voice: 'Voice', text: 'Text', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', tap: 'Tap to talk', paused: 'Paused', exit: 'Exit', animate: 'Animate (video)' },
  de: { voice: 'Sprache', text: 'Text', listening: 'Höre zu…', thinking: 'Denke…', speaking: 'Spricht…', tap: 'Tippen und sprechen', paused: 'Pause', exit: 'Beenden', animate: 'Beleben (Video)' },
  bg: { voice: 'Глас', text: 'Текст', listening: 'Слушам…', thinking: 'Мисля…', speaking: 'Говори…', tap: 'Натисни и говори', paused: 'Пауза', exit: 'Изход', animate: 'Оживи (видео)' },
  tr: { voice: 'Ses', text: 'Metin', listening: 'Dinliyorum…', thinking: 'Düşünüyorum…', speaking: 'Konuşuyor…', tap: 'Bas ve konuş', paused: 'Duraklat', exit: 'Çıkış', animate: 'Canlandır (video)' },
  ar: { voice: 'صوت', text: 'نص', listening: 'أستمع…', thinking: 'أفكر…', speaking: 'يتحدث…', tap: 'اضغط وتحدث', paused: 'إيقاف', exit: 'خروج', animate: 'إحياء (فيديو)' },
  es: { voice: 'Voz', text: 'Texto', listening: 'Escuchando…', thinking: 'Pensando…', speaking: 'Hablando…', tap: 'Toca para hablar', paused: 'Pausa', exit: 'Salir', animate: 'Animar (vídeo)' },
  fr: { voice: 'Voix', text: 'Texte', listening: 'J\'écoute…', thinking: 'Je réfléchis…', speaking: 'Parle…', tap: 'Appuie pour parler', paused: 'Pause', exit: 'Quitter', animate: 'Animer (vidéo)' },
  sq: { voice: 'Zë', text: 'Tekst', listening: 'Po dëgjoj…', thinking: 'Po mendoj…', speaking: 'Po flet…', tap: 'Prek dhe fol', paused: 'Pauzë', exit: 'Dil', animate: 'Gjalëro (video)' },
}
const voiceStr = (lang) => VSTR[lang] || VSTR.en

// Библиотека готовых видео-клипов Pablo (сгенерированы 1 раз, крутятся бесконечно, 0 кредитов)
const CLIPS = {
  greeting:   '/avatar/clips/greeting.mp4',   // вход в голос
  correction: '/avatar/clips/correction.mp4', // «правильно так:» перед исправлением
  listening:  '/avatar/clips/listening.mp4',
  correct:    '/avatar/clips/correct.mp4',
  wrong:      '/avatar/clips/wrong.mp4',
  start:      '/avatar/clips/start.mp4',
  bye:        '/avatar/clips/bye.mp4',
}

const CHARACTERS = [
  { id: 'pablo', emoji: '🤓', name: 'Pablo Seoshkin', color: '#3B7A57', photo: '/avatar/pablo.jpg', role: { uk: 'Засновник, наставник', ru: 'Основатель, наставник', en: 'Founder, mentor', de: 'Gründer, Mentor', bg: 'Основател, наставник', tr: 'Kurucu, mentor', ar: 'المؤسس، مرشد', es: 'Fundador, mentor', fr: 'Fondateur, mentor', sq: 'Themelues, mentor' } },
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
  { id: 'family_love', label: { uk: '❤️ Любов до дітей', ru: '❤️ Любовь к детям', en: '❤️ Love for kids', de: '❤️ Liebe zu Kindern', bg: '❤️ Любов към децата', tr: '❤️ Çocuk sevgisi', ar: '❤️ حب الأطفال', es: '❤️ Amor por los niños', fr: '❤️ Amour des enfants', sq: '❤️ Dashuria për fëmijët' } },
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

function BubbleAI({ msg, onSpeak, avatarAvailable, busy, onAvatar }) {
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
          {avatarAvailable && !msg.videoUrl && (
            <button onClick={onAvatar} disabled={busy} title="Видео-аватар (тратит кредит D-ID)"
              style={{ marginLeft: 6, background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', fontSize: 14, opacity: 0.6, verticalAlign: 'middle' }}>
              {busy ? '⏳' : '🎥'}
            </button>
          )}
        </div>
        {msg.videoUrl && (
          <video src={msg.videoUrl} controls autoPlay playsInline
            style={{ width: '100%', maxWidth: 280, borderRadius: 12, marginTop: 6, border: '1px solid var(--line)' }} />
        )}
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
            <button onClick={() => onSpeak(msg.correction)} title="Прослухати правильно"
              style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.6, verticalAlign: 'middle' }}>
              🔊
            </button>
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
  const [character, setCharacter] = useState('pablo')
  const [scenario, setScenario] = useState('intro')
  const [messages, setMessages] = useState([]) // [{role, content, reply, correction, translation, character}]
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSummary, setShowSummary] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [memoryHint, setMemoryHint] = useState('')
  const [report, setReport] = useState(null)
  const [sessions, setSessions] = useState([])
  const [history, setHistory] = useState(null) // { session, messages } — просмотр прошлого диалога
  const [lessonMode, setLessonMode] = useState(null) // { title, words } — тренировка по словам урока
  const [lessonLoadFailed, setLessonLoadFailed] = useState(false) // слова урока не загрузились — фолбэк на обычный экран
  const [searchParams] = useSearchParams()
  const [avatarAvailable, setAvatarAvailable] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(-1) // индекс сообщения, для которого генерится видео
  const bottomRef = useRef()
  const voiceEndRef = useRef()  // автопрокрутка лога чата в голосовом режиме
  const inputRef = useRef()
  const lang = useI18nStore(s => s.lang)
  const S = uiStr(lang)
  const R = reportStr(lang)
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'

  // Голосовой ввод: распознаватель одноязычный, поэтому даём переключатель
  // «родной / немецкий». По умолчанию — язык локали (без ручных настроек телефона).
  const SPEECH_LANG = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', de: 'de-DE', bg: 'bg-BG', tr: 'tr-TR', ar: 'ar-SA', es: 'es-ES', fr: 'fr-FR', sq: 'sq-AL' }
  // По умолчанию распознаём НЕМЕЦКИЙ (это немецкий тренер — ученик говорит по-немецки).
  // Кнопкой можно переключить на родной язык. Раньше был родной → немецкая речь распознавалась криво.
  const [micDe, setMicDe] = useState(true)
  const V = voiceStr(lang)

  // Голосовой режим «как в Gemini»: большое фото, hands-free диалог
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)   // аватар «говорит» (озвучка или клип идёт)
  const [clip, setClip] = useState(null)            // проигрываемый видео-клип в кружке аватара
  const [reaction, setReaction] = useState(null)    // 'correct' | 'wrong' | null — реакция на ответ (цвета Германии)
  const clipOnEndRef = useRef(null)
  const voiceModeRef = useRef(false)
  const speakingRef   = useRef(false)
  const busyRef       = useRef(false)               // ждём ответ ИИ / транскрипцию
  const listeningRef  = useRef(false)
  const startMicRef   = useRef(null)
  const sendRef       = useRef(null)
  // Whisper-гибрид: параллельная запись аудио для точной транскрипции
  const mediaStreamRef = useRef(null)
  const recorderRef    = useRef(null)
  const chunksRef      = useRef([])
  const recordingRef   = useRef(false)
  const webSpeechTextRef = useRef('')               // запасной текст от Web Speech
  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])
  useEffect(() => { speakingRef.current = speaking }, [speaking])

  const { start: startMic, stop: stopMic, listening, isSupported: micSupported } = useSpeechRecognition({
    lang: micDe ? 'de-DE' : (SPEECH_LANG[lang] || 'de-DE'),
    onResult: (text) => {
      if (voiceModeRef.current) {
        // Гибрид: запоминаем текст Web Speech как запасной. Если идёт запись —
        // отправит onstop рекордера после точной транскрипции Whisper; иначе шлём сразу.
        webSpeechTextRef.current = (text || '').trim()
        if (!recordingRef.current && webSpeechTextRef.current) {
          sendRef.current?.(webSpeechTextRef.current)
          webSpeechTextRef.current = ''
        }
      } else {
        setInput(prev => (prev ? prev.trim() + ' ' : '') + text)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    },
  })
  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => { startMicRef.current = startMic }, [startMic])

  // Непрерывный цикл: как только тренер молчит и не думает — снова слушаем
  useEffect(() => {
    if (!voiceMode || listening || speaking || loading) return
    const t = setTimeout(() => {
      if (voiceModeRef.current && !speakingRef.current && !busyRef.current && !listeningRef.current) {
        startMicRef.current?.()
      }
    }, 500)
    return () => clearTimeout(t)
  }, [voiceMode, listening, speaking, loading])

  // Точная транскрипция через Whisper (гибрид)
  const transcribeVoice = async (blob) => {
    const fd = new FormData()
    fd.append('file', blob, 'voice.webm')
    const r = await uploadFiles('/ai-trainer/transcribe', fd)
    return r?.text || ''
  }

  // Whisper-гибрид: пишем аудио параллельно распознаванию; после конца фразы —
  // точный текст от Whisper (запасной — Web Speech). Hands-free сохраняется.
  useEffect(() => {
    if (!voiceMode) return
    const stream = mediaStreamRef.current
    if (listening && stream && !recordingRef.current && typeof MediaRecorder !== 'undefined') {
      try {
        const rec = new MediaRecorder(stream)
        chunksRef.current = []
        rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
        rec.onstop = async () => {
          recordingRef.current = false
          if (!voiceModeRef.current) return
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
          const fallback = webSpeechTextRef.current
          webSpeechTextRef.current = ''
          if (blob.size < 2400) { if (fallback) sendRef.current?.(fallback); return }
          busyRef.current = true; setLoading(true)
          let text = ''
          try { text = await transcribeVoice(blob) } catch {}
          busyRef.current = false; setLoading(false)
          const finalText = (text && text.trim()) || fallback
          if (finalText && finalText.trim()) sendRef.current?.(finalText.trim())
        }
        rec.start()
        recorderRef.current = rec
        recordingRef.current = true
      } catch { /* нет доступа к рекордеру — работаем на Web Speech */ }
    } else if (!listening && recordingRef.current) {
      try { recorderRef.current?.stop() } catch { recordingRef.current = false }
    }
  }, [voiceMode, listening])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    voiceEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Пресет персонажа/сценария из URL (напр. с карточки «Любовь к детям»)
  useEffect(() => {
    const sc = searchParams.get('scenario')
    const ch = searchParams.get('character')
    if (sc && SCENARIOS.some(s => s.id === sc)) setScenario(sc)
    if (ch && CHARACTERS.some(c => c.id === ch)) setCharacter(ch)
  }, [searchParams])

  // Режим «Тренер по уроку»: пришли с ?lesson_id=… → подтягиваем слова ИМЕННО этого урока.
  // Берём /lessons/:id/words (без дедупа), а не общий /words — иначе слова урока теряются.
  useEffect(() => {
    const lessonId = searchParams.get('lesson_id')
    if (!lessonId) return
    const title = searchParams.get('lesson_title') || ''
    api.get(`/lessons/${lessonId}/words`).then(rows => {
      const words = (rows || []).map(w => w.word_de).filter(Boolean)
      if (words.length) setLessonMode({ id: lessonId, title, words })
      else setLessonLoadFailed(true) // нет слов — покажем обычный экран, не зависаем
    }).catch(() => setLessonLoadFailed(true))
  }, [searchParams])

  // Доступность видео-аватара (только для учителя — экономим кредиты)
  useEffect(() => {
    if (!isOwner) return
    api.get('/ai-trainer/avatar/available').then(r => setAvatarAvailable(!!r.available)).catch(() => {})
  }, [isOwner])

  // Сгенерировать видео-аватар для реплики (⚠️ тратит кредит D-ID)
  const generateAvatar = async (index, text) => {
    setAvatarBusy(index)
    setError('')
    try {
      const r = await api.post('/ai-trainer/avatar', { text, character })
      setMessages(prev => prev.map((m, i) => i === index ? { ...m, videoUrl: r.video_url } : m))
    } catch {
      setError('Не удалось создать видео (возможно, закончились кредиты D-ID). Голосовой режим ✨ работает без кредитов.')
    } finally {
      setAvatarBusy(-1)
    }
  }

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

  const startSession = async (opts = {}) => {
    const ch = opts.character || character
    const sc = opts.scenario || scenario
    const words = opts.words || lessonMode?.words
    const fallback = STARTER_PHRASES[ch]?.[sc]
      || (sc.startsWith('interview') ? 'Guten Tag! Setzen Sie sich bitte. Erzählen Sie mir von sich.'
        : words ? 'Hallo! Lass uns die Wörter aus deiner Lektion üben.' : 'Hallo!')
    setMessages([])
    setMemoryHint('')
    setStep('chat')
    setLoading(true)  // «печатает…» пока ИИ генерит первую реплику с учётом памяти
    const userLang = localStorage.getItem('lang') || 'uk'
    try {
      const res = await api.post('/ai-trainer/sessions', { character: ch, scenario: sc, userLang, starter: fallback, targetWords: words })
      setSessionId(res.session_id)
      if (res.memory?.summary_text) setMemoryHint(res.memory.summary_text)
      const opening = res.opening || fallback
      setMessages([{ role: 'ai', reply: opening, translation: res.opening_translation || null, correction: null, character: ch }])
      if (opening) speak(opening, 'de-DE')
    } catch {
      setSessionId(null)
      setMessages([{ role: 'ai', reply: fallback, translation: null, correction: null, character: ch }])
      if (fallback) speak(fallback, 'de-DE')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  // Автостарт «Произношение с тренером»: пришли с урока → сразу тренируем ИМЕННО его слова
  // (Pablo, сценарий lesson), без экрана выбора темы/знакомства.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStartedRef.current) return
    if (step === 'select' && lessonMode?.words?.length) {
      autoStartedRef.current = true
      setCharacter('pablo'); setScenario('lesson')
      startSession({ character: 'pablo', scenario: 'lesson', words: lessonMode.words })
    }
  }, [lessonMode, step]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async (overrideText) => {
    // overrideText приходит из голосового режима (распознанная фраза)
    const fromVoice = typeof overrideText === 'string'
    const text = (fromVoice ? overrideText : input).trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    if (!fromVoice) setInput('')
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
      // Тренер отвечает голосом (немецкий). В голосовом режиме — с событиями
      // (пока говорит — не слушаем; после — цикл снова включит микрофон).
      if (result.reply) {
        if (voiceModeRef.current) {
          const corr = (result.correction && result.correction !== 'null') ? result.correction : null
          // Флоу: студент ответил → Pablo оживает клипом реакции (верно/неверно) →
          // затем говорит саму реплику → (если ошибка) договаривает правильный вариант → ждёт.
          setReaction(corr ? 'wrong' : 'correct')
          playClip(corr ? CLIPS.wrong : CLIPS.correct, () => {
            speakWithEvents(result.reply, 'de-DE', {
              onStart: () => setSpeaking(true),
              onEnd:   () => {
                if (voiceModeRef.current && corr) {
                  speakWithEvents(corr, 'de-DE', { onStart: () => setSpeaking(true), onEnd: () => { setReaction(null); setSpeaking(false) } })
                } else {
                  setReaction(null); setSpeaking(false)
                }
              },
            })
          })
        } else {
          speak(result.reply, 'de-DE')
        }
      }
    } catch (e) {
      setError(S.connErr)
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }
  useEffect(() => { sendRef.current = sendMessage })

  // Проиграть готовый видео-клип в кружке аватара (0 кредитов). onEnd — что после.
  const playClip = (url, onEnd) => {
    clipOnEndRef.current = onEnd || null
    setSpeaking(true)
    setClip(url)
  }
  // Вызывается по onEnded видео-клипа
  const handleClipEnded = () => {
    const cb = clipOnEndRef.current
    clipOnEndRef.current = null
    setClip(null)
    if (cb) cb()
    else setSpeaking(false)
  }

  // Вход/выход из голосового режима
  const enterVoice = () => {
    voiceModeRef.current = true
    setVoiceMode(true)
    cancelSpeak()
    // Захватываем микрофон для Whisper-записи (параллельно Web Speech)
    if (!mediaStreamRef.current && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(s => { mediaStreamRef.current = s })
        .catch(() => { mediaStreamRef.current = null })
    }
    // Живое приветствие клипом Pablo, затем цикл начнёт слушать
    playClip(CLIPS.greeting, () => setSpeaking(false))
  }
  const exitVoice = () => {
    voiceModeRef.current = false
    setVoiceMode(false)
    setSpeaking(false)
    setClip(null)
    setReaction(null)
    clipOnEndRef.current = null
    stopMic()
    cancelSpeak()
    // Освобождаем микрофон
    try { recorderRef.current?.stop() } catch {}
    recordingRef.current = false
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleSpeak = (text) => {
    speak(text, 'de-DE')
  }

  const resetSession = () => {
    if (voiceModeRef.current) exitVoice()
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

  // Завершить с показом отчёта (ждём ответ /finish)
  const finishSession = async () => {
    if (voiceModeRef.current) exitVoice()
    if (!sessionId) { setStep('select'); return }
    const userLang = localStorage.getItem('lang') || 'uk'
    const sid = sessionId
    setSessionId(null)   // предотвращаем двойной finish на unmount
    setLoading(true)
    try {
      const rep = await api.post(`/ai-trainer/sessions/${sid}/finish`, { userLang })
      setReport(rep)
      setMemoryHint('')
      setMessages([])
      setStep('report')
    } catch {
      resetSession()
    } finally {
      setLoading(false)
    }
  }

  // История сессий
  const openHistory = async () => {
    setHistory(null)
    setStep('history')
    try { setSessions(await api.get('/ai-trainer/sessions')) } catch {}
  }
  const openSessionLog = async (id) => {
    try { setHistory(await api.get(`/ai-trainer/sessions/${id}/messages`)) } catch {}
  }

  const char = CHARACTERS.find(c => c.id === character)

  if (step === 'select') {
    // Пришли с урока («Произношение с тренером») — не показываем выбор темы,
    // ждём загрузку слов урока и сразу автостартуем (см. useEffect автостарта).
    if (searchParams.get('lesson_id') && !lessonMode && !lessonLoadFailed) {
      return (
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 16px', textAlign: 'center', color: 'var(--ink-soft)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗣️</div>
          Готовлю тренировку по словам урока…
        </div>
      )
    }
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{S.title}</h1>
          <button onClick={openHistory} style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
            🕘 {R.history}
          </button>
        </div>
        <p style={{ color: 'var(--ink-soft)', marginBottom: 28, fontSize: 14 }}>
          {S.subtitle}
        </p>

        {lessonMode && (
          <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 14, background: 'var(--accent-soft)', border: '1px solid var(--accent)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📚</span>
            <span>Тренировка по уроку: <b>{lessonMode.title || 'урок'}</b> · {lessonMode.words.length} слов</span>
          </div>
        )}

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

        {!lessonMode && (
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
        )}

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

  // Экран отчёта после завершённого диалога
  if (step === 'report') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 40px' }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>📊 {R.reportTitle}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 20 }}>
          {(report?.user_message_count ?? 0)} {R.replies}
        </p>
        {report?.mistakes?.length > 0 ? (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: 10 }}>{R.mistakes}</div>
            {report.mistakes.map((m, i) => (
              <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: 'var(--red)', textDecoration: 'line-through' }}>{m.original}</div>
                <div style={{ fontSize: 15, color: 'var(--good)', fontWeight: 600, marginTop: 2 }}>{m.correction}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'var(--accent-soft)', borderRadius: 14, padding: 20, textAlign: 'center', fontSize: 16, marginBottom: 24 }}>{R.noMistakes}</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setReport(null); startSession() }} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{R.again}</button>
          <button onClick={() => { setReport(null); setStep('select') }} style={{ flex: 1, padding: 13, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>{R.toStart}</button>
        </div>
      </div>
    )
  }

  // История сессий: список → просмотр диалога
  if (step === 'history') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button onClick={() => (history ? setHistory(null) : setStep('select'))} style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>← {R.toStart}</button>
          <h1 style={{ margin: 0, fontSize: 20 }}>🕘 {R.history}</h1>
        </div>
        {history ? (
          <div>
            {history.messages.map((m, i) => (
              m.role === 'trainer'
                ? <div key={i} style={{ background: 'var(--surface-2)', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', marginBottom: 8, border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 15 }}>{m.text}</div>
                    {m.translation && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>{m.translation}</div>}
                  </div>
                : <div key={i} style={{ background: 'var(--accent-soft)', borderRadius: '14px 4px 14px 14px', padding: '10px 14px', marginBottom: 8, marginLeft: 40 }}>
                    <div style={{ fontSize: 15 }}>{m.text}</div>
                    {m.correction && m.correction !== 'null' && <div style={{ fontSize: 13, color: 'var(--good)', marginTop: 4 }}>✓ {m.correction}</div>}
                  </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', textAlign: 'center', marginTop: 40 }}>{R.empty}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map(s => {
              const ch = CHARACTERS.find(c => c.id === s.character) || CHARACTERS[0]
              const sc = SCENARIOS.find(x => x.id === s.scenario)
              return (
                <button key={s.id} onClick={() => openSessionLog(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 22 }}>{ch.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ch.name} · {sc ? loc(sc.label, lang) : s.scenario}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{new Date(s.started_at).toLocaleString()}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
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
        {micSupported && (
          <button onClick={enterVoice} title={V.voice} style={{
            width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--accent)',
            background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            🎙️
          </button>
        )}
        <button onClick={finishSession} disabled={loading} style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)',
          background: 'var(--accent-soft)', cursor: 'pointer', fontSize: 13, color: 'var(--accent)', fontWeight: 600,
        }}>
          {R.finish}
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
            ? <BubbleAI key={i} msg={m} onSpeak={handleSpeak}
                avatarAvailable={avatarAvailable} busy={avatarBusy === i}
                onAvatar={() => generateAvatar(i, m.reply)} />
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

      {/* Введення: поле во всю ширину, кнопки под ним */}
      <div style={{ padding: '10px 16px 16px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={S.placeholder}
          rows={1}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'none', borderRadius: 12, padding: '11px 14px',
            fontSize: 15, lineHeight: 1.5, border: '1.5px solid var(--line)',
            background: 'var(--surface)', color: 'var(--ink)',
            maxHeight: 120, overflowY: 'auto', fontFamily: 'inherit',
          }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          {/* Переключатель языка микрофона (скрыт, если локаль уже немецкая) */}
          {micSupported && lang !== 'de' && (
            <button
              onClick={() => setMicDe(v => !v)} disabled={listening}
              title="Язык распознавания: свой или немецкий"
              style={{
                height: 42, minWidth: 42, padding: '0 8px', borderRadius: 12, flexShrink: 0,
                border: `1px solid ${micDe ? 'var(--accent)' : 'var(--line)'}`,
                background: micDe ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: micDe ? 'var(--accent)' : 'var(--ink-soft)', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {micDe ? '🇩🇪' : lang.toUpperCase()}
            </button>
          )}
          {micSupported && (
            <button
              onClick={() => (listening ? stopMic() : startMic())}
              title={micDe ? 'Говорить по-немецки' : 'Говорить на своём языке'}
              style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                border: `1px solid ${listening ? 'var(--red)' : 'var(--line)'}`,
                background: listening ? 'var(--red)' : 'var(--surface-2)',
                color: listening ? '#fff' : 'var(--ink)', cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: listening ? 'pulse 1s infinite' : 'none',
              }}
            >
              <i className={`bi ${listening ? 'bi-mic-fill' : 'bi-mic'}`} />
            </button>
          )}
          {/* ✨ Живой голосовой режим (как в Gemini) */}
          {micSupported && (
            <button
              onClick={enterVoice} title={V.voice}
              style={{
                height: 42, padding: '0 14px', borderRadius: 12, flexShrink: 0, border: 'none',
                background: 'linear-gradient(135deg, #7C5CFF 0%, #3B7A57 100%)',
                color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              ✨ {V.voice}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{
              width: 46, height: 42, borderRadius: 12, border: 'none',
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

      {/* ГОЛОСОВОЙ РЕЖИМ «как в Gemini»: большое фото, hands-free */}
      {voiceMode && (() => {
        const lastAiIdx = [...messages.keys()].reverse().find(i => messages[i].role === 'ai')
        const lastAi = lastAiIdx != null ? messages[lastAiIdx] : null
        const lastUser = [...messages].reverse().find(m => m.role === 'user')
        const st = loading ? V.thinking : speaking ? V.speaking : listening ? V.listening : V.tap
        // Цвета Германии: 🟡 ждёт/слушает · ⚫ верно · 🔴 неверно
        const GER_GOLD = '#FFCE00', GER_RED = '#DD0000', GER_BLACK = '#1a1a1a'
        const stColor = reaction === 'wrong' ? GER_RED : reaction === 'correct' ? GER_BLACK : GER_GOLD
        const glow = reaction === 'correct' ? GER_GOLD : stColor  // чёрный виден за счёт золотого свечения
        const active = speaking || listening || !!reaction
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'radial-gradient(120% 80% at 50% 0%, #223 0%, #0d1014 70%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '24px 20px', color: '#fff',
          }}>
            {/* Верхняя панель: оживить (D-ID, если есть кредиты) / текст */}
            <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 8 }}>
              {avatarAvailable && lastAi && !lastAi.videoUrl && (
                <button onClick={() => generateAvatar(lastAiIdx, lastAi.reply)} disabled={avatarBusy === lastAiIdx}
                  title={V.animate}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {avatarBusy === lastAiIdx ? '⏳' : '🎥'} {V.animate}
                </button>
              )}
              <button onClick={exitVoice} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                💬 {V.text}
              </button>
            </div>

            {/* Аватар — компактно сверху */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, marginTop: 30 }}>
              <div style={{ position: 'relative', width: 'min(44vw, 168px)', height: 'min(44vw, 168px)', marginBottom: 12 }}>
                <div style={{
                  position: 'absolute', inset: -8, borderRadius: '50%',
                  border: `3px solid ${stColor}`, opacity: active ? 0.9 : 0.3,
                  boxShadow: active ? `0 0 26px ${glow}` : 'none',
                  animation: active ? 'voice-pulse 1.4s ease-out infinite' : 'none',
                }} />
                {clip ? (
                  <video src={clip} autoPlay playsInline onEnded={handleClipEnded} onError={handleClipEnded}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', border: `3px solid ${stColor}`, boxShadow: `0 0 24px ${glow}` }} />
                ) : lastAi?.videoUrl ? (
                  <video src={lastAi.videoUrl} autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', border: `3px solid ${stColor}` }} />
                ) : char.photo ? (
                  <img src={char.photo} alt={char.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%',
                      border: `3px solid ${stColor}`, boxShadow: active ? `0 0 20px ${glow}` : 'none', transition: 'transform .3s, box-shadow .3s',
                      transform: speaking ? 'scale(1.02)' : 'scale(1)' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: char.color + '33',
                    border: `3px solid ${stColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'min(22vw, 80px)' }}>
                    {char.emoji}
                  </div>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{char.name}</div>
              {/* Статус */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', fontSize: 13, fontWeight: 600, color: stColor, marginTop: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stColor, animation: active ? 'pulse 1s infinite' : 'none' }} />
                {st}
              </div>
            </div>

            {/* Лог чата — снизу, с прослушкой и переводом */}
            <div style={{ flex: 1, width: '100%', maxWidth: 540, overflowY: 'auto', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
              {messages.map((m, i) => (
                m.role === 'ai' ? (
                  <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '88%', background: 'rgba(255,255,255,0.08)', borderRadius: '4px 14px 14px 14px', padding: '10px 13px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 600 }}>{m.reply}</span>
                      <button onClick={() => handleSpeak(m.reply)} title="Прослушать"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#fff', opacity: 0.65, flexShrink: 0, padding: 0, marginTop: 2 }}>🔊</button>
                    </div>
                    {m.translation && <div style={{ fontSize: 12.5, opacity: 0.55, marginTop: 4 }}>{m.translation}</div>}
                    {m.correction && m.correction !== 'null' && (
                      <div style={{ fontSize: 12.5, color: '#ffcf6b', marginTop: 5 }}>✏️ {m.correction}</div>
                    )}
                  </div>
                ) : (
                  <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '88%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: '14px 4px 14px 14px', padding: '9px 13px', fontSize: 15 }}>
                    {m.content}
                  </div>
                )
              ))}
              {error && <div style={{ color: '#ff8a7a', fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <div ref={voiceEndRef} />
            </div>

            {/* Нижние контролы */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 8, flexWrap: 'wrap' }}>
              {/* язык микрофона */}
              {lang !== 'de' && (
                <button onClick={() => setMicDe(v => !v)} disabled={listening}
                  style={{ minWidth: 46, height: 46, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: `1px solid ${micDe ? '#7db' : 'rgba(255,255,255,0.25)'}`, background: micDe ? 'rgba(120,220,180,0.15)' : 'rgba(255,255,255,0.08)', color: micDe ? '#7db' : '#fff' }}>
                  {micDe ? '🇩🇪' : lang.toUpperCase()}
                </button>
              )}

              {/* центральная кнопка микрофона */}
              <button onClick={() => (listening ? stopMic() : startMic())} disabled={loading || speaking}
                style={{ width: 76, height: 76, borderRadius: '50%', cursor: (loading || speaking) ? 'default' : 'pointer', fontSize: 30,
                  border: 'none', background: listening ? '#d6533c' : (loading || speaking) ? 'rgba(255,255,255,0.15)' : 'var(--accent)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: listening ? '0 0 0 6px rgba(214,83,60,0.25)' : 'none', animation: listening ? 'pulse 1.2s infinite' : 'none' }}>
                <i className={`bi ${listening ? 'bi-mic-fill' : 'bi-mic'}`} />
              </button>
            </div>
          </div>
        )
      })()}

      <style>{`@keyframes voice-pulse { 0% { transform: scale(1); opacity: .8 } 100% { transform: scale(1.25); opacity: 0 } }`}</style>
    </div>
  )
}
