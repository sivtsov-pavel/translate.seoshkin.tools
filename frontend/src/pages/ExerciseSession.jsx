import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Globe, Volume2, VolumeX, Star, MessageCircle } from 'lucide-react'
import { api } from '../api/client.js'
import { isOnline, getOfflineExercises, answerOffline } from '../offline/store.js'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { getLessonTitle } from '../utils/translation.js'
import Flashcard from '../components/Flashcard.jsx'
import FillBlank from '../components/FillBlank.jsx'
import MultipleChoice from '../components/MultipleChoice.jsx'
import SentenceWrite from '../components/SentenceWrite.jsx'
import LetterFill from '../components/LetterFill.jsx'
import Dictation from '../components/Dictation.jsx'
import SpeechExercise from '../components/SpeechExercise.jsx'

// Порядок типов упражнений в уроке (педагогический, по просьбе Павла):
// вопрос-ответ → флеш-карты → вставь букву → вставь слово → напиши предложение → проговори → диктант
const TYPE_SEQ = { multiple_choice: 0, flashcard: 1, letter_fill: 2, fill_blank: 3, sentence_write: 4, speech: 5, dictation: 6 }

export default function ExerciseSession() {
  const [exercises, setExercises] = useState([])
  const [current, setCurrent]     = useState(0)
  const contentRef = useRef(null)
  // При переходе к следующему упражнению — скроллим наверх (иначе верх карточки/картинка
  // остаётся под хедером после прокрутки к результату предыдущего)
  useEffect(() => {
    // Скроллер — прямой потомок .exercise-session-content (overflow-y:auto)
    contentRef.current?.firstElementChild?.scrollTo?.({ top: 0 })
    contentRef.current?.scrollTo?.({ top: 0 })
    window.scrollTo?.({ top: 0 })
  }, [current])
  const [loading, setLoading]     = useState(true)
  // Смещение счётчика для практики по типу: сколько упражнений этого типа уже сделано СЕГОДНЯ.
  // Позволяет продолжать «34 / 100» после выхода/возврата, а не начинать заново с «1».
  const [doneOffset, setDoneOffset] = useState(0)
  const [finished, setFinished]   = useState(false) // сессия закончилась — экран «Продолжить/Готово»
  const [continuing, setContinuing] = useState(false)
  const [lessonDone, setLessonDone] = useState(false) // упражнений на сегодня больше нет — урок пройден
  const [starred, setStarred]     = useState(() => new Set()) // слова, помеченные «в изучение»
  // Быстрый тумблер озвучки/видео-реакции тренера (тот же флаг, что в Настройках).
  // Выкл — чтобы аватар не проговаривал «Sehr gut» (в т.ч. чтобы микрофон не ловил свою же речь).
  const [reactionsOn, setReactionsOn] = useState(() => localStorage.getItem('trainer_reactions') !== 'false')
  const toggleReactions = () => setReactionsOn(v => { localStorage.setItem('trainer_reactions', v ? 'false' : 'true'); return !v })
  // Учитель: глобус — сразу показать перевод слова на локали ученика (не отвечая/не переворачивая),
  // чтобы проверить, как ученик видит перевод. Только owner; по умолчанию выкл; ученика не касается.
  const [origView, setOrigView] = useState(() => localStorage.getItem('exercise_orig_view') === '1')
  const toggleOrigView = () => setOrigView(v => { localStorage.setItem('exercise_orig_view', v ? '0' : '1'); return !v })
  const navigate                  = useNavigate()
  const [searchParams]            = useSearchParams()
  const { t, lang }               = useI18nStore()
  const { user }                  = useAuthStore()
  const showOriginal = user?.role === 'owner' && origView

  // Пометить слово текущего упражнения «в изучение» (сложные/интересные слова)
  const markLearning = async (wordId) => {
    if (!wordId) return
    try {
      await api.patch(`/words/${wordId}`, { status: 'learning' })
      setStarred(prev => new Set(prev).add(wordId))
    } catch (e) { console.error('mark learning', e) }
  }
  const lessonId                  = searchParams.get('lesson_id')
  const type                      = searchParams.get('type')
  const exam                      = searchParams.get('exam')

  // Загрузка упражнений «на сегодня» (по уроку/типу). Возвращает массив (для «Продолжить»).
  const loadExercises = () => {
    const qs = new URLSearchParams()
    if (type)      qs.set('type', type)
    if (lessonId)  qs.set('lesson_id', lessonId)
    if (exam)      qs.set('exam', '1')
    const url = `/exercises/today${qs.toString() ? '?' + qs : ''}`
    const loadOffline = () => getOfflineExercises({ lessonId, type })
    return (isOnline() ? api.get(url).catch(loadOffline) : loadOffline())
      .then(exs => {
        // Педагогический порядок типов в уроке (просьба Павла): узнавание → продукция → на слух.
        // вопрос-ответ → флеш-карты → вставь букву → вставь слово → напиши предложение →
        // проговори слова → диктант. Внутри типа порядок сохраняется (стабильная сортировка).
        const ordered = [...exs].sort((a, b) => (TYPE_SEQ[a.type] ?? 99) - (TYPE_SEQ[b.type] ?? 99))
        setExercises(ordered)
        setCurrent(0)
        return ordered
      })
  }

  useEffect(() => {
    // Практика по типу (без урока): продолжаем счётчик с места (сколько сделано сегодня).
    if (type && !lessonId && isOnline()) {
      api.get(`/exercises/done-today?type=${encodeURIComponent(type)}`)
        .then(r => setDoneOffset(r?.done || 0)).catch(() => {})
    }
    loadExercises().finally(() => setLoading(false))
  }, [])

  const handleAnswer = async (quality, userAnswer = '') => {
    const ex = exercises[current]
    if (ex.type !== 'sentence_write') {
      try {
        if (!isOnline()) throw new Error('offline')
        await api.post(`/exercises/${ex.id}/attempt`, { userAnswer: String(userAnswer), quality, lang })
      } catch (e) {
        try { await answerOffline(ex, quality, String(userAnswer)) }
        catch (e2) { console.error('Ошибка сохранения попытки:', e2) }
      }
    }

    const next = current + 1
    if (next >= exercises.length) {
      setDoneOffset(o => o + exercises.length)
      // Сессия конкретного урока грузит ВСЕ его упражнения → пройдены все, «Продолжить» не нужно
      // (иначе перезапрос вернёт те же). Практика по типу без урока — SRS-партиями, с «Продолжить».
      if (lessonId) setLessonDone(true)
      setFinished(true)
    } else {
      setCurrent(next)
    }
  }

  // «На главную» — со скроллом к своему уроку на дашборде
  const goHome = () => navigate('/', { state: lessonId ? { scrollToLesson: Number(lessonId) } : undefined })

  // «Продолжить» — догрузить следующие упражнения; пусто → урок пройден
  const continuePractice = async () => {
    setContinuing(true)
    let more = []
    try { more = await loadExercises() } catch { more = [] }
    setContinuing(false)
    if (more && more.length) setFinished(false)
    else setLessonDone(true)
  }

  if (loading) return <p>{t.exercise.loading}</p>
  if (exercises.length === 0 && !finished) { navigate('/'); return null }

  // Экран завершения сессии — «Продолжить до зачёта» или «Урок пройден»
  if (finished) {
    return (
      <div className="full-page-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '32px 24px', boxShadow: 'var(--card-shadow)' }}>
          {/* «Урок пройден» — только когда сделаны ВСЕ упражнения (или сдан зачёт).
              Пока есть ещё упражнения — говорим про УПРАЖНЕНИЯ, не про урок. */}
          <div style={{ fontSize: 52, marginBottom: 10 }}>{lessonDone && (exam || !type) ? '🏆' : '🎉'}</div>
          <div style={{ fontFamily: 'var(--heading-font)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            {lessonDone
              ? (exam ? (t.exercise.examPassed || 'Зачёт сдан! Урок пройден')
                 : (type ? (t.exercise.exercisesDone || 'Упражнения пройдены!') : (t.exercise.lessonPassed || 'Урок пройден!')))
              : (t.exercise.batchDone || 'Молодец! Упражнения пройдены')}
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: '0 0 22px' }}>
            {lessonDone
              ? (exam ? (t.exercise.examPassedSub || 'Все слова урока пройдены. Так держать! 🎉')
                 : (type ? (t.exercise.exercisesDoneSub || 'Все упражнения этого типа сделаны.') : (t.exercise.lessonPassedSub || 'Ты прошёл все упражнения урока! 🎉')))
              : (t.exercise.batchDoneSub || 'Продолжим следующую партию.')}
          </p>
          {!lessonDone && (
            <button onClick={continuePractice} disabled={continuing}
              style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              {continuing ? '…' : `${t.exercise.continueEx || 'Продолжить упражнения'} →`}
            </button>
          )}
          <button onClick={goHome}
            style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {t.exercise.toHome || 'На главную'}
          </button>
        </div>
      </div>
    )
  }

  const ex = exercises[current]
  const lessonTitle = getLessonTitle(ex.lesson_title, ex.lesson_title_translations, lang)

  const typeLabel = { flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice, sentence_write: t.exercise.sentenceWrite, letter_fill: t.exercise.letterFill, dictation: t.exercise.dictation, speech: t.exercise.speech || 'Произношение' }[ex.type]

  return (
    <div className="full-page-layout exercise-session-page">
      {/* Мини-бейдж типа упражнения */}
      <div className="exercise-session-type">
        <span style={{ background: 'rgba(62,127,193,0.12)', color: 'var(--blue)', borderRadius: 8, padding: '2px 9px', fontWeight: 700, fontSize: 12, marginRight: 8 }}>
          {doneOffset + current + 1} / {doneOffset + exercises.length}
        </span>
        <span>{typeLabel}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Учитель: глобус — показать перевод слова на локали ученика (проверка) */}
          {user?.role === 'owner' && (
            <button onClick={toggleOrigView}
              title={showOriginal ? 'Перевод показан — нажми, чтобы скрыть' : 'Показать перевод слова на локали ученика (не отвечая)'}
              style={{ ...hdrBtn, display: 'flex', alignItems: 'center',
                border: `1px solid ${showOriginal ? 'var(--blue)' : 'var(--line)'}`,
                background: showOriginal ? 'rgba(62,127,193,0.12)' : 'var(--surface-2)',
                color: showOriginal ? 'var(--blue)' : 'var(--ink-soft)' }}>
              <Globe size={16} />
            </button>
          )}
          {/* Быстрый тумблер озвучки тренера */}
          <button onClick={toggleReactions}
            title={reactionsOn ? 'Тренер озвучивает — нажми, чтобы выключить' : 'Озвучка выключена — нажми, чтобы включить голос тренера'}
            style={{ ...hdrBtn, display: 'flex', alignItems: 'center',
              border: `1px solid ${reactionsOn ? 'var(--blue)' : 'var(--line)'}`,
              background: reactionsOn ? 'rgba(62,127,193,0.12)' : 'var(--surface-2)',
              color: reactionsOn ? 'var(--blue)' : 'var(--ink-soft)' }}>
            {reactionsOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          {ex.word_id && (
            <button onClick={() => markLearning(ex.word_id)} disabled={starred.has(ex.word_id)}
              title="Добавить слово в изучение (учить/повторять)"
              style={{ padding: '4px 10px', borderRadius: 8, cursor: starred.has(ex.word_id) ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                border: `1px solid ${starred.has(ex.word_id) ? 'var(--good, #16a34a)' : 'var(--gold)'}`,
                background: starred.has(ex.word_id) ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--yellow-soft)',
                color: starred.has(ex.word_id) ? 'var(--good, #16a34a)' : 'var(--gold-dark)' }}>
              <Star size={13} fill={starred.has(ex.word_id) ? 'currentColor' : 'none'} /> {starred.has(ex.word_id) ? 'В изучении' : 'В изучение'}
            </button>
          )}
          {lessonId && (
            <button onClick={() => navigate(`/ai-trainer?lesson_id=${lessonId}`)}
              title="Поговорить с AI-тренером по словам этого урока"
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--blue)', background: 'rgba(62,127,193,0.12)', color: 'var(--blue)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MessageCircle size={13} /> Тренер
            </button>
          )}
        </div>
      </div>

      {/* Контент упражнения — заполняет оставшееся место */}
      <div className="exercise-session-content" ref={contentRef}>
        {ex.type === 'flashcard'       && <Flashcard      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} showOriginal={showOriginal} wordId={ex.word_id} onMarkLearning={markLearning} learned={starred.has(ex.word_id)} />}
        {ex.type === 'fill_blank'      && <FillBlank      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} payloadTranslations={ex.payload_translations} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} showOriginal={showOriginal} />}
        {ex.type === 'multiple_choice' && <MultipleChoice key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} wordDe={ex.word_de} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} payloadTranslations={ex.payload_translations} exerciseId={ex.id} showOriginal={showOriginal} />}
        {ex.type === 'sentence_write'  && <SentenceWrite  key={ex.id} exercise={ex}        onAnswer={handleAnswer} lessonTitle={lessonTitle} payloadTranslations={ex.payload_translations} showOriginal={showOriginal} />}
        {ex.type === 'letter_fill'     && <LetterFill     key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} showOriginal={showOriginal} />}
        {ex.type === 'dictation'       && <Dictation       key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} showOriginal={showOriginal} />}
        {ex.type === 'speech'          && <SpeechExercise  key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} showOriginal={showOriginal} />}
      </div>
    </div>
  )
}

const hdrBtn = { padding: '5px 8px', borderRadius: 8, cursor: 'pointer', lineHeight: 1 }
