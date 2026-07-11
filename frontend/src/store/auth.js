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
      localStorage.setItem('user', JSON.stringify(data))
      set({ user: data })
    } catch {}
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
  },
}))
