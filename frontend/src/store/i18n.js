import { create } from 'zustand'
import { ru } from '../i18n/ru.js'
import { de } from '../i18n/de.js'
import { en } from '../i18n/en.js'
import { uk } from '../i18n/uk.js'

const translations = { ru, de, en, uk }

const savedLang = localStorage.getItem('lang') || 'ru'

export const useI18nStore = create((set) => ({
  lang: savedLang,
  t: translations[savedLang],

  setLang: (lang) => {
    if (!translations[lang]) return
    localStorage.setItem('lang', lang)
    set({ lang, t: translations[lang] })
  },
}))
