import { useState, useEffect } from 'react'
import WordImage from './WordImage.jsx'

// Показывает картинку слова (или аватар Pablo, если фото нет).
// При reaction ('correct' | 'wrong') проигрывает видео-клип реакции наставника
// (его лицо оживает и озвучивает «Sehr gut!» / «Nicht ganz»), затем возвращается к картинке.
// Объединяет упражнения с AI-тренером — один живой Pablo везде.
export default function AvatarReaction({ imageUrl, wordDe, reaction }) {
  const [clip, setClip] = useState(null)

  useEffect(() => {
    if (reaction === 'correct') setClip('/avatar/clips/correct.mp4')
    else if (reaction === 'wrong') setClip('/avatar/clips/wrong.mp4')
  }, [reaction])

  if (clip) {
    return (
      <div className="word-image-bleed" style={{ position: 'relative' }}>
        <video src={clip} autoPlay playsInline onEnded={() => setClip(null)} onError={() => setClip(null)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }
  return <WordImage imageUrl={imageUrl} wordDe={wordDe} bleed />
}
