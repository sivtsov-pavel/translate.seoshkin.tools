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

const GENERATORS = { en, es, fr, uk, bg, tr, ar, sq }

// numRu — русское числительное из уже существующих данных (DE_NUMBERS), используется как
// значение для 'ru' и как фолбэк для 'de' (немецкий интерфейс показывает перевод по-русски,
// как и остальные переводы в приложении — LANG_FALLBACK.de = 'ru').
export function numberWord(n, lang, numRu) {
  if (lang === 'ru' || lang === 'de') return numRu
  const gen = GENERATORS[lang]
  return gen ? gen(n) : numRu
}
