import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import Flashcard from '../components/Flashcard.jsx'
import FillBlank from '../components/FillBlank.jsx'
import MultipleChoice from '../components/MultipleChoice.jsx'
import ProgressBar from '../components/ProgressBar.jsx'

export default function ExerciseSession() {
  const [exercises, setExercises] = useState([])
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { t } = useI18nStore()

  useEffect(() => {
    api.get('/exercises/today')
      .then(setExercises)
      .finally(() => setLoading(false))
  }, [])

  const handleAnswer = async (quality, userAnswer = '') => {
    const ex = exercises[current]
    try {
      await api.post(`/exercises/${ex.id}/attempt`, { userAnswer: String(userAnswer), quality })
    } catch (e) {
      console.error('Ошибка сохранения попытки:', e)
    }

    const next = current + 1
    if (next >= exercises.length) {
      navigate('/')
    } else {
      setCurrent(next)
      setDone(d => d + 1)
    }
  }

  if (loading) return <p>{t.exercise.loading}</p>
  if (exercises.length === 0) { navigate('/'); return null }

  const ex = exercises[current]

  return (
    <div>
      <ProgressBar current={done} total={exercises.length} />
      <div style={{ marginBottom: 10, color: '#9ca3af', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t.exercise[ex.type === 'fill_blank' ? 'fillBlank' : ex.type === 'multiple_choice' ? 'multipleChoice' : 'flashcard']}
      </div>
      {ex.type === 'flashcard'       && <Flashcard       payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'fill_blank'      && <FillBlank       payload={ex.payload} onAnswer={handleAnswer} />}
      {ex.type === 'multiple_choice' && <MultipleChoice  payload={ex.payload} onAnswer={handleAnswer} />}
    </div>
  )
}
