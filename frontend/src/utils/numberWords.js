// Числительные словами 0-100 на всех 10 интерфейсных локалях — для статической справки
// «Цифры» в Словаре (немецкое слово всегда есть в данных, тут только перевод названия числа
// на язык интерфейса ученика). Каждый язык — системная функция (десятки+единицы), а не ручной
// список: так исключены опечатки в компаунд-числах и код короче.

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function en(n) {
  if (n === 100) return 'one hundred'
  if (n < 20) return EN_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${EN_TENS[t]}-${EN_UNITS[u]}` : EN_TENS[t]
}

const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
const ES_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const ES_20S = { 1: 'veintiuno', 2: 'veintidós', 3: 'veintitrés', 4: 'veinticuatro', 5: 'veinticinco', 6: 'veintiséis', 7: 'veintisiete', 8: 'veintiocho', 9: 'veintinueve' }
function es(n) {
  if (n === 100) return 'cien'
  if (n < 20) return ES_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  if (t === 2) return u ? ES_20S[u] : 'veinte'
  return u ? `${ES_TENS[t]} y ${ES_UNITS[u]}` : ES_TENS[t]
}

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
function fr(n) {
  if (n === 100) return 'cent'
  if (n < 20) return FR_UNITS[n]
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10
    const tensWord = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' }[t]
    if (u === 0) return tensWord
    if (u === 1) return `${tensWord} et un`
    return `${tensWord}-${FR_UNITS[u]}`
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${FR_UNITS[n - 60]}`
  if (n === 80) return 'quatre-vingts'
  if (n < 100) return `quatre-vingt-${FR_UNITS[n - 80]}` // 90 → dix, 91 → onze (без «et»), 99 → dix-neuf
}

const UK_UNITS = ['нуль', 'один', 'два', 'три', 'чотири', 'п’ять', 'шість', 'сім', 'вісім', 'дев’ять', 'десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', 'п’ятнадцять', 'шістнадцять', 'сімнадцять', 'вісімнадцять', 'дев’ятнадцять']
const UK_TENS = ['', '', 'двадцять', 'тридцять', 'сорок', 'п’ятдесят', 'шістдесят', 'сімдесят', 'вісімдесят', 'дев’яносто']
function uk(n) {
  if (n === 100) return 'сто'
  if (n < 20) return UK_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${UK_TENS[t]} ${UK_UNITS[u]}` : UK_TENS[t]
}

const BG_UNITS = ['нула', 'едно', 'две', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет', 'десет', 'единадесет', 'дванадесет', 'тринадесет', 'четиринадесет', 'петнадесет', 'шестнадесет', 'седемнадесет', 'осемнадесет', 'деветнадесет']
const BG_TENS = ['', '', 'двадесет', 'тридесет', 'четиридесет', 'петдесет', 'шестдесет', 'седемдесет', 'осемдесет', 'деветдесет']
function bg(n) {
  if (n === 100) return 'сто'
  if (n < 20) return BG_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${BG_TENS[t]} и ${BG_UNITS[u]}` : BG_TENS[t]
}

