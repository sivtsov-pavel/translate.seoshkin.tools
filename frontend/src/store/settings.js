import { create } from 'zustand'
import { api } from '../api/client.js'

const LS_KEY = 'app_visual_settings'

const VISUAL_DEFAULTS = {
  zoom: 1.0,
  fontFamily: 'Roboto',
  accentColor: '',       // '' = тема по умолчанию
  voiceRate: 0.9,
}

function loadVisual() {
  try {
    return { ...VISUAL_DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }
  } catch {
    return { ...VISUAL_DEFAULTS }
  }
}

export function applyVisual(visual) {
  const { zoom, fontFamily, accentColor, voiceRate } = { ...VISUAL_DEFAULTS, ...visual }

  // Масштаб текста
  document.documentElement.style.setProperty('--page-zoom', String(zoom))

  // Шрифт
  const stack = fontFamily === 'Georgia' ? 'Georgia, serif'
    : fontFamily === 'Merriweather' ? "'Merriweather', Georgia, serif"
    : fontFamily === 'Inter' ? "'Inter', -apple-system, sans-serif"
    : fontFamily === 'Nunito' ? "'Nunito', -apple-system, sans-serif"
    : "'Roboto', -apple-system, 'Helvetica Neue', Arial, sans-serif"
  document.body.style.fontFamily = stack

  // Акцентный цвет (переопределяет CSS-переменную темы)
  if (accentColor) {
    document.documentElement.style.setProperty('--accent', accentColor)
  } else {
    document.documentElement.style.removeProperty('--accent')
  }

  // Скорость голоса — читается из localStorage в useSpeech.jsx
  localStorage.setItem('voice_rate', String(voiceRate))
}

// Применяем при загрузке модуля
applyVisual(loadVisual())

export const useSettingsStore = create((set, get) => ({
  // Серверные настройки
  daily_limit: 50,
  openai_key: '',
  // Визуальные настройки (localStorage)
  ...loadVisual(),

  loaded: false,

  // Загрузить серверные настройки
  fetchSettings: async () => {
    try {
      const data = await api.get('/settings')
      set({
        daily_limit: data.daily_limit ?? 50,
        openai_key: data.openai_key ?? '',
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  // Сохранить все настройки
  saveSettings: async (patch) => {
    const current = get()
    const next = { ...current, ...patch }
    set(next)

    // Применить визуальные
    const visual = {
      zoom: next.zoom,
      fontFamily: next.fontFamily,
      accentColor: next.accentColor,
      voiceRate: next.voiceRate,
    }
    applyVisual(visual)
    localStorage.setItem(LS_KEY, JSON.stringify(visual))

    // Сохранить серверные
    try {
      await api.patch('/settings', {
        daily_limit: next.daily_limit,
        openai_key: next.openai_key || null,
      })
    } catch (e) {
      console.error('Ошибка сохранения настроек:', e)
    }
  },
}))
