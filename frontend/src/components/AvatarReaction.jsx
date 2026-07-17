import { useState, useEffect, useRef } from 'react'
import WordImage, { PabloCircle } from './WordImage.jsx'
import { playCorrect, playWrong } from '../utils/sound.js'

// Показывает медиа-область слова; при reaction ('correct'|'wrong') Pablo оживает
// видео-клипом В КРУЖКЕ (рамка красится по реакции), договаривает «Sehr gut»/«Nicht ganz»,
// затем onReactionEnd (упражнение листает/скроллит ТОЛЬКО тогда). Можно отключить в настройках.
export default function AvatarReaction({ imageUrl, wordDe, reaction, onReactionEnd }) {
  const [clip, setClip] = useState(null)
  const endedRef = useRef(false)

  useEffect(() => {
    if (reaction !== 'correct' && reaction !== 'wrong') return
    endedRef.current = false
    if (localStorage.getItem('trainer_reactions') === 'false') {
      // Озвучка выключена — вместо голоса аватара короткий звук: приятный «верно» / грубый «неверно»
      if (reaction === 'correct') playCorrect(); else playWrong()
      const t = setTimeout(() => end(), 700)
      return () => clearTimeout(t)
    }
    setClip(reaction === 'correct' ? '/avatar/clips/correct.mp4' : '/avatar/clips/wrong.mp4')
    const safety = setTimeout(() => end(), 5000)
    return () => clearTimeout(safety)
  }, [reaction])

  const end = () => {
    if (endedRef.current) return
    endedRef.current = true
    setClip(null)
    onReactionEnd?.()
  }

  if (clip) {
    return (
      <div className="word-image-bleed">
        <PabloCircle wordDe={wordDe} reaction={reaction}>
          <video src={clip} autoPlay playsInline onEnded={end} onError={end} />
        </PabloCircle>
      </div>
    )
  }
  return <WordImage imageUrl={imageUrl} wordDe={wordDe} bleed />
}
