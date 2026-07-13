import { useState } from 'react'

const PABLO = '/avatar/pablo.jpg'

// Кружок с аватаром Pablo и пульсирующей рамкой в цветах Германии (красно-жёлтая).
// children — видео-реакция (если играет), иначе статичное фото. reaction красит рамку.
export function PabloCircle({ wordDe, reaction, children }) {
  const article = wordDe?.match(/^(der|die|das|ein|eine)\s+/i)?.[1] || ''
  const label = wordDe ? wordDe.replace(/^(der|die|das|ein|eine)\s+/i, '') : ''
  const cls = 'pablo-circle' + (reaction === 'correct' ? ' react-correct' : reaction === 'wrong' ? ' react-wrong' : '')
  return (
    <>
      <div className={cls}>
        {children || <img src={PABLO} alt="" />}
      </div>
      {label && (
        <div className="pablo-word">
          {article && <span className="pablo-art">{article}</span>}
          {label}
        </div>
      )}
    </>
  )
}

// Медиа-область упражнения (фикс 4:3 на фоне). Есть фото слова → показываем его по центру
// (contain, не режем/не тянем). Нет фото → аватар Pablo в кружке с пульсацией.
export default function WordImage({ imageUrl, wordDe, bleed = false }) {
  const [status, setStatus] = useState('loading')

  if (bleed) {
    if (imageUrl && status !== 'error') {
      return (
        <div className="word-image-bleed has-photo">
          <img className="word-photo" src={imageUrl} alt="" onLoad={() => setStatus('ok')} onError={() => setStatus('error')} />
        </div>
      )
    }
    return (
      <div className="word-image-bleed">
        <PabloCircle wordDe={wordDe} />
      </div>
    )
  }

  // Небольшой вариант (не bleed) — компактный кружок Pablo
  return (
    <div className="word-image-mini">
      {imageUrl && status !== 'error'
        ? <img src={imageUrl} alt="" onError={() => setStatus('error')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <img src={PABLO} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  )
}
