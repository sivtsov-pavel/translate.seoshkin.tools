import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { isOnline, getOfflineExercises, answerOffline } from '../offline/store.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle } from '../utils/translation.js'
import Flashcard from '../components/Flashcard.jsx'
import FillBlank from '../components/FillBlank.jsx'
import MultipleChoice from '../components/MultipleChoice.jsx'
import SentenceWrite from '../components/SentenceWrite.jsx'
import LetterFill from '../components/LetterFill.jsx'
import Dictation from '../components/Dictation.jsx'
import SpeechExercise from '../components/SpeechExercise.jsx'

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
  const [starred, setStarred]     = useState(() => new Set()) // слова, помеченные «в изучение»
  // Быстрый тумблер озвучки/видео-реакции тренера (тот же флаг, что в Настройках).
  // Выкл — чтобы аватар не проговаривал «Sehr gut» (в т.ч. чтобы микрофон не ловил свою же речь).
  const [reactionsOn, setReactionsOn] = useState(() => localStorage.getItem('trainer_reactions') !== 'false')
  const toggleReactions = () => setReactionsOn(v => { localStorage.setItem('trainer_reactions', v ? 'false' : 'true'); return !v })
  const navigate                  = useNavigate()
  const [searchParams]            = useSearchParams()
  const { t, lang }               = useI18nStore()

  // Пометить слово текущего упражнения «в изучение» (сложные/интересные слова)
  const markLearning = async (wordId) => {
    if (!wordId) return
    try {
      await api.patch(`/words/${wordId}`, { status: 'learning' })
      setStarred(prev => new Set(prev).add(wordId))
    } catch (e) { console.error('mark learning', e) }
  }
  const lessonId                  = searchParams.get('lesson_id')

  useEffect(() => {
    const type      = searchParams.get('type')
    const lesson_id = searchParams.get('lesson_id')
    const qs = new URLSearchParams()
    if (type)      qs.set('type', type)
    if (lesson_id) qs.set('lesson_id', lesson_id)
    const url = `/exercises/today${qs.toString() ? '?' + qs : ''}`

    // Без сети (или сервер недоступен) — упражнения из локальной базы (офлайн-ядро)
    const loadOffline = () => getOfflineExercises({ lessonId: lesson_id, type })
    const load = isOnline() ? api.get(url).catch(loadOffline) : loadOffline()

    load
      .then(exs => {
        // Диктант всегда последним
        const dictation = exs.filter(e => e.type === 'dictation')
        const rest      = exs.filter(e => e.type !== 'dictation')
        setExercises([...rest, ...dictation])
        setCurrent(0)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleAnswer = async (quality, userAnswer = '') => {
    const ex = exercises[current]
    if (ex.type !== 'sentence_write') {
      try {
        if (!isOnline()) throw new Error('offline')
        await api.post(`/exercises/${ex.id}/attempt`, { userAnswer: String(userAnswer), quality, lang })
      } catch (e) {
        // Нет сети — ответ в локальную очередь + SM-2 локально, отправится при появлении сети
        try { await answerOffline(ex, quality, String(userAnswer)) }
        catch (e2) { console.error('Ошибка сохранения попытки:', e2) }
      }
    }

    const next = current + 1
    if (next >= exercises.length) {
      navigate('/')
    } else {
      setCurrent(next)
    }
  }

  if (loading) return <p>{t.exercise.loading}</p>
  if (exercises.length === 0) { navigate('/'); return null }

  const ex = exercises[current]
  const lessonTitle = getLessonTitle(ex.lesson_title, ex.lesson_title_translations, lang)

  const typeLabel = { flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice, sentence_write: t.exercise.sentenceWrite, letter_fill: t.exercise.letterFill, dictation: t.exercise.dictation, speech: t.exercise.speech || 'Произношение' }[ex.type]

  return (
    <div className="full-page-layout exercise-session-page">
      {/* Мини-бейдж типа упражнения */}
      <div className="exercise-session-type">
        <span>{typeLabel}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Быстрый тумблер озвучки тренера — выкл заменяет голос аватара короткими звуками */}
          <button onClick={toggleReactions}
            title={reactionsOn ? 'Тренер озвучивает — нажми, чтобы выключить (останутся короткие звуки верно/неверно)' : 'Озвучка выключена — нажми, чтобы включить голос тренера'}
            style={{ padding: '3px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 14, lineHeight: 1,
              border: `1px solid ${reactionsOn ? 'var(--accent)' : 'var(--line)'}`,
              background: reactionsOn ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: reactionsOn ? 'var(--accent)' : 'var(--ink-soft)' }}>
            {reactionsOn ? '🔊' : '🔇'}
          </button>
          {ex.word_id && (
            <button onClick={() => markLearning(ex.word_id)} disabled={starred.has(ex.word_id)}
              title="Добавить слово в изучение (учить/повторять)"
              style={{ padding: '3px 10px', borderRadius: 8, cursor: starred.has(ex.word_id) ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'none', letterSpacing: 0,
                border: `1px solid ${starred.has(ex.word_id) ? 'var(--good, #16a34a)' : 'var(--accent)'}`,
                background: starred.has(ex.word_id) ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--accent-soft)',
                color: starred.has(ex.word_id) ? 'var(--good, #16a34a)' : 'var(--accent)' }}>
              {starred.has(ex.word_id) ? '★ В изучении' : '⭐ В изучение'}
            </button>
          )}
          {lessonId && (
            <button onClick={() => navigate(`/ai-trainer?lesson_id=${lessonId}`)}
              title="Поговорить с AI-тренером по словам этого урока"
              style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
              🗣️ Тренер
            </button>
          )}
          <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>
            {current + 1} / {exercises.length}
          </span>
        </div>
      </div>

      {/* Контент упражнения — заполняет оставшееся место */}
      <div className="exercise-session-content" ref={contentRef}>
        {ex.type === 'flashcard'       && <Flashcard      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} />}
        {ex.type === 'fill_blank'      && <FillBlank      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} payloadTranslations={ex.payload_translations} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} />}
        {ex.type === 'multiple_choice' && <MultipleChoice key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} wordDe={ex.word_de} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} payloadTranslations={ex.payload_translations} exerciseId={ex.id} />}
        {ex.type === 'sentence_write'  && <SentenceWrite  key={ex.id} exercise={ex}        onAnswer={handleAnswer} lessonTitle={lessonTitle} payloadTranslations={ex.payload_translations} />}
        {ex.type === 'letter_fill'     && <LetterFill     key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} />}
        {ex.type === 'dictation'       && <Dictation       key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} />}
        {ex.type === 'speech'          && <SpeechExercise  key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} />}
      </div>
    </div>
  )
}
