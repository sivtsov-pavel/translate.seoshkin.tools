import { useState, useEffect, useRef } from 'react'
import WordImage from './WordImage.jsx'

// Показывает картинку слова (или аватар Pablo, если фото нет).
// При reaction ('correct' | 'wrong') проигрывает видео-клип реакции наставника
// НА ВСЮ ШИРИНУ (его лицо оживает и озвучивает «Sehr gut!» / «Nicht ganz»).
// Когда клип договорил — вызывает onReactionEnd (упражнение листает/скроллит ТОЛЬКО тогда).
export default function AvatarReaction({ imageUrl, wordDe, reaction, onReactionEnd }) {
  const [clip, setClip] = useState(null)
  const endedRef = useRef(false)

  useEffect(() => {
    if (reaction !== 'correct' && reaction !== 'wrong') return
    endedRef.current = false
    setClip(reaction === 'correct' ? '/avatar/clips/correct.mp4' : '/avatar/clips/wrong.mp4')
    // Страховка: если видео не проиграется/не отдаст onEnded — листаем через 5с
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
    // avatar-reacting раскрывает аватар во всю ширину (даже в горизонтальном layout десктопа)
    return (
      <div className="word-image-bleed avatar-reacting" style={{ position: 'relative' }}>
        <video src={clip} autoPlay playsInline onEnded={end} onError={end}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }
  return <WordImage imageUrl={imageUrl} wordDe={wordDe} bleed />
}
