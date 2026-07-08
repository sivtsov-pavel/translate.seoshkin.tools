const BASE = '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Ошибка сервера')
  }

  if (res.status === 204) return null
  return res.json()
}

// Загрузка файлов — без Content-Type, браузер выставит multipart boundary сам
export async function uploadFiles(url, formData) {
  const headers = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${url}`, { method: 'POST', headers, body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Ошибка загрузки')
  }
  return res.json()
}

export const api = {
  get:    (url)       => request('GET', url),
  post:   (url, body) => request('POST', url, body),
  patch:  (url, body) => request('PATCH', url, body),
  delete: (url)       => request('DELETE', url),
}
