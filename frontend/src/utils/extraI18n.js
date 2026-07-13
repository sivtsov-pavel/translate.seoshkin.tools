import extra from '../i18n/extra.json'

// Локализация новых разделов (Грамматика, Любовь к детям, Кроссворд, Каталог).
export const ex = (lang) => extra[lang] || extra.ru
