import { useState } from 'react'

export default function WordImage({ imageUrl, size = 260 }) {
  const [status, setStatus] = useState('loading')

  if (!imageUrl) return null
  if (status === 'error') return null

  return (
    <div style={{
      width: size, maxWidth: '100%', borderRadius: 12, overflow: 'hidden',
      background: 'var(--surface-2)', margin: '0 auto 14px',
      aspectRatio: `${size}/${Math.round(size * 0.65)}`,
      position: 'relative',
    }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 28 }}>
          🖼️
        </div>
      )}
      <img src={imageUrl} alt="" onLoad={() => setStatus('ok')} onError={() => setStatus('error')}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: status === 'ok' ? 1 : 0, transition: 'opacity .3s', display: 'block' }} />
    </div>
  )
}
