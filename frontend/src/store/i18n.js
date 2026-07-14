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

// Автоопределение языка по локали браузера при первом визите.
// navigator.languages: ['ru-RU','ru',...] → берём первый поддерживаемый, иначе 'en'.
function detectLang() {
  const saved = localStorage.getItem('lang')
  if (saved && translations[saved]) return saved
  const cands = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
  let detected = 'en'
  for (const l of cands) {
    const code = String(l).toLowerCase().split('-')[0]
    if (translations[code]) { detected = code; break }
  }
  localStorage.setItem('lang', detected) // фиксируем, чтобы все чтения lang совпадали
  return detected
}

const savedLang = detectLang()

export const useI18nStore = create((set) => ({
  lang: savedLang,
  t: translations[savedLang],

  setLang: (lang) => {
    if (!translations[lang]) return
    localStorage.setItem('lang', lang)
    set({ lang, t: translations[lang] })
  },
}))
