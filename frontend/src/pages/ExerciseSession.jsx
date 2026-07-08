import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import Flashcard from '../components/Flashcard.jsx'
import FillBlank from '../components/FillBlank.jsx'
import MultipleChoice from '../components/MultipleChoice.jsx'
import SentenceWrite from '../components/SentenceWrite.jsx'
import LetterFill from '../components/LetterFill.jsx'
import ProgressBar from '../components/ProgressBar.jsx'

const SESSION_KEY = 'exercise_session_v2'

export default function ExerciseSession() {
  const [exercises, setExercises] = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useI18nStore()

  useEffect(() => {
    const type      = searchParams.get('type')
    const lesson_id = searchParams.get('lesson_id')
    const sessionKey = `${lesson_id || ''}_${type || ''}`
    const saved = sessionStorage.getItem(SESSION_KEY)

    // Восстанавливаем сессию если она для той же комбинации урок+тип
    if (saved) {
      try {
        const { exercises: exs, current: idx, sessionType } = JSON.parse(saved)
        if (sessionType === sessionKey && idx < exs.length) {
          setExercises(exs)
          setCurrent(idx)
          setLoading(false)
          return
        }
      } catch {}
    }

    const qs = new URLSearchParams()
    if (type)      qs.set('type', type)
    if (lesson_id) qs.set('lesson_id', lesson_id)
    const url = `/exercises/today${qs.toString() ? '?' + qs : ''}`

    api.get(url).then(exs => {
      setExercises(exs)
      setCurrent(0)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ exercises: exs, current: 0, sessionType: sessionKey }))
    }).finally(() => setLoading(false))
  }, [])

  const handleAnswer = async (quality, userAnswer = '') => {
    const ex = exercises[current]
    if (ex.type !== 'sentence_write') {
      try {
        await api.post(`/exercises/${ex.id}/attempt`, { userAnswer: String(userAnswer), quality })
      } catch (e) {
        console.error('Ошибка сохранения попытки:', e)
      }
    }

    const next = current + 1
    if (next >= exercises.length) {
      sessionStorage.removeItem(SESSION_KEY)
      navigate('/')
    } else {
      setCurrent(next)
      // Обновляем сохранённый индекс
      const type      = searchParams.get('type')
      const lesson_id = searchParams.get('lesson_id')
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        exercises, current: next,
        sessionType: `${lesson_id || ''}_${type || ''}`,
      }))
    }
  }

  if (loading) return <p>{t.exercise.loading}</p>
  if (exercises.length === 0) { navigate('/'); return null }

  const ex = exercises[current]
  const done = current

  return (
    <div>
      <ProgressBar current={done} total={exercises.length} />
      <div style={{ marginBottom: 10, color: '#9ca3af', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {{ flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice, sentence_write: t.exercise.sentenceWrite, letter_fill: t.exercise.letterFill }[ex.type]}
      </div>
      {/* key={ex.id} заставляет React пересоздавать компонент при смене упражнения */}
      {ex.type === 'flashcard'       && <Flashcard      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={ex.lesson_title} imageUrl={ex.image_url} />}
      {ex.type === 'fill_blank'      && <FillBlank      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={ex.lesson_title} />}
      {ex.type === 'multiple_choice' && <MultipleChoice key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={ex.lesson_title} wordDe={ex.word_de} imageUrl={ex.image_url} />}
      {ex.type === 'sentence_write'  && <SentenceWrite  key={ex.id} exercise={ex}        onAnswer={handleAnswer} lessonTitle={ex.lesson_title} />}
      {ex.type === 'letter_fill'     && <LetterFill     key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={ex.lesson_title} imageUrl={ex.image_url} />}
    </div>
  )
}
