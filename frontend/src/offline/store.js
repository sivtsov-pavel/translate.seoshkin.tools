// Офлайн-ядро: предзагрузка словаря и упражнений, локальный SM-2,
// очередь ответов с синхронизацией при появлении сети.
// Данные — в IndexedDB (см. db.js), картинки кэширует сервис-воркер (CacheFirst).
import { api } from '../api/client.js'
import { idbGetAll, idbPut, idbPutAll, idbClear, idbDelete, idbGet, idbCount } from './db.js'

const SYNC_INTERVAL_MS = 30 * 60 * 1000 // фоновая пересинхронизация не чаще раза в 30 минут
const IMAGE_PREFETCH_LIMIT = 800        // сколько мелких картинок прогреть в кэш SW

export const isOnline = () => navigator.onLine !== false

// ── Загрузка с сервера в IndexedDB ───────────────────────────────────────────
let syncing = false
export async function syncDown(force = false) {
  if (syncing || !isOnline()) return false
  const meta = await idbGet('meta', 'lastSync').catch(() => null)
  if (!force && meta && Date.now() - meta.value < SYNC_INTERVAL_MS) return false
  syncing = true
  try {
    const bundle = await api.get('/offline/bundle')
    await idbClear('words');     await idbPutAll('words', bundle.words || [])
    await idbClear('exercises'); await idbPutAll('exercises', bundle.exercises || [])
    await idbPut('meta', { key: 'lastSync', value: Date.now() })
    prefetchImages(bundle.words || []) // не ждём — SW сложит в кэш фоном
    return true
  } catch (e) {
    console.warn('offline syncDown:', e.message)
    return false
  } finally {
    syncing = false
  }
}

// Прогрев кэша картинок: маленькие webp (word_<id>_sm.webp), которые SW кэширует CacheFirst
function prefetchImages(words) {
  const urls = words
    .map(w => w.image_url)
    .filter(u => u && u.includes('/word-images/'))
    .map(u => u.replace(/\.webp(\?.*)?$/, '_sm.webp'))
    .slice(0, IMAGE_PREFETCH_LIMIT)
  let i = 0
  const next = () => {
    const batch = urls.slice(i, i + 10)
    if (!batch.length) return
    i += 10
    Promise.allSettled(batch.map(u => fetch(u, { mode: 'no-cors' }))).then(() =>
      setTimeout(next, 300)) // не душим сеть и сервер
  }
  next()
}

// ── Очередь ответов (офлайн) и отправка на сервер ────────────────────────────
export async function queueAnswer(exerciseId, quality, userAnswer = '') {
  await idbPut('queue', {
    key: `${exerciseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    exercise_id: exerciseId,
    quality,
    user_answer: String(userAnswer),
    answered_at: new Date().toISOString(),
  })
}

export async function syncUp() {
  if (!isOnline()) return false
  const items = await idbGetAll('queue').catch(() => [])
  if (!items.length) return true
  try {
    const answers = items.map(({ exercise_id, quality, user_answer, answered_at }) =>
      ({ exercise_id, quality, user_answer, answered_at }))
    await api.post('/offline/sync', { answers })
    for (const it of items) await idbDelete('queue', it.key)
    return true
  } catch (e) {
    console.warn('offline syncUp:', e.message)
    return false
  }
}

export const pendingCount = () => idbCount('queue').catch(() => 0)

// ── Локальный SRS (SM-2, зеркало backend/src/services/srs.js) ────────────────
function sm2Local(quality, ef, interval, reps) {
  let newEf = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  if (newEf < 1.3) newEf = 1.3
  let newReps, newInterval
  if (quality < 3) { newReps = 0; newInterval = 1 }
  else {
    newReps = reps + 1
    newInterval = newReps === 1 ? 1 : newReps === 2 ? 6 : Math.round(interval * newEf)
  }
  return { newEf: parseFloat(newEf.toFixed(2)), newInterval, newReps }
}

const today = () => new Date().toISOString().slice(0, 10)

// Упражнения «на сегодня» из локальной базы — те же правила, что /exercises/today
export async function getOfflineExercises({ lessonId = null, type = null, limit = 50 } = {}) {
  const all = await idbGetAll('exercises').catch(() => [])
  const due = all.filter(e =>
    (!lessonId || String(e.lesson_id) === String(lessonId)) &&
    (!type || e.type === type) &&
    (e.next_review_date || today()) <= today())
  // как на сервере: сначала самые просроченные, внутри — перемешать
  due.sort((a, b) => (a.next_review_date || '').localeCompare(b.next_review_date || '') || Math.random() - 0.5)
  return due.slice(0, lessonId ? 300 : limit)
}

// Ответ офлайн: SM-2 локально (чтобы очередь дня двигалась) + в очередь на синк
export async function answerOffline(exercise, quality, userAnswer = '') {
  const { newEf, newInterval, newReps } = sm2Local(
    quality, parseFloat(exercise.easiness_factor || 2.5),
    exercise.interval_days || 0, exercise.repetitions || 0)
  const next = new Date()
  next.setDate(next.getDate() + newInterval)
  await idbPut('exercises', {
    ...exercise,
    easiness_factor: newEf, interval_days: newInterval, repetitions: newReps,
    next_review_date: next.toISOString().slice(0, 10),
  })
  await queueAnswer(exercise.id, quality, userAnswer)
}

export const getOfflineWords = () => idbGetAll('words')

// ── Инициализация: слушатели сети + первичная синхронизация ──────────────────
let inited = false
export function initOffline() {
  if (inited || typeof window === 'undefined' || !('indexedDB' in window)) return
  inited = true
  // при появлении сети: отправить накопленное, потом освежить данные
  window.addEventListener('online', () => { syncUp().then(() => syncDown(true)) })
  // старт приложения: сначала выгрузить очередь (могла остаться), затем скачать свежее
  syncUp().then(() => syncDown())
}
