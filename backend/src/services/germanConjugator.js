// Немецкий конъюгатор Präsens (настоящее время) — правило-based, БЕЗ OpenAI.
// Нужен для: (1) фикса fill_blank, где GPT кладёт инфинитив вместо спряжённой формы
// («Ich fragen» → «Ich frage»); (2) нового упражнения-склонения ich/du/er/…/sie-Sie.
//
// Покрытие: регулярные глаголы + орфографические правила (-t/-d, -s/-ß/-z, -eln/-ern),
// сильные с изменением корня в du/er (e→i, e→ie, a→ä, au→äu, o→ö) и полностью
// неправильные (sein, haben, werden, wissen, модальные, nehmen). Для A1 этого хватает;
// незнакомый глагол спрягаем по регулярному правилу (лучше, чем инфинитив в пропуске).

// 6 «слотов» спряжения. er = er/sie/es, sie = sie(мн.)/Sie(вежл.) — совпадают по форме.
export const PERSONS = ['ich', 'du', 'er', 'wir', 'ihr', 'sie']

// Русские подписи лиц (для UI упражнения-склонения)
export const PERSON_LABELS_RU = {
  ich: 'я',
  du: 'ты',
  er: 'он / она / оно',
  wir: 'мы',
  ihr: 'вы (на «ты», мн.)',
  sie: 'они / Вы (вежл.)',
}

// Полностью неправильные — задаём все 6 форм вручную.
const IRREGULAR = {
  sein:   { ich: 'bin',  du: 'bist',  er: 'ist',  wir: 'sind',  ihr: 'seid',  sie: 'sind'  },
  haben:  { ich: 'habe', du: 'hast',  er: 'hat',  wir: 'haben', ihr: 'habt',  sie: 'haben' },
  werden: { ich: 'werde', du: 'wirst', er: 'wird', wir: 'werden', ihr: 'werdet', sie: 'werden' },
  wissen: { ich: 'weiß', du: 'weißt', er: 'weiß', wir: 'wissen', ihr: 'wisst', sie: 'wissen' },
  // Модальные глаголы — особый корень в ед.ч.
  können: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' },
  müssen: { ich: 'muss', du: 'musst', er: 'muss', wir: 'müssen', ihr: 'müsst', sie: 'müssen' },
  wollen: { ich: 'will', du: 'willst', er: 'will', wir: 'wollen', ihr: 'wollt', sie: 'wollen' },
  sollen: { ich: 'soll', du: 'sollst', er: 'soll', wir: 'sollen', ihr: 'sollt', sie: 'sollen' },
  dürfen: { ich: 'darf', du: 'darfst', er: 'darf', wir: 'dürfen', ihr: 'dürft', sie: 'dürfen' },
  mögen:  { ich: 'mag',  du: 'magst', er: 'mag',  wir: 'mögen', ihr: 'mögt',  sie: 'mögen' },
  // nehmen — нерегулярное удвоение: nimmt
  nehmen: { ich: 'nehme', du: 'nimmst', er: 'nimmt', wir: 'nehmen', ihr: 'nehmt', sie: 'nehmen' },
}

// Сильные глаголы: меняется корень ТОЛЬКО в du и er/sie/es. Задаём новый корень.
// Остальные лица (ich/wir/ihr/sie-мн.) — по регулярному правилу от исходного корня.
const STRONG_STEM = {
  // e → i
  geben: 'gib', essen: 'iss', sprechen: 'sprich', helfen: 'hilf', treffen: 'triff',
  werfen: 'wirf', brechen: 'brich', sterben: 'stirb', gelten: 'gilt', vergessen: 'vergiss',
  // e → ie
  sehen: 'sieh', lesen: 'lies', empfehlen: 'empfiehl', stehlen: 'stiehl',
  // a → ä
  fahren: 'fähr', schlafen: 'schläf', tragen: 'träg', fallen: 'fäll', fangen: 'fäng',
  halten: 'hält', lassen: 'läss', waschen: 'wäsch', schlagen: 'schläg', raten: 'rät',
  graben: 'gräb', backen: 'bäck', wachsen: 'wächs',
  // au → äu
  laufen: 'läuf', saufen: 'säuf',
  // o → ö
  stoßen: 'stöß',
}

// Взять основу (Stamm) из инфинитива.
function stemOf(inf) {
  if (inf.endsWith('en')) return inf.slice(0, -2)
  if (inf.endsWith('n')) return inf.slice(0, -1) // sammeln, wandern, tun
  return inf
}

// Форма du/ihr/er с учётом орфографии основы.
function addEnding(stem, ending) {
  // ending: 'st' (du), 't' (er/ihr), 'e' (ich), 'en'/'n' (wir/sie)
  const last = stem.slice(-1)
  const last2 = stem.slice(-2)
  // Основа на -s/-ß/-z/-x/-tz: у du отпадает s (heißen → du heißt, sitzen → du sitzt)
  if (ending === 'st' && /(s|ß|z|x|tz)$/.test(stem)) return stem + 't'
  // Основа на -t/-d или согласный+m/n (arbeiten, finden, öffnen, regnen): вставляем -e-
  if ((ending === 'st' || ending === 't') && (/[td]$/.test(stem) || isConsClusterMN(stem))) {
    return stem + 'e' + ending
  }
  return stem + ending
}

// Основа заканчивается на согласную + m/n (öffn-, regn-, atm-) — нужен -e- перед st/t.
// Но НЕ после l/r/m/n (lernen, kommen → без -e-: du lernst, du kommst).
function isConsClusterMN(stem) {
  if (!/(m|n)$/.test(stem)) return false
  const before = stem.slice(-2, -1)
  return /[bcdfghkpstw]/.test(before) // напр. öff-n, reg-n, at-m
}

// Спрягает инфинитив в Präsens. Возвращает { ich, du, er, wir, ihr, sie }.
export function conjugatePresent(infinitiveRaw) {
  const inf = String(infinitiveRaw || '').trim()
  if (!inf) return null
  const key = inf.toLowerCase()

  if (IRREGULAR[key]) return { ...IRREGULAR[key] }

  const stem = stemOf(key)
  const plural = key.endsWith('n') && !key.endsWith('en') ? 'n' : 'en' // sammeln → wir sammeln

  // ich: обычно stem+e; у -eln (sammeln→ich sammle) отпадает e перед l
  let ichForm
  if (key.endsWith('eln')) ichForm = stem.slice(0, -2) + 'le' // samm-el → sammle
  else ichForm = stem + 'e'

  // du / er — с учётом сильного изменения корня
  const strongStem = STRONG_STEM[key]
  const duStem = strongStem || stem
  const erStem = strongStem || stem

  const forms = {
    ich: ichForm,
    du: addEnding(duStem, 'st'),
    er: addEnding(erStem, 't'),
    wir: stem + plural,
    ihr: addEnding(stem, 't'),
    sie: stem + plural,
  }
  // Восстановим заглавную, если инфинитив был с заглавной (редко), иначе строчная — глаголы строчные.
  return forms
}

// ПРИМЕЧАНИЕ: авто-правку fill_blank по эвристике («угадать, что это глагол, и спрягать»)
// НЕ делаем — она ненадёжна (не отличает глагол от неглагола, не понимает модальный+инфинитив
// «Ich kann singen»). Конъюгатор используется ТОЛЬКО там, где инфинитив известен точно —
// в упражнении-склонении (мы сами подаём глагол из курируемого списка).
