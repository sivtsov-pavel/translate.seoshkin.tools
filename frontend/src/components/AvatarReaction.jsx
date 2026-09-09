import { useState, useEffect, useRef } from 'react'
import WordImage, { PabloCircle } from './WordImage.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'
import { speakWithEvents, uiLocale } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'

// Медиа-область слова, а при ответе (reaction 'correct'|'wrong') — реакция Pablo:
// кружок с зелёной или красной рамкой и похвала голосом. Дальше упражнение листается
// ТОЛЬКО после onReactionEnd, чтобы не обрывать реакцию на полуслове.
//
// Похвала звучит НА ЯЗЫКЕ УЧЕНИКА. Раньше здесь проигрывался видеоклип с немецким
// «Sehr gut» / «Nicht ganz» (генерировали в D-ID, как эксперимент). В классе десять
// стран, и большинство слышало непонятный набор звуков вместо похвалы — замечание
// Павла 09.09.2026. Клип убран совсем: перезаписывать его на десять языков значит
// платить D-ID за каждую, а синтез речи говорит на любой локали бесплатно и сразу.
//
// Выключается там же, где и раньше — тумблер «реакции тренера» в упражнении
// (trainer_reactions). Выключен — вместо голоса короткий звук верно/неверно.
//
// fill=true — режим «как в вопрос-ответ»: картинка заполняет РОДИТЕЛЬСКИЙ блок
// (квадрат во всю ширину карточки), без старой медиа-области 4:3 с потолком высоты.
export default function AvatarReaction({ imageUrl, wordDe, reaction, onReactionEnd, fill = false }) {
  const [showing, setShowing] = useState(false)   // идёт реакция: кружок с цветной рамкой
  const endedRef = useRef(false)
  const { t, lang } = useI18nStore()

  useEffect(() => {
    if (reaction !== 'correct' && reaction !== 'wrong') return
    endedRef.current = false

    // Реакции выключены — короткий звук вместо голоса: приятный «верно» / грубый «неверно»
    if (localStorage.getItem('trainer_reactions') === 'false') {
      if (reaction === 'correct') playCorrect(); else playWrong()
      const quick = setTimeout(() => end(), 700)
      return () => clearTimeout(quick)
    }

    setShowing(true)
    const phrase = reaction === 'correct' ? t.exercise.praiseCorrect : t.exercise.praiseWrong
    // Листаем сразу после того, как фраза договорена, а не по фиксированному таймеру:
    // «Almost! Try again» длиннее, чем «Отлично!», и общий таймер резал бы её.
    speakWithEvents(phrase, uiLocale(lang), { onEnd: () => end() })
    // Страховка: синтеза может не быть вовсе (нет голосов, выключен звук системы) —
    // без неё упражнение зависло бы навсегда.
    const safety = setTimeout(() => end(), 4000)
    return () => clearTimeout(safety)
  }, [reaction])   // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => {
    if (endedRef.current) return
    endedRef.current = true
    setShowing(false)
    onReactionEnd?.()
  }

  if (showing) {
    return (
      <div className={fill ? undefined : 'word-image-bleed'}
        style={fill ? { width: '100%', height: '100%', display: 'grid', placeItems: 'center' } : undefined}>
        <PabloCircle wordDe={wordDe} reaction={reaction} />
      </div>
    )
  }
  if (fill) {
    return imageUrl
      ? <img src={imageUrl} alt="" loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
          <PabloCircle wordDe={wordDe} />
        </div>
  }
  return <WordImage imageUrl={imageUrl} wordDe={wordDe} bleed />
}
