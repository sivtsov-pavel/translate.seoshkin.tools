let ctx = null
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  // Браузеры создают AudioContext в состоянии suspended до первого
  // жеста пользователя — без resume() звук не воспроизводится (особенно мобилки)
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Разблокировка звука на первом же взаимодействии пользователя со страницей.
// Один раз создаём/резюмируем контекст, дальше слушатели снимаются.
function unlockAudio() {
  getCtx()
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', unlockAudio)
  window.removeEventListener('touchstart', unlockAudio)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: true })
  window.addEventListener('keydown', unlockAudio, { once: true })
  window.addEventListener('touchstart', unlockAudio, { once: true })
}

function beep(freq, startTime, duration, gain = 0.18) {
  const ac = getCtx()
  const osc = ac.createOscillator()
  const g   = ac.createGain()
  osc.connect(g)
  g.connect(ac.destination)
  osc.frequency.value = freq
  osc.type = 'sine'
  g.gain.setValueAtTime(0, startTime)
  g.gain.linearRampToValueAtTime(gain, startTime + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)
}

export function playCorrect() {
  try {
    const ac = getCtx()
    const t = ac.currentTime
    beep(523, t,        0.12)  // C5
    beep(659, t + 0.10, 0.18)  // E5
  } catch {}
}

export function playWrong() {
  try {
    const ac = getCtx()
    const t = ac.currentTime
    beep(220, t,        0.08, 0.15)  // A3
    beep(196, t + 0.07, 0.15, 0.12)  // G3
  } catch {}
}
