import { useState } from 'react'

function TextPlaceholder({ wordDe, bleed }) {
  const label = wordDe ? wordDe.replace(/^(der|die|das|ein|eine)\s+/i, '') : ''
  if (bleed) {
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9', background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-soft)', textAlign: 'center', padding: 8 }}>{label}</span>
      </div>
    )
  }
  return (
    <div style={{
      width: 120, maxWidth: '100%', borderRadius: 10, margin: '0 auto 12px',
      aspectRatio: '4/3', background: 'var(--surface-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-soft)', textAlign: 'center', padding: 6 }}>{label}</span>
    </div>
  )
}

export default function WordImage({ imageUrl, wordDe, bleed = false }) {
  const [status, setStatus] = useState('loading')

  if (!imageUrl || status === 'error') return <TextPlaceholder wordDe={wordDe} bleed={bleed} />

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
