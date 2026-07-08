import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import Flashcard from '../components/Flashcard.jsx'
import FillBlank from '../components/FillBlank.jsx'
import MultipleChoice from '../components/MultipleChoice.jsx'
import SentenceWrite from '../components/SentenceWrite.jsx'
import ProgressBar from '../components/ProgressBar.jsx'

const SESSION_KEY = 'exercise_session'

export default function ExerciseSession() {
  const [exercises, setExercises] = useState([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useI18nStore()

  useEffect(() => {
    const type = searchParams.get('type')
    const saved = sessionStorage.getItem(SESSION_KEY)

    // Восстанавливаем сессию если она для того же типа и не завершена
    if (saved) {
      try {
        const { exercises: exs, current: idx, sessionType } = JSON.parse(saved)
        if (sessionType === (type || '') && idx < exs.length) {
          setExercises(exs)
          setCurrent(idx)
          setLoading(false)
          return
        }
      } catch {}
    }

    const url = type ? `/exercises/today?type=${type}` : '/exercises/today'
    api.get(url).then(exs => {
      setExercises(exs)
      setCurrent(0)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        exercises: exs,
        current: 0,
        sessionType: type || '',
      }))
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
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        exercises,
        current: next,
        sessionType: searchParams.get('type') || '',
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
        {{ flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice, sentence_write: t.exercise.sentenceWrite }[ex.type]}
      </div>
      {/* key={ex.id} заставляет React пересоздавать компонент при смене упражнения */}
      {ex.type === 'flashcard'       && <Flashcard      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'fill_blank'      && <FillBlank      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'multiple_choice' && <MultipleChoice key={ex.id} payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'sentence_write'  && <SentenceWrite  key={ex.id} exercise={ex}        onAnswer={handleAnswer} />}
    </div>
  )
}
