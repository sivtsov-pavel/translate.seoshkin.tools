import { useState } from 'react'

export default function WordImage({ imageUrl, bleed = false }) {
  const [status, setStatus] = useState('loading')

  if (!imageUrl) return null
  if (status === 'error') return null

  if (bleed) {
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9',
        overflow: 'hidden', background: 'var(--surface-2)',
        position: 'relative', flexShrink: 0,
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

  return (
    <div style={{
      width: 120, maxWidth: '100%', borderRadius: 10, overflow: 'hidden',
      background: 'var(--surface-2)', margin: '0 auto 12px',
      aspectRatio: '4/3', position: 'relative',
    }}>
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 20 }}>
          🖼️
        </div>
      )}
      <img src={imageUrl} alt="" onLoad={() => setStatus('ok')} onError={() => setStatus('error')}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: status === 'ok' ? 1 : 0, transition: 'opacity .3s', display: 'block' }} />
    </div>
  )
}
