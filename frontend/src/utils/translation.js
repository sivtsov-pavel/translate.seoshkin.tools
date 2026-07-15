// для 'de' локали показываем русский перевод (если нет de-перевода) — так пользователь видит что перевода нет
const LANG_FALLBACK = { de: 'ru' }

// Получить локализованный заголовок урока
export function getLessonTitle(title, titleTranslations, lang) {
  if (!titleTranslations || typeof titleTranslations !== 'object') return title
  if (titleTranslations[lang]) return titleTranslations[lang]
  const fb = LANG_FALLBACK[lang]
  if (fb && titleTranslations[fb]) return titleTranslations[fb]
  return title
}

// Получить локализованное описание урока (как getLessonTitle, но для описания)
export function getLessonDesc(description, descTranslations, lang) {
  if (!descTranslations || typeof descTranslations !== 'object') return description
  if (descTranslations[lang]) return descTranslations[lang]
  const fb = LANG_FALLBACK[lang]
  if (fb && descTranslations[fb]) return descTranslations[fb]
  return description
}

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
