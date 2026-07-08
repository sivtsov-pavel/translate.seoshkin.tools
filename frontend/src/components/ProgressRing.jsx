export default function ProgressRing({ pct, done, total, label }) {
  const size = 88
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = circ * (Math.max(pct, pct > 0 ? 4 : 0) / 100)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 20px 16px' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth="7"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .8s cubic-bezier(.4,0,.2,1)' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{pct}%</span>
          <span style={{ fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.4 }}>{done}/{total}</span>
        </div>
      </div>
      <div>
        <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{label}</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
          {done} из {total}
        </div>
      </div>
    </div>
  )
}
