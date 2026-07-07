export default function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#6b7280' }}>
        <span>{current} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#4f46e5', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}
