import { create } from 'zustand'

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  login: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user })
  },

  // Синхронизирует профиль с сервером (аватар, имя и т.д.) после логина
  refreshUser: async () => {
    const { token } = get()
    if (!token) return
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      // Автоопределение таймзоны: если браузерная TZ отличается от сохранённой на сервере —
      // обновляем, чтобы напоминания приходили по локальному времени пользователя.
      try {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTz && browserTz !== data.timezone) {
          await fetch('/api/me/timezone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ timezone: browserTz }),
          })
          data.timezone = browserTz
        }
      } catch {}
      localStorage.setItem('user', JSON.stringify(data))
      set({ user: data })
    } catch {}
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    set({ token: null, user: null, impersonating: null })
  },

  // Супер-админ «Войти как»: сохраняем свой токен, подменяем на токен целевого юзера.
  // impersonating != null, пока идёт имперсонация (сохранён admin_token своего аккаунта).
  impersonating: localStorage.getItem('admin_token') ? JSON.parse(localStorage.getItem('user') || 'null') : null,

  impersonate: (token, user) => {
    // Сохраняем СВОЙ (админский) токен, только если ещё не в имперсонации
    if (!localStorage.getItem('admin_token')) {
      localStorage.setItem('admin_token', localStorage.getItem('token'))
      localStorage.setItem('admin_user', localStorage.getItem('user'))
    }
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user, impersonating: user })
  },

  stopImpersonate: () => {
    const adminToken = localStorage.getItem('admin_token')
    const adminUser = localStorage.getItem('admin_user')
    if (!adminToken) return
    localStorage.setItem('token', adminToken)
    localStorage.setItem('user', adminUser)
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    set({ token: adminToken, user: JSON.parse(adminUser), impersonating: null })
  },
}))
