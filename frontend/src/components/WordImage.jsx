import { useState } from 'react'

// Берём только существо слова без артикля: "der Hund" → "Hund"
function cleanWord(wordDe) {
  return wordDe.replace(/^(der|die|das|ein|eine)\s+/i, '').split(' ')[0]
}

export default function WordImage({ wordDe, size = 260 }) {
  const [status, setStatus] = useState('loading') // loading | ok | error
  const word = cleanWord(wordDe)
  const src  = `https://source.unsplash.com/${size}x${Math.round(size * 0.65)}/?${encodeURIComponent(word)},german`

  if (status === 'error') return null

  return (
    <div style={{
      width: size, maxWidth: '100%', borderRadius: 10, overflow: 'hidden',
      backgroundColor: '#f3f4f6', margin: '0 auto 14px',
      aspectRatio: `${size}/${Math.round(size * 0.65)}`,
      position: 'relative',
    }}>
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#d1d5db', fontSize: 28,
        }}>🖼️</div>
      )}
      <img
        src={src}
        alt={wordDe}
        onLoad={() => setStatus('ok')}
        onError={() => setStatus('error')}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: status === 'ok' ? 1 : 0, transition: 'opacity .3s',
          display: 'block',
        }}
      />
    </div>
  )
}
