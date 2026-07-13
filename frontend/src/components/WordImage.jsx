import { useState } from 'react'

const PABLO = '/avatar/pablo.jpg'

// Кружок с аватаром Pablo и пульсирующей рамкой (жёлтая в покое, красная когда говорит).
// children — видео-реакция (если играет), иначе статичное фото.
export function PabloCircle({ reaction, children }) {
  const cls = 'pablo-circle' + (reaction ? ' speaking' : '')
  return (
    <div className={cls}>
      {children || <img src={PABLO} alt="" />}
    </div>
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
