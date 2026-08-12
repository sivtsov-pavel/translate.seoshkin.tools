import { create } from 'zustand'
import { api } from '../api/client.js'

// Режим интерфейса — какой из двух дизайнов показывать:
//   novice — «Путь»: одна дорога, один следующий шаг, минимум выбора;
//   expert — привычный полный интерфейс со всеми разделами.
//
// По умолчанию: учителю expert, ученику novice. Явный выбор хранится на сервере
// (user_settings.ui_mode) и переживает смену устройства; localStorage — только кеш,
// чтобы при загрузке не мигал чужой дизайн.
//
// ВАЖНО: режим переключает ТОЛЬКО отображение. Права остаются прежними: «режим
// ученика» у учителя не даёт доступа к чужим данным и ничего не открывает.
const CACHE_KEY = 'ui_mode'

const defaultFor = (user) => (user?.role === 'owner' ? 'expert' : 'novice')

export const useUiModeStore = create((set, get) => ({
  mode: localStorage.getItem(CACHE_KEY) || null,   // null = ещё не знаем, ждём сервер
  loaded: false,

  // Режим для отрисовки: явный выбор, иначе значение по роли
  resolve: (user) => get().mode || defaultFor(user),

  load: async (user) => {
    if (get().loaded) return
    try {
      const s = await api.get('/settings')
      const mode = s?.ui_mode || defaultFor(user)
      localStorage.setItem(CACHE_KEY, mode)
      set({ mode, loaded: true })
    } catch {
      set({ mode: get().mode || defaultFor(user), loaded: true })
    }
  },

  setMode: async (mode) => {
    localStorage.setItem(CACHE_KEY, mode)
    set({ mode })
    try { await api.patch('/settings/ui-mode', { ui_mode: mode }) } catch {}
  },

  toggle: async (user) => {
    const next = get().resolve(user) === 'novice' ? 'expert' : 'novice'
    await get().setMode(next)
    return next
  },
}))
