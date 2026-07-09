// Для немецкого UI-языка слова уже немецкие — берём английский как запасной
const LANG_FALLBACK = { de: 'en' }

// Получить перевод строки (слова, предложения, подсказки) на нужный язык
export function getTranslation(translations, lang, fallbackRu) {
  if (!translations || typeof translations !== 'object') return fallbackRu || ''
  if (translations[lang] != null) return translations[lang]
  const fb = LANG_FALLBACK[lang]
  if (fb && translations[fb] != null) return translations[fb]
  return fallbackRu || ''
}

// Определить реальный ключ языка для payloadTranslations (может быть массив вариантов)
export function getEffectiveLang(translations, lang) {
  if (!translations || typeof translations !== 'object') return null
  if (translations[lang] != null) return lang
  const fb = LANG_FALLBACK[lang]
  if (fb && translations[fb] != null) return fb
  return null
}