const TR_UNITS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TR_TEENS = ['on', 'on bir', 'on iki', 'on üç', 'on dört', 'on beş', 'on altı', 'on yedi', 'on sekiz', 'on dokuz']
const TR_TENS = ['', '', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
function tr(n) {
  if (n === 100) return 'yüz'
  if (n < 10) return TR_UNITS[n]
  if (n < 20) return TR_TEENS[n - 10]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${TR_TENS[t]} ${TR_UNITS[u]}` : TR_TENS[t]
}

// Компаунды в обратном порядке (единицы + «و» + десятки), как в немецком
const AR_UNITS = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']
const AR_TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
const AR_TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
function ar(n) {
  if (n === 100) return 'مئة'
  if (n < 10) return AR_UNITS[n]
  if (n < 20) return AR_TEENS[n - 10]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${AR_UNITS[u]} و${AR_TENS[t]}` : AR_TENS[t]
}

const SQ_UNITS = ['zero', 'një', 'dy', 'tre', 'katër', 'pesë', 'gjashtë', 'shtatë', 'tetë', 'nëntë']
const SQ_TEENS = ['dhjetë', 'njëmbëdhjetë', 'dymbëdhjetë', 'trembëdhjetë', 'katërmbëdhjetë', 'pesëmbëdhjetë', 'gjashtëmbëdhjetë', 'shtatëmbëdhjetë', 'tetëmbëdhjetë', 'nëntëmbëdhjetë']
const SQ_TENS = ['', '', 'njëzet', 'tridhjetë', 'dyzet', 'pesëdhjetë', 'gjashtëdhjetë', 'shtatëdhjetë', 'tetëdhjetë', 'nëntëdhjetë']
function sq(n) {
  if (n === 100) return 'njëqind'
  if (n < 10) return SQ_UNITS[n]
  if (n < 20) return SQ_TEENS[n - 10]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${SQ_TENS[t]} e ${SQ_UNITS[u]}` : SQ_TENS[t]
}

// Немецкий генератор 0–100 (системно, без пропусков — заменяет ручной DE_NUMBERS)
const DE_UNITS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
const DE_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig']
function de(n) {
  if (n === 100) return 'hundert'
  if (n < 20) return DE_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  if (u === 0) return DE_TENS[t]
  return `${u === 1 ? 'ein' : DE_UNITS[u]}und${DE_TENS[t]}` // einundzwanzig
}

// Русский генератор 0–100 (для перевода названия числа на русский интерфейс)
const RU_UNITS = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
const RU_TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
function ru(n) {
  if (n === 100) return 'сто'
  if (n < 20) return RU_UNITS[n]
  const t = Math.floor(n / 10), u = n % 10
  return u ? `${RU_TENS[t]} ${RU_UNITS[u]}` : RU_TENS[t]
}

const GENERATORS = { de, ru, en, es, fr, uk, bg, tr, ar, sq }

// Крупные «круглые» числа — курируем словами по каждому языку (генераторы выше только до 100).
export const LARGE_NUMBERS = [100, 200, 1000, 10000, 100000, 1000000]
const LARGE = {
  de: { 100: 'hundert', 200: 'zweihundert', 1000: 'tausend', 10000: 'zehntausend', 100000: 'hunderttausend', 1000000: 'eine Million' },
  ru: { 100: 'сто', 200: 'двести', 1000: 'тысяча', 10000: 'десять тысяч', 100000: 'сто тысяч', 1000000: 'миллион' },
  en: { 100: 'one hundred', 200: 'two hundred', 1000: 'one thousand', 10000: 'ten thousand', 100000: 'one hundred thousand', 1000000: 'one million' },
  es: { 100: 'cien', 200: 'doscientos', 1000: 'mil', 10000: 'diez mil', 100000: 'cien mil', 1000000: 'un millón' },
  fr: { 100: 'cent', 200: 'deux cents', 1000: 'mille', 10000: 'dix mille', 100000: 'cent mille', 1000000: 'un million' },
  uk: { 100: 'сто', 200: 'двісті', 1000: 'тисяча', 10000: 'десять тисяч', 100000: 'сто тисяч', 1000000: 'мільйон' },
  bg: { 100: 'сто', 200: 'двеста', 1000: 'хиляда', 10000: 'десет хиляди', 100000: 'сто хиляди', 1000000: 'милион' },
  tr: { 100: 'yüz', 200: 'iki yüz', 1000: 'bin', 10000: 'on bin', 100000: 'yüz bin', 1000000: 'bir milyon' },
  ar: { 100: 'مئة', 200: 'مئتان', 1000: 'ألف', 10000: 'عشرة آلاف', 100000: 'مئة ألف', 1000000: 'مليون' },
  sq: { 100: 'njëqind', 200: 'dyqind', 1000: 'një mijë', 10000: 'dhjetë mijë', 100000: 'njëqind mijë', 1000000: 'një milion' },
}

// Слово-число в ЛЮБОМ языке (для «Цифры» на языке курса + перевод на интерфейс).
// 0–100 — генератором, крупные — по таблице LARGE. Нет данных → null.
export function numberWordAny(n, lang) {
  if (n <= 100 && Number.isInteger(n) && n >= 0) {
    const gen = GENERATORS[lang]
    if (gen) return gen(n)
  }
  return LARGE[lang]?.[n] ?? null
}

// TTS-локаль по коду изучаемого языка (для озвучки числа/буквы на языке курса)
export const TTS_LOCALE = { de: 'de-DE', es: 'es-ES', en: 'en-US', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT', ru: 'ru-RU', uk: 'uk-UA', bg: 'bg-BG', tr: 'tr-TR', ar: 'ar-SA', sq: 'sq-AL' }

// numRu — русское числительное из уже существующих данных (DE_NUMBERS), используется как
// значение для 'ru' и как фолбэк для 'de' (немецкий интерфейс показывает перевод по-русски,
// как и остальные переводы в приложении — LANG_FALLBACK.de = 'ru').
export function numberWord(n, lang, numRu) {
  if (lang === 'ru' || lang === 'de') return numRu
  const gen = GENERATORS[lang]
  return gen ? gen(n) : numRu
}
