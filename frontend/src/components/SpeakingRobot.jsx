// Робот-диктор: пока приложение произносит слово, у него на «лице» бегут диоды.
//
// Идея Павла: в Duolingo персонаж шевелит ртом во время речи; рисовать анимацию рта
// дорого и она быстро приедается, а робот с бегущими диодами читается однозначно —
// светится, значит сейчас говорят, и надо слушать. Плюс он одинаково уместен и в
// диктанте, и в упражнении на произношение.
//
// Всё на CSS: ни картинок, ни библиотек — компонент лёгкий и работает офлайн.
export default function SpeakingRobot({ speaking = false, size = 84, label = null }) {
  const scale = size / 84
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: size, height: size * 0.86, borderRadius: 22 * scale,
        background: 'linear-gradient(160deg, #6B3AA0, #4A2570)',
        border: `${3 * scale}px solid rgba(255,255,255,0.14)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8 * scale, position: 'relative',
        boxShadow: speaking ? '0 0 0 8px rgba(232,176,36,0.18)' : 'none',
        transition: 'box-shadow .2s',
      }}>
        {/* антенна */}
        <span style={{
          position: 'absolute', top: -10 * scale, left: '50%', transform: 'translateX(-50%)',
          width: 3 * scale, height: 10 * scale, background: 'rgba(255,255,255,0.35)', borderRadius: 2,
        }}>
          <span style={{
            position: 'absolute', top: -5 * scale, left: '50%', transform: 'translateX(-50%)',
            width: 8 * scale, height: 8 * scale, borderRadius: '50%',
            background: speaking ? '#E8B024' : 'rgba(255,255,255,0.4)',
            transition: 'background .2s',
          }} />
        </span>

        {/* глаза */}
        <div style={{ display: 'flex', gap: 14 * scale }}>
          {[0, 1].map(i => (
            <span key={i} style={{
              width: 11 * scale, height: 11 * scale, borderRadius: '50%',
              background: '#9BE8FF', boxShadow: '0 0 8px rgba(155,232,255,0.7)',
            }} />
          ))}
        </div>

        {/* рот-диоды: бегут, пока идёт речь */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 * scale, height: 18 * scale }}>
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className={speaking ? 'robot-led robot-led--on' : 'robot-led'}
              style={{ width: 4 * scale, animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
      </div>

      {label && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 600 }}>{label}</div>}
    </div>
  )
}
