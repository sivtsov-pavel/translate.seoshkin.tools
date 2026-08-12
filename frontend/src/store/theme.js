import { create } from 'zustand'

// Тема по умолчанию зависит от роли: ученику — тёмная (в ней сделан новый дизайн
// и с неё удобнее заниматься вечером), учителю — прежняя светлая. Явный выбор
// пользователя всегда важнее: он лежит в localStorage и сюда не попадает.
function defaultTheme() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    return user && user.role !== 'owner' ? 'dark' : 'light'
  } catch { return 'light' }
}

const saved = localStorage.getItem('theme') || defaultTheme()

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
