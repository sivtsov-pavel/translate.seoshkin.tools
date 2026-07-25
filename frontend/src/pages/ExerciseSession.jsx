import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Globe, Volume2, VolumeX, Star, Moon, SkipForward } from 'lucide-react'
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
import Conjugation from '../components/Conjugation.jsx'
import ExerciseErrorBoundary from '../components/ExerciseErrorBoundary.jsx'

// Порядок типов упражнений в уроке (педагогический, по просьбе Павла):
// вопрос-ответ → флеш-карты → вставь букву → вставь слово → напиши предложение → проговори → диктант
// Педагогический порядок прохождения (по логике Павла): карточка(разогрев) → выбери ответ →
// добавь букву → заполни пропуск → напиши предложение → проговори → склонение → диктант.
const TYPE_SEQ = { flashcard: 0, multiple_choice: 1, letter_fill: 2, fill_blank: 3, sentence_write: 4, speech: 5, conjugation: 6, dictation: 7 }
// Голосовые/на слух типы — их можно пропустить в «хвосты» (напр. ночью неудобно говорить)
const VOICE_TYPES = new Set(['speech', 'dictation'])

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
  const [tails, setTails]         = useState(0)     // «хвосты» — пропущенные упражнения этого урока
  const [inTails, setInTails]     = useState(false) // сейчас проходим хвосты
  const [lessonFlow, setLessonFlow] = useState(null) // позиция в курсе + следующий урок (финиш-экран)
  const [betweenFan, setBetweenFan] = useState(false) // мини-веер после каждого упражнения (выбор: дальше/другой тип/тренер)
  const [fanTypesOpen, setFanTypesOpen] = useState(false) // раскрыт ли список «выбрать другой тип» в мини-веере
  const [quiet, setQuiet]         = useState(() => localStorage.getItem('quiet_mode') === '1') // тихий режим
  const toggleQuiet = () => setQuiet(v => { localStorage.setItem('quiet_mode', v ? '0' : '1'); return !v })
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
        let list = [...exs]
        // Тихий режим: голосовые типы (проговори/диктант) уносим в «хвосты» — если ты не выбрал
        // их осознанно (type=speech/dictation) и не проходишь сами хвосты.
        if (quiet && !VOICE_TYPES.has(type) && !inTails) {
          list.filter(e => VOICE_TYPES.has(e.type)).forEach(e => api.post(`/exercises/${e.id}/defer`, {}).catch(() => {}))
          list = list.filter(e => !VOICE_TYPES.has(e.type))
        }
        // Педагогический порядок типов: вопрос-ответ → флеш → буква → слово → предложение → проговори → диктант
        const ordered = list.sort((a, b) => (TYPE_SEQ[a.type] ?? 99) - (TYPE_SEQ[b.type] ?? 99))
        setExercises(ordered)
        setCurrent(0)
        return ordered
      })
  }

  // Загрузка «хвостов» урока (пропущенные упражнения) — отдельная сессия
  const loadTails = () => api.get(`/exercises/deferred?lesson_id=${lessonId}`).then(exs => {
    const ordered = [...(exs || [])].sort((a, b) => (TYPE_SEQ[a.type] ?? 99) - (TYPE_SEQ[b.type] ?? 99))
    setExercises(ordered); setCurrent(0); setInTails(true); setFinished(false); setLessonDone(false)
    return ordered
  })

  useEffect(() => {
    // Сессия «хвостов» по всему курсу (?tails=1) — все пропущенные упражнения активного языка
    if (searchParams.get('tails')) {
      api.get('/exercises/deferred?all=1').then(exs => {
        const ordered = [...(exs || [])].sort((a, b) => (TYPE_SEQ[a.type] ?? 99) - (TYPE_SEQ[b.type] ?? 99))
        setExercises(ordered); setCurrent(0); setInTails(true)
      }).catch(() => {}).finally(() => setLoading(false))
      return
    }
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
    if (next >= exercises.length) { endSession(); return } // последнее — полный финиш-веер урока
    if (exam || inTails) { setCurrent(next); return }       // зачёт/хвосты — без веера, сразу дальше
    // Мини-веер показываем на ГРАНИЦЕ типа: прошёл все карточки типа (напр. все «выбери ответ») —
    // получаешь выбор. Внутри одного типа идём подряд без веера.
    if (exercises[next].type !== exercises[current].type) {
      setFanTypesOpen(false)
      setBetweenFan(true)
    } else {
      setCurrent(next)
    }
  }

  // Завершение сессии: для урока считаем «хвосты» (пропущенные) — урок пройден, только если их нет.
  const endSession = async () => {
    setDoneOffset(o => o + exercises.length)
    if (lessonId && !inTails) {
      let n = 0
      try { const d = await api.get(`/exercises/deferred?lesson_id=${lessonId}`); n = Array.isArray(d) ? d.length : 0 } catch {}
      setTails(n)
      setLessonDone(true) // урок «пройден» по упражнениям; если n>0 — предложим добить хвосты
    } else if (lessonId || inTails) {
      setLessonDone(true) // хвосты пройдены / тип урока
    }
    setFinished(true)
  }

  // Пропустить упражнение в «хвосты» (напр. «проговори слова» ночью)
  const skipExercise = async () => {
    const ex = exercises[current]
    try { await api.post(`/exercises/${ex.id}/defer`, {}) } catch {}
    const next = current + 1
    if (next >= exercises.length) endSession()
    else setCurrent(next)
  }

  // Финиш-экран урока: подтягиваем позицию в курсе + следующий урок (для «Следующий урок →»)
  useEffect(() => {
    if (finished && lessonDone && lessonId && !exam && !inTails) {
      api.get(`/exercises/lesson-flow/${lessonId}`).then(setLessonFlow).catch(() => {})
    }
  }, [finished, lessonDone, lessonId, exam, inTails])

  // «На главную» — со скроллом к своему уроку на дашборде
  const goHome = () => navigate('/', { state: lessonId ? { scrollToLesson: Number(lessonId) } : undefined })
  // Перейти к следующему уроку курса — полная перезагрузка (сессия пересоберётся под новый lesson_id)
  const goNextLesson = (nid) => { window.location.href = `/exercise-session?lesson_id=${nid}` }

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

  // Экран завершения сессии — «веер», а не тупик: следующий урок, прогресс курса, тренер, хвосты
  if (finished) {
    const hasTails = lessonDone && tails > 0 && !exam           // остались пропущенные (хвосты)
    // «Полный финиш урока» — показываем веер продолжения. Не для практики по типу и не для зачёт-режима.
    const showFan = lessonDone && !exam && !type
    const next = lessonFlow?.next
    const total = lessonFlow?.total || 0
    const pct = total ? Math.round((lessonFlow.passed / total) * 100) : 0
    const openDateStr = next?.open_date ? new Date(next.open_date).toLocaleDateString(lang) : null
    return (
      <div className="full-page-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '32px 24px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>{hasTails ? '🧩' : (lessonDone && (exam || !type) ? '🏆' : '🎉')}</div>
          <div style={{ fontFamily: 'var(--heading-font)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            {hasTails ? (t.exercise.tailsTitle || 'Почти! Остались хвосты')
              : lessonDone
                ? (exam ? (t.exercise.examPassed || 'Зачёт сдан! Урок пройден')
                   : (type ? (t.exercise.exercisesDone || 'Упражнения пройдены!') : (t.exercise.lessonPassed || 'Урок пройден!')))
                : (t.exercise.batchDone || 'Молодец! Упражнения пройдены')}
          </div>
          <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: '0 0 20px' }}>
            {hasTails ? (t.exercise.tailsSub ? t.exercise.tailsSub(tails) : `Ты пропустил ${tails} упр. (проговори/диктант). Пройди их для полного финиша урока.`)
              : lessonDone
                ? (exam ? (t.exercise.examPassedSub || 'Все слова урока пройдены. Так держать! 🎉')
                   : (type ? (t.exercise.exercisesDoneSub || 'Все упражнения этого типа сделаны.') : (t.exercise.lessonPassedSub || 'Ты прошёл все упражнения урока! 🎉')))
                : (t.exercise.batchDoneSub || 'Продолжим следующую партию.')}
          </p>

          {/* Прогресс по курсу — «Урок X из N · Y%» + полоса. Мотивирует идти дальше. */}
          {showFan && total > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 6, fontWeight: 600 }}>
                {(t.exercise.courseProgress ? t.exercise.courseProgress(lessonFlow.position, total) : `Урок ${lessonFlow.position} из ${total}`)} · {pct}%
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--good)', borderRadius: 6, transition: 'width .4s' }} />
              </div>
            </div>
          )}

          {/* Хвосты — вперёд всего: доделать пропущенное для полного финиша */}
          {hasTails && (
            <button onClick={() => loadTails()}
              style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: 'var(--gold)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              🧩 {t.exercise.doTails || 'Пройти хвосты'} ({tails})
            </button>
          )}

          {/* Практика по типу не завершена — догрузить следующую партию */}
          {!lessonDone && (
            <button onClick={continuePractice} disabled={continuing}
              style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              {continuing ? '…' : `${t.exercise.continueEx || 'Продолжить упражнения'} →`}
            </button>
          )}

          {/* ГЛАВНАЯ кнопка веера: следующий урок курса. Только когда хвостов нет (сначала доделать их). */}
          {showFan && !hasTails && next && next.playable && (
            <button onClick={() => goNextLesson(next.id)}
              style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              {t.exercise.nextLesson || 'Следующий урок'} → {getLessonTitle(next.title, next.title_translations, lang)}
            </button>
          )}
          {/* Следующий урок ещё закрыт (расписание) — показываем, когда откроется */}
          {showFan && !hasTails && next && !next.playable && (
            <div style={{ padding: '12px', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--ink-soft)', fontSize: 13.5, marginBottom: 10 }}>
              🔒 {openDateStr
                ? (t.exercise.nextLessonLocked ? t.exercise.nextLessonLocked(openDateStr) : `Следующий урок откроется ${openDateStr}`)
                : (t.exercise.nextLessonSoon || 'Следующий урок откроется по расписанию')}
            </div>
          )}
          {/* Это был последний урок курса — поздравляем */}
          {showFan && !hasTails && !next && total > 0 && (
            <div style={{ padding: '12px', borderRadius: 12, background: 'var(--good-soft, rgba(34,197,94,.12))', color: 'var(--good)', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              🎓 {t.exercise.courseDone || 'Это последний урок курса — поздравляю!'}
            </div>
          )}

          {/* Закрепить слова урока с ИИ-тренером (живой разговор по словам этого урока) */}
          {showFan && lessonId && (
            <button onClick={() => navigate(`/ai-trainer?lesson_id=${lessonId}`)}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: '1px solid var(--blue)', background: 'rgba(62,127,193,0.10)', color: 'var(--blue)', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              💬 {t.exercise.trainWords || 'Тренер по словам урока'}
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
  // Подписи типов — для бейджа и мини-веера
  const TYPE_LABELS = { flashcard: t.exercise.flashcard, fill_blank: t.exercise.fillBlank, multiple_choice: t.exercise.multipleChoice, sentence_write: t.exercise.sentenceWrite, letter_fill: t.exercise.letterFill, dictation: t.exercise.dictation, speech: t.exercise.speech || 'Произношение', conjugation: t.exercise.conjugation || 'Склонение' }

  // Мини-веер ПОСЛЕ каждого упражнения (в уроке): не гоним линейно, а даём выбор —
  // дальше по логике / прыгнуть на другой тип урока / тренер по словам / на главную.
  if (betweenFan) {
    const doneN = doneOffset + current + 1
    const totalN = doneOffset + exercises.length
    // Типы, реально присутствующие в сессии урока: { type, first (индекс начала), count }
    const typeAgg = []
    exercises.forEach((e, i) => {
      let row = typeAgg.find(r => r.type === e.type)
      if (!row) typeAgg.push(row = { type: e.type, first: i, count: 0, done: 0 })
      row.count++
      if (i <= current) row.done++ // карточки до текущей (включительно) уже пройдены
    })
    const goNext = () => { setBetweenFan(false); setCurrent(current + 1) }
    const jumpToType = (first) => { setFanTypesOpen(false); setBetweenFan(false); setCurrent(first) }
    return (
      <div className="full-page-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '28px 22px', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>✅</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600, marginBottom: 18 }}>
            {t.exercise.fanProgress ? t.exercise.fanProgress(doneN, totalN) : `Сделано ${doneN} из ${totalN} в уроке`}
          </div>
          {/* Главная — продолжить по педагогическому порядку */}
          <button onClick={goNext}
            style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
            {t.exercise.fanNext || 'Дальше по логике'} →
          </button>
          {/* Выбрать другой тип упражнения этого урока — без возврата на главную */}
          {typeAgg.length > 1 && (
            <>
              <button onClick={() => setFanTypesOpen(o => !o)}
                style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: fanTypesOpen ? 6 : 10 }}>
                {t.exercise.fanOtherType || 'Выбрать другой тип'} {fanTypesOpen ? '▴' : '▾'}
              </button>
              {fanTypesOpen && (
                <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {typeAgg.map(r => {
                    const finished = r.done >= r.count // тип пройден полностью
                    return (
                      <button key={r.type} onClick={() => jumpToType(r.first)}
                        style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: '1px solid var(--line)', background: r.type === ex.type ? 'rgba(62,127,193,0.10)' : 'var(--surface)', color: finished ? 'var(--ink-soft)' : 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{finished ? '✓ ' : ''}{TYPE_LABELS[r.type] || r.type}</span>
                        <span style={{ color: finished ? 'var(--good)' : 'var(--ink-soft)', flexShrink: 0 }}>
                          {finished ? (t.exercise.fanTypeDone || 'готово') : `${r.done}/${r.count}`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
          {/* Закрепить слова урока с ИИ-тренером */}
          {lessonId && (
            <button onClick={() => navigate(`/ai-trainer?lesson_id=${lessonId}`)}
              style={{ width: '100%', padding: '13px', borderRadius: 14, border: '1px solid var(--blue)', background: 'rgba(62,127,193,0.10)', color: 'var(--blue)', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              💬 {t.exercise.trainWords || 'Тренер по словам урока'}
            </button>
          )}
          <button onClick={goHome}
            style={{ width: '100%', padding: '10px', borderRadius: 14, border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            · {t.exercise.toHome || 'На главную'} ·
          </button>
        </div>
      </div>
    )
  }

  const lessonTitle = getLessonTitle(ex.lesson_title, ex.lesson_title_translations, lang)
  const typeLabel = TYPE_LABELS[ex.type]

  return (
    <div className="full-page-layout exercise-session-page">
      {/* Мини-бейдж типа упражнения */}
      <div className="exercise-session-type">
        <span style={{ background: 'rgba(62,127,193,0.12)', color: 'var(--blue)', borderRadius: 8, padding: '2px 9px', fontWeight: 700, fontSize: 12, marginRight: 8 }}>
          {doneOffset + current + 1} / {doneOffset + exercises.length}
        </span>
        {/* Название типа теперь показывается внутри карточки упражнения (над 📚 lessonTitle) — здесь дубль убран */}
        {/* Пропустить голосовое (проговори/диктант) в хвосты — если не осознанный выбор типа */}
        {VOICE_TYPES.has(ex.type) && !exam && type !== ex.type && (
          <button onClick={skipExercise} title={t.exercise.skipTitle}
            style={{ marginLeft: 10, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--gold)', background: 'var(--yellow-soft)', color: 'var(--gold-dark)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <SkipForward size={13} /> {t.exercise.skip || 'Пропустить'}
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Учитель: глобус — показать перевод слова на локали ученика (проверка) */}
          {user?.role === 'owner' && (
            <button onClick={toggleOrigView}
              title={showOriginal ? t.exercise.origViewOnTitle : t.exercise.origViewOffTitle}
              style={{ ...hdrBtn, display: 'flex', alignItems: 'center',
                border: `1px solid ${showOriginal ? 'var(--blue)' : 'var(--line)'}`,
                background: showOriginal ? 'rgba(62,127,193,0.12)' : 'var(--surface-2)',
                color: showOriginal ? 'var(--blue)' : 'var(--ink-soft)' }}>
              <Globe size={16} />
            </button>
          )}
          {/* Быстрый тумблер озвучки тренера */}
          <button onClick={toggleReactions}
            title={reactionsOn ? t.exercise.reactionsOnTitle : t.exercise.reactionsOffTitle}
            style={{ ...hdrBtn, display: 'flex', alignItems: 'center',
              border: `1px solid ${reactionsOn ? 'var(--blue)' : 'var(--line)'}`,
              background: reactionsOn ? 'rgba(62,127,193,0.12)' : 'var(--surface-2)',
              color: reactionsOn ? 'var(--blue)' : 'var(--ink-soft)' }}>
            {reactionsOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          {/* 🌙 Тихий режим — авто-пропуск голосовых (проговори/диктант) в хвосты (для ночи) */}
          <button onClick={toggleQuiet}
            title={quiet ? t.exercise.quietOnTitle : t.exercise.quietOffTitle}
            style={{ ...hdrBtn, display: 'flex', alignItems: 'center',
              border: `1px solid ${quiet ? 'var(--gold)' : 'var(--line)'}`,
              background: quiet ? 'var(--yellow-soft)' : 'var(--surface-2)',
              color: quiet ? 'var(--gold-dark)' : 'var(--ink-soft)' }}>
            <Moon size={16} />
          </button>
          {ex.word_id && (
            <button onClick={() => markLearning(ex.word_id)} disabled={starred.has(ex.word_id)}
              title={t.exercise.markLearningTitle}
              style={{ padding: '4px 10px', borderRadius: 8, cursor: starred.has(ex.word_id) ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                border: `1px solid ${starred.has(ex.word_id) ? 'var(--good, #16a34a)' : 'var(--gold)'}`,
                background: starred.has(ex.word_id) ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--yellow-soft)',
                color: starred.has(ex.word_id) ? 'var(--good, #16a34a)' : 'var(--gold-dark)' }}>
              <Star size={13} fill={starred.has(ex.word_id) ? 'currentColor' : 'none'} /> {starred.has(ex.word_id) ? t.exercise.inLearning : t.exercise.toLearning}
            </button>
          )}
        </div>
      </div>

      {/* Контент упражнения — заполняет оставшееся место */}
      <div className="exercise-session-content" ref={contentRef}>
      <ExerciseErrorBoundary resetKey={ex.id} onSkip={() => { const n = current + 1; if (n >= exercises.length) endSession(); else setCurrent(n) }}>
        {ex.type === 'flashcard'       && <Flashcard      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} showOriginal={showOriginal} wordId={ex.word_id} onMarkLearning={markLearning} learned={starred.has(ex.word_id)} />}
        {ex.type === 'fill_blank'      && <FillBlank      key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} imageUrl={ex.image_url} payloadTranslations={ex.payload_translations} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} showOriginal={showOriginal} />}
        {ex.type === 'multiple_choice' && <MultipleChoice key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} wordDe={ex.word_de} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} payloadTranslations={ex.payload_translations} exerciseId={ex.id} showOriginal={showOriginal} />}
        {ex.type === 'sentence_write'  && <SentenceWrite  key={ex.id} exercise={ex}        onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} payloadTranslations={ex.payload_translations} showOriginal={showOriginal} />}
        {ex.type === 'letter_fill'     && <LetterFill     key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} showOriginal={showOriginal} />}
        {ex.type === 'dictation'       && <Dictation       key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} showOriginal={showOriginal} />}
        {ex.type === 'conjugation'     && <Conjugation     key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} />}
        {ex.type === 'speech'          && <SpeechExercise  key={ex.id} payload={ex.payload} onAnswer={handleAnswer} lessonTitle={lessonTitle} typeLabel={typeLabel} imageUrl={ex.image_url} translations={ex.translations} translationRu={ex.translation_ru} exerciseId={ex.id} showOriginal={showOriginal} />}
      </ExerciseErrorBoundary>
      </div>
    </div>
  )
}

const hdrBtn = { padding: '5px 8px', borderRadius: 8, cursor: 'pointer', lineHeight: 1 }
