import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
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
  const [loading, setLoading]     = useState(true)
  const navigate                  = useNavigate()
  const [searchParams]            = useSearchParams()
  const { t, lang }               = useI18nStore()

  useEffect(() => {
    const type      = searchParams.get('type')
    const lesson_id = searchParams.get('lesson_id')
    const qs = new URLSearchParams()
    if (type)      qs.set('type', type)
    if (lesson_id) qs.set('lesson_id', lesson_id)
    const url = `/exercises/today${qs.toString() ? '?' + qs : ''}`

    api.get(url)
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
        await api.post(`/exercises/${ex.id}/attempt`, { userAnswer: String(userAnswer), quality, lang })
      } catch (e) {
        console.error('Ошибка сохранения попытки:', e)
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
        <span style={{ marginLeft: 'auto', color: 'var(--ink-soft)', fontSize: 11 }}>
          {current + 1} / {exercises.length}
        </span>
      </div>

      {/* Контент упражнения — заполняет оставшееся место */}
      <div className="exercise-session-content">
        {ex.type === 'flashcard'       && <Flashcard      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} />}
        {ex.type === 'fill_blank'      && <FillBlank      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} payloadTranslations={ex.payload_translations} exerciseId={ex.id} />}
        {ex.type === 'multiple_choice' && <MultipleChoice key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} wordDe={ex.word_de} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} payloadTranslations={ex.payload_translations} exerciseId={ex.id} />}
        {ex.type === 'sentence_write'  && <SentenceWrite  key={ex.id} exercise={ex}        onAnswer={handleAnswer} lessonTitle={lessonTitle} payloadTranslations={ex.payload_translations} />}
        {ex.type === 'letter_fill'     && <LetterFill     key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} />}
        {ex.type === 'dictation'       && <Dictation       key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} />}
        {ex.type === 'speech'          && <SpeechExercise  key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} />}
      </div>
    </div>
  )
}
