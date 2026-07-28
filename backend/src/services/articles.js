// Артикли изучаемых языков — один источник правды.
//
// Артикль отбрасывают, когда сравнивают слова: «der Tisch» и «Tisch» — одно слово,
// в словаре они не должны стоять двумя строками. По коду такие регулярки расползлись
// копиями, и почти все копии знали только немецкие артикли. Пока курс был один, это
// работало. С появлением английского и испанского то же сравнение перестало видеть
// «the table» = «table» и «la casa» = «casa» — дедуп молча пропускал дубли.
//
// Регулярку берём по языку курса, а не общую на все: общий список «a» (англ.) съел бы
// испанский предлог, «o» (порт.) — итальянский союз.
const BY_LANG = {
  de: 'der|die|das|den|dem|des|ein|eine|einen|einem|eines',
  en: 'the|a|an',
  es: 'el|la|los|las|un|una|unos|unas',
  fr: 'le|la|les|un|une|des',
  it: 'il|lo|la|gli|le|un|uno|una',
  pt: 'o|a|os|as|um|uma',
}

/** Список артиклей языка через `|` — для подстановки в SQL-регулярку. */
export function articlePattern(lang) {
  return BY_LANG[lang] || BY_LANG.de
}

export function articleRe(lang) {
  return new RegExp(`^(${articlePattern(lang)})\\s+`, 'i')
}

/** Ключ для сравнения слов: без артикля, в нижнем регистре. */
export function bareWord(word, lang) {
  return String(word || '').trim().toLowerCase().replace(articleRe(lang), '').trim()
}
