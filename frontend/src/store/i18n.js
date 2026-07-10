import { create } from 'zustand'
import { ru } from '../i18n/ru.js'
import { de } from '../i18n/de.js'
import { en } from '../i18n/en.js'
import { uk } from '../i18n/uk.js'
import { bg } from '../i18n/bg.js'
import { tr } from '../i18n/tr.js'
import { ar } from '../i18n/ar.js'
import { es } from '../i18n/es.js'
import { fr } from '../i18n/fr.js'
import { sq } from '../i18n/sq.js'

const translations = { ru, de, en, uk, bg, tr, ar, es, fr, sq }

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
