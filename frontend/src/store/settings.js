import { create } from 'zustand'
import { api } from '../api/client.js'

const LS_KEY = 'app_visual_settings'

const VISUAL_DEFAULTS = {
  zoom: 1.0,
  fontFamily: 'Roboto',
  headingFont: 'Roboto',
  headingSize: 22,
  accentColor: '',
  voiceRate: 0.9,
  mobileLayout: 'bottom', // 'bottom' | 'strip'
}

function loadVisual() {
  try {
    return { ...VISUAL_DEFAULTS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }
  } catch {
    return { ...VISUAL_DEFAULTS }
  }
}

function fontStack(id) {
  if (id === 'Georgia')      return 'Georgia, serif'
  if (id === 'Merriweather') return "'Merriweather', Georgia, serif"
  if (id === 'Inter')        return "'Inter', -apple-system, sans-serif"
  if (id === 'Nunito')       return "'Nunito', -apple-system, sans-serif"
  return "'Roboto', -apple-system, 'Helvetica Neue', Arial, sans-serif"
}

export function applyVisual(visual) {
  const { zoom, fontFamily, headingFont = 'Georgia', headingSize = 22, accentColor, voiceRate, mobileLayout } = { ...VISUAL_DEFAULTS, ...visual }

  // Мобильная навигация — класс на html
  document.documentElement.classList.toggle('layout-mode-strip', mobileLayout === 'strip')

  // Масштаб страницы: CSS zoom масштабирует всё включая px-значения в inline-стилях
  document.documentElement.style.zoom = String(zoom)

  // Шрифт основного текста
  const stack = fontStack(fontFamily)
  document.body.style.fontFamily = stack

  // Шрифт и размер заголовков — переопределяем инлайн-стили через !important
  const hStack = headingFont === 'body' ? stack : fontStack(headingFont)
  const sz = Number(headingSize) || 22
  let styleEl = document.getElementById('__heading_override__')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = '__heading_override__'
    document.head.appendChild(styleEl)
  }
  document.documentElement.style.setProperty('--heading-font', hStack)
  styleEl.textContent = `
    h1, h2, h3, h4 { font-family: ${hStack} !important; }
    h1 { font-size: ${sz}px !important; }
    h2 { font-size: ${Math.round(sz * 0.82)}px !important; }
    h3 { font-size: ${Math.round(sz * 0.73)}px !important; }
  `

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
      headingFont: next.headingFont,
      headingSize: next.headingSize,
      accentColor: next.accentColor,
      voiceRate: next.voiceRate,
      mobileLayout: next.mobileLayout,
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
