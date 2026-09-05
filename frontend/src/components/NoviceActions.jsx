import { useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Camera, Play } from 'lucide-react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle } from '../utils/translation.js'
import CameraWords from './CameraWords.jsx'

// Плавающие кнопки режима «новичок»: «Старт / Продолжить» и камера.
//
// Обе — по жалобам первых учеников (05.09.2026). Три человека подряд сказали, что при
// входе непонятно, что делать: дорога есть, а точки входа нет. Поэтому кнопка висит
// поверх ВСЕХ экранов новичка и всегда отвечает на один вопрос — «продолжить откуда?»:
// урок не начат → стартует первый, начат → продолжает с того места, где остановился
// (упражнения на сегодня сервер и так отдаёт без уже сделанных).
//
// Камеру («сфотографировать текст») в новом дизайне потеряли — в полном интерфейсе она
// живёт в правом углу главной, здесь возвращаем ровно туда же.

// Экраны, где кнопка мешает: само занятие и станции — там своя навигация,
// и «Старт» поверх упражнения только сбивает.
const HIDE_ON = ['/exercise-session', '/checkpoint', '/phrases', '/print', '/w/']

export default function NoviceActions() {
  const { t, lang } = useI18nStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [resume, setResume] = useState(null)

  const load = useCallback(() => {
    api.get('/path/resume').then(setResume).catch(() => {})
  }, [])

  // Обновляем при возврате в приложение и при заходе на главную: после занятия «Старт»
  // должен звать в следующий урок, а не в только что пройденный. На остальных переходах
  // берём то, что уже знаем: ответ считается по дрипу и стоит нескольких запросов к базе —
  // дёргать его на каждый тап по навигации незачем.
  useEffect(() => {
    if (location.pathname === '/' || !resume) load()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  if (HIDE_ON.some(p => location.pathname.startsWith(p))) return null

  const isHome = location.pathname === '/'
  const mode = resume?.mode
  const canStart = mode === 'start' || mode === 'continue' || mode === 'repeat'
  const label = mode === 'continue' ? t.path.resumeContinue
    : mode === 'repeat' ? t.path.resumeRepeat
    : t.path.resumeStart

  return (
    <div className="novice-actions">
      {/* Камера — только на главной, как в полном интерфейсе */}
      {isHome && (
        <CameraWords mode="sentences" renderTrigger={(pick, busy) => (
          <button className="novice-act novice-act--camera" onClick={pick} disabled={busy}
            title={t.dashboard.cameraTitle} aria-label={t.dashboard.cameraTitle}>
            {busy ? '…' : <Camera size={20} />}
          </button>
        )} />
      )}

      {canStart && (
        <button className="novice-act novice-act--start"
          onClick={() => navigate(`/exercise-session?lesson_id=${resume.lesson_id}`)}
          title={getLessonTitle(resume.title, resume.title_translations, lang) || label}>
          <Play size={19} fill="currentColor" strokeWidth={0} />
          <span>{label}</span>
        </button>
      )}
    </div>
  )
}
