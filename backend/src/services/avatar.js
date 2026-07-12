// Видео-аватар (говорящее фото с синхронизацией губ) через D-ID Talks API.
// Активируется, когда в .env добавлен D_ID_API_KEY. ⚠️ Каждое видео тратит кредит D-ID.

const D_ID_KEY  = process.env.D_ID_API_KEY || ''
const D_ID_BASE = 'https://api.d-id.com'

// Фото-источник для персонажа (фронтальное лицо). Пока плейсхолдер D-ID (проверено).
// Позже: реальные фото по персонажам + загрузка своего фото (премиум).
const DEFAULT_PHOTO = 'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg'
const PERSONA_PHOTOS = {
  lena: DEFAULT_PHOTO, max: DEFAULT_PHOTO, hanna: DEFAULT_PHOTO,
  otto: DEFAULT_PHOTO, hr: DEFAULT_PHOTO,
  // Pablo Seoshkin — реальное фото (Marienplatz München: ратуша + фонтан за спиной), оживает через D-ID
  pablo: 's3://d-id-images-prod/google-oauth2|107849838766341455257/img_JCzyPsIRnNlkjWUvKzCbK/pablo_munich_sm.jpg',
}

export function isAvatarConfigured() {
  return Boolean(D_ID_KEY)
}

// Остаток кредитов D-ID (для скрытия кнопки 🎥, когда генерить нечем)
export async function getCredits() {
  if (!isAvatarConfigured()) return 0
  try {
    const res = await fetch(`${D_ID_BASE}/credits`, { headers: { Authorization: authHeader() } })
    if (!res.ok) return 0
    const data = await res.json()
    return Number(data.remaining ?? 0)
  } catch {
    return 0
  }
}

export function personaPhoto(character) {
  return PERSONA_PHOTOS[character] || DEFAULT_PHOTO
}

function authHeader() {
  // D-ID: ключ вида base64email:secret → Basic base64(всего ключа)
  const token = D_ID_KEY.includes(':') ? Buffer.from(D_ID_KEY).toString('base64') : D_ID_KEY
  return `Basic ${token}`
}

// Создать talk и дождаться готового видео. Возвращает { url, duration }.
export async function generateTalkingVideo({ photoUrl, text }) {
  if (!isAvatarConfigured()) throw new Error('avatar not configured')

  const createRes = await fetch(`${D_ID_BASE}/talks`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_url: photoUrl,
      script: { type: 'text', input: text, provider: { type: 'microsoft', voice_id: 'de-DE-ConradNeural' } },
    }),
  })
  if (!createRes.ok) throw new Error(`D-ID create ${createRes.status}: ${await createRes.text()}`)
  const { id } = await createRes.json()

  // Поллинг до готовности (макс ~45 сек)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1500))
    const res = await fetch(`${D_ID_BASE}/talks/${id}`, { headers: { Authorization: authHeader() } })
    if (!res.ok) continue
    const data = await res.json()
    if (data.status === 'done' && data.result_url) return { url: data.result_url, duration: data.duration }
    if (data.status === 'error' || data.status === 'rejected') throw new Error('D-ID: ' + (data.error?.description || data.status))
  }
  throw new Error('D-ID: видео не готово (таймаут)')
}
