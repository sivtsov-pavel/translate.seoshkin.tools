// Проверка немецкой орфографии по словарю — детерминированно, офлайн, бесплатно.
//
// Зачем: слова попадают в уроки с фотографии тетради через распознавание, и ошибки
// распознавания превращаются в учебный материал. Ученик добросовестно заучивает «Ocean»
// вместо «Ozean» — недопустимо (требование Павла 10.09.2026). Модель для такой проверки
// не годится: восемь тысяч слов это деньги на каждый прогон, и сама она ошибается.
// Словарь отвечает мгновенно, одинаково и даром.
//
// ── Две особенности словаря, из-за которых наивное подключение не работает ──────────
//
// 1. У большинства слов в de_DE ДВЕ записи: обычная и с флагом «o» (ONLYINCOMPOUND —
//    существует только внутри составного слова). nspell берёт последнюю встреченную и
//    бракует по ней: голые «gehen», «sein», «lesen», «gut» объявлялись ошибкой. Поэтому
//    при сборке оставляем запись БЕЗ этого флага, если она есть.
//
// 2. Немецкий строит составные слова из чего угодно, и словарь их не перечисляет:
//    «Hausaufgabe», «Arbeitszimmer», «Krankenhaus» честно отсутствуют. Поэтому слово,
//    которого нет в словаре, пробуем разрезать надвое (обе части не короче трёх букв,
//    с учётом соединительного «s»: Arbeit+s+zimmer). Трёхсоставные вроде
//    «Zweitschriftlernenden» так не ловятся — и это осознанный предел: проверка выдаёт
//    ПРЕДУПРЕЖДЕНИЕ для человека, а не запрет, поэтому редкий ложный сигнал безвреден.
//
// Обратная сторона разреза: опечатка, случайно распавшаяся на два настоящих слова,
// проходит. «fürzehn» вместо «vierzehn» = für + zehn, и словарь возражать не станет.
// Ловится это только смыслом, то есть человеком или моделью — здесь не наш слой.
import nspell from 'nspell'
import dict from 'dictionary-de'

// Три буквы, а не четыре: иначе «Bahnhof» (Bahn+hof) и «Fußball» (Fuß+ball) — частые,
// ничем не примечательные слова — попадали в список ошибок и зашумляли отчёт.
const MIN_PART = 3
// Шесть, а не восемь: «Bahnhof» и «Fußball» — семибуквенные, и при пороге 8 разрез
// вообще не запускался, из-за чего они числились ошибками.
const MIN_COMPOUND = 6

let speller = null

function build() {
  if (speller) return speller
  const lines = dict.dic.toString('utf8').split('\n').slice(1).filter(l => l && !l.startsWith('\t'))
  const byWord = new Map()
  for (const line of lines) {
    const [word, flags = ''] = line.split('/')
    const onlyInCompound = flags.includes('o')
    const prev = byWord.get(word)
    if (!prev || (prev.onlyInCompound && !onlyInCompound)) byWord.set(word, { line, onlyInCompound })
  }
  const kept = [...byWord.values()].map(x => x.line)
  speller = nspell({ aff: dict.aff, dic: Buffer.from(`${kept.length}\n${kept.join('\n')}`, 'utf8') })
  return speller
}

const capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s

// Слово известно словарю в любом регистре: существительные пишутся с заглавной, но в
// примерах и распознавании регистр плавает, а орфографию это не меняет.
function known(sp, w) {
  return sp.correct(w) || sp.correct(capitalize(w)) || sp.correct(w.toLowerCase())
}

/** Существует ли такое немецкое слово (с учётом составных). */
export function isGermanWord(raw) {
  const w = String(raw || '').trim()
  if (!w) return true
  // Цифры, знаки и латиница с диакритикой других языков не проверяем — не наша задача
  if (!/^[A-Za-zÄÖÜäöüß-]+$/.test(w)) return true
  const sp = build()
  if (known(sp, w)) return true

  if (w.length >= MIN_COMPOUND) {
    for (let i = MIN_PART; i <= w.length - MIN_PART; i++) {
      const head = w.slice(0, i)
      const tail = w.slice(i)
      if (known(sp, head) && known(sp, tail)) return true
      // соединительное «s»: Arbeit+s+zimmer
      if (head.endsWith('s') && head.length > MIN_PART + 2 && known(sp, head.slice(0, -1)) && known(sp, tail)) return true
    }
  }
  return false
}

/** Чем это могло быть: до трёх вариантов из словаря. Пусто — предложить нечего. */
export function suggestGerman(raw) {
  const w = String(raw || '').trim()
  if (!w) return []
  return build().suggest(w).slice(0, 3)
}

/** Незнакомые слова текста (для проверки примеров). Возвращает [{word, suggest}]. */
export function unknownWordsIn(text) {
  const out = []
  for (const w of String(text || '').split(/[^A-Za-zÄÖÜäöüß-]+/)) {
    if (w.length < 3) continue          // предлоги и артикли ловить незачем
    if (isGermanWord(w)) continue
    out.push({ word: w, suggest: suggestGerman(w) })
  }
  return out
}
