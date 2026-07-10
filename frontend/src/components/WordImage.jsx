import { useState } from 'react'

function TextPlaceholder({ wordDe, bleed }) {
  const article = wordDe?.match(/^(der|die|das|ein|eine)\s+/i)?.[1] || ''
  const label = wordDe ? wordDe.replace(/^(der|die|das|ein|eine)\s+/i, '') : ''
  const articleColor = { der: '#4f8ef7', die: '#e05c8a', das: '#2bb07a', ein: '#888', eine: '#e05c8a' }[article.toLowerCase()] || 'var(--ink-soft)'

  if (bleed) {
    return (
      <div className="word-image-bleed" style={{
        background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--surface) 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--line)',
      }}>
        {article && <span style={{ fontSize: 13, fontWeight: 600, color: articleColor, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{article}</span>}
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Georgia,serif', textAlign: 'center', padding: '0 16px' }}>{label}</span>
      </div>
    )
  }
  return (
    <div style={{
      width: 120, maxWidth: '100%', borderRadius: 10, margin: '0 auto 12px',
      aspectRatio: '4/3', border: '1px solid var(--line)',
      background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--surface) 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    }}>
      {article && <span style={{ fontSize: 10, fontWeight: 700, color: articleColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{article}</span>}
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Georgia,serif', textAlign: 'center', padding: '0 6px', lineHeight: 1.2 }}>{label}</span>
    </div>
  )
}

export default function WordImage({ imageUrl, wordDe, bleed = false }) {
  const [status, setStatus] = useState('loading')

  if (!imageUrl || status === 'error') return <TextPlaceholder wordDe={wordDe} bleed={bleed} />

  if (bleed) {
    return (
      <div className="word-image-bleed">
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
