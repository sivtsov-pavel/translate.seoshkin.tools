import { useEffect, useRef } from 'react'

// 🎉 Конфетти на финише урока: canvas поверх экрана, без библиотек.
// Сыплется duration мс, потом ~1.5 сек дорисовывает хвост с затуханием и останавливается.
export default function Confetti({ duration = 2500 }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width = window.innerWidth * dpr
    const H = canvas.height = window.innerHeight * dpr
    const COLORS = ['#FFCE00', '#DD0000', '#3E7FC1', '#4E9A6E', '#7C5CFF', '#FF8A3D']
    const parts = Array.from({ length: 140 }, () => ({
      x: Math.random() * W,
      y: -20 * dpr - Math.random() * H * 0.35,
      w: (5 + Math.random() * 6) * dpr,
      h: (9 + Math.random() * 8) * dpr,
      vx: (Math.random() - 0.5) * 2.2 * dpr,
      vy: (2 + Math.random() * 3.2) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.22,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    }))
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = now - start
      ctx.clearRect(0, 0, W, H)
      if (t > duration + 1500) return // праздник окончен
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr
        // Пока идёт праздник — упавшие частицы сыпем заново сверху
        if (t < duration && p.y > H + 20) { p.y = -20 * dpr; p.x = Math.random() * W }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = t > duration ? Math.max(0, 1 - (t - duration) / 1500) : 1
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [duration])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 500 }} />
}
