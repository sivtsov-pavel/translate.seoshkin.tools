// Промежуточные fallback для редких случаев (de не нужен — слова уже немецкие, fallback → ru)
const LANG_FALLBACK = {}

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
