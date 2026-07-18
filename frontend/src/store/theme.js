import { create } from 'zustand'

const saved = localStorage.getItem('theme') || 'light'

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}
apply(saved)

export const useThemeStore = create((set) => ({
  theme: saved,
  toggle: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    apply(next)
    return { theme: next }
  }),
}))
