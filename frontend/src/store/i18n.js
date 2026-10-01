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

const raw = { ru, de, en, uk, bg, tr, ar, es, fr, sq }

// Подстраховка от пропущенного ключа.
//
// 01.10.2026 Павел переключил приложение на английский и получил БЕЛЫЙ ЭКРАН. Причина не в
// отсутствии перевода: новые ключи карты уроков легли только в ru.js, а три из них — функции
// (`ofLessons(a, b)`, `chestLeft(n)`, `examHint(n)`). В английской локали их не было, вызов
// `undefined(...)` бросал исключение, и React сносил всё дерево. То есть один незаполненный
// ключ ронял приложение целиком — цена забывчивости оказалась несоразмерной.
//
// Цепочка: своя локаль → английская → русская. Пропуск теперь means «текст на другом языке»,
// а не «пустой экран». Ключи всё равно надо доносить во все локали, но ценой этого больше не
// будет работоспособность приложения.
//
// Слияние только по объектам: функции, массивы (weekdays) и строки берём целиком — иначе
// массив дней недели слился бы поэлементно и в короткой локали остались бы чужие хвосты.
function withFallback(target, ...fallbacks) {
  const out = {}
  const keys = new Set([...fallbacks, target].flatMap(o => Object.keys(o || {})))
  for (const k of keys) {
    const vals = [target, ...fallbacks].map(o => o?.[k]).filter(v => v !== undefined)
    const v = vals[0]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = withFallback(...vals.filter(x => x && typeof x === 'object' && !Array.isArray(x)))
    } else {
      out[k] = v
    }
  }
  return out
}

const translations = Object.fromEntries(
  Object.entries(raw).map(([code, dict]) => [code, withFallback(dict, en, ru)])
)

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
