import { useState } from 'react'

const PABLO = '/avatar/pablo-face.jpg'

// Для наших оптимизированных картинок (word_<id>.webp) есть парный маленький вариант
// word_<id>_sm.webp (384px). Строим srcSet: мобильный тянет маленький, десктоп — большой.
// Для прочих url (старые jpg/внешние) srcSet не строим — грузится как есть.
function optimizedPair(url) {
  if (!url) return null
  const m = url.match(/^(.*\/word-images\/word_\d+)\.webp(\?.*)?$/)
  if (!m) return null
  const q = m[2] || ''
  return { small: `${m[1]}_sm.webp${q}`, large: url }
}
const IMG_SIZES = '(max-width: 640px) 45vw, 400px'

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

  const pair = optimizedPair(imageUrl)

  if (bleed) {
    if (imageUrl && status !== 'error') {
      return (
        <div className="word-image-bleed has-photo">
          <img className="word-photo" src={imageUrl} alt="" loading="lazy"
            srcSet={pair ? `${pair.small} 384w, ${pair.large} 768w` : undefined}
            sizes={pair ? IMG_SIZES : undefined}
            onLoad={() => setStatus('ok')} onError={() => setStatus('error')} />
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
        ? <img src={pair ? pair.small : imageUrl} alt="" loading="lazy"
            srcSet={pair ? `${pair.small} 384w, ${pair.large} 768w` : undefined}
            sizes={pair ? IMG_SIZES : undefined}
            onError={() => setStatus('error')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <img src={PABLO} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  )
}
