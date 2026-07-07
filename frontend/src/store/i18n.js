import { create } from 'zustand'
import { ru } from '../i18n/ru.js'
import { de } from '../i18n/de.js'

const translations = { ru, de }

// Язык по умолчанию из localStorage или Russian
const savedLang = localStorage.getItem('lang') || 'ru'

export const useI18nStore = create((set, get) => ({
  lang: savedLang,
  t: translations[savedLang],

  setLang: (lang) => {
    if (!translations[lang]) return
    localStorage.setItem('lang', lang)
    set({ lang, t: translations[lang] })
  },

  // Удобный геттер — useI18nStore(s => s.t) или деструктурировать { t, lang, setLang }
}))
