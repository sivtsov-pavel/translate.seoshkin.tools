// Работа с таймзоной пользователя (IANA) без внешних библиотек — через Intl.
// DST учитывается автоматически. Используется кронами напоминаний, чтобы слать пуши
// по ЛОКАЛЬНОМУ времени юзера, а не по фиксированному UTC.

// Дефолтные настройки уведомлений (если у юзера пусто/поле отсутствует).
export const DEFAULT_NOTIFY_PREFS = {
  morning:    { on: true, time: '09:00' },
  evening:    { on: true, time: '21:30' },
  milestones: { on: true },
}

// Валидна ли IANA-таймзона (напр. 'Europe/Berlin'). Пустая/кривая → false.
export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// 'HH:MM' → минуты от полуночи (0..1439). Некорректно → null.
export function hmToMinutes(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim())
  if (!m) return null
  const h = parseInt(m[1]), mi = parseInt(m[2])
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
  return h * 60 + mi
}

const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

// Локальные компоненты текущего момента в заданной таймзоне:
//   { date:'YYYY-MM-DD', hour, minute, minutes (от полуночи), isoWeekday (1=Пн..7=Вс) }.
// Невалидная TZ → откат на UTC (не роняем крон).
export function localParts(timezone, now = new Date()) {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(now)
  const m = {}
  for (const p of parts) m[p.type] = p.value
  const hour = parseInt(m.hour === '24' ? '00' : m.hour) // некоторые движки дают '24' в полночь
  const minute = parseInt(m.minute)
  return {
    date: `${m.year}-${m.month}-${m.day}`,
    hour,
    minute,
    minutes: hour * 60 + minute,
    isoWeekday: WD[m.weekday] || 1,
  }
}

// Санитизация notify_prefs из клиента → безопасная структура с дефолтами.
export function sanitizeNotifyPrefs(input) {
  const src = (input && typeof input === 'object') ? input : {}
  const out = JSON.parse(JSON.stringify(DEFAULT_NOTIFY_PREFS))
  for (const slot of ['morning', 'evening']) {
    if (src[slot] && typeof src[slot] === 'object') {
      if (typeof src[slot].on === 'boolean') out[slot].on = src[slot].on
      if (hmToMinutes(src[slot].time) != null) out[slot].time = src[slot].time
    }
  }
  if (src.milestones && typeof src.milestones.on === 'boolean') out.milestones.on = src.milestones.on
  return out
}
