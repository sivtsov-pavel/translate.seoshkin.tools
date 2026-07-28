// Тест конъюгатора Präsens.
//
// Раньше файл был самодельным раннером с `process.exit()` в конце: под vitest такой выход
// считается падением набора, и файл горел красным, даже когда все 23 проверки проходили.
// Красный «на пустом месте» опаснее отсутствия теста — на него перестают смотреть.
import { describe, it, expect } from 'vitest'
import { conjugatePresent } from './germanConjugator.js'

const eq = (got, exp, name) => it(name, () => expect(got).toEqual(exp))

describe('conjugatePresent', () => {
// Регулярный
eq(conjugatePresent('fragen'), { ich: 'frage', du: 'fragst', er: 'fragt', wir: 'fragen', ihr: 'fragt', sie: 'fragen' }, 'fragen')
eq(conjugatePresent('spielen'), { ich: 'spiele', du: 'spielst', er: 'spielt', wir: 'spielen', ihr: 'spielt', sie: 'spielen' }, 'spielen')
eq(conjugatePresent('kommen'), { ich: 'komme', du: 'kommst', er: 'kommt', wir: 'kommen', ihr: 'kommt', sie: 'kommen' }, 'kommen')

// -t/-d: вставка -e-
eq(conjugatePresent('arbeiten'), { ich: 'arbeite', du: 'arbeitest', er: 'arbeitet', wir: 'arbeiten', ihr: 'arbeitet', sie: 'arbeiten' }, 'arbeiten')
eq(conjugatePresent('finden'), { ich: 'finde', du: 'findest', er: 'findet', wir: 'finden', ihr: 'findet', sie: 'finden' }, 'finden')

// -s/-ß/-z: du без s
eq(conjugatePresent('heißen'), { ich: 'heiße', du: 'heißt', er: 'heißt', wir: 'heißen', ihr: 'heißt', sie: 'heißen' }, 'heißen')
eq(conjugatePresent('sitzen'), { ich: 'sitze', du: 'sitzt', er: 'sitzt', wir: 'sitzen', ihr: 'sitzt', sie: 'sitzen' }, 'sitzen')

// Сильные: изменение корня в du/er
eq(conjugatePresent('fahren'), { ich: 'fahre', du: 'fährst', er: 'fährt', wir: 'fahren', ihr: 'fahrt', sie: 'fahren' }, 'fahren')
eq(conjugatePresent('sehen'), { ich: 'sehe', du: 'siehst', er: 'sieht', wir: 'sehen', ihr: 'seht', sie: 'sehen' }, 'sehen')
eq(conjugatePresent('sprechen'), { ich: 'spreche', du: 'sprichst', er: 'spricht', wir: 'sprechen', ihr: 'sprecht', sie: 'sprechen' }, 'sprechen')
eq(conjugatePresent('essen'), { ich: 'esse', du: 'isst', er: 'isst', wir: 'essen', ihr: 'esst', sie: 'essen' }, 'essen')
eq(conjugatePresent('lesen'), { ich: 'lese', du: 'liest', er: 'liest', wir: 'lesen', ihr: 'lest', sie: 'lesen' }, 'lesen')

// Неправильные / модальные
eq(conjugatePresent('sein'), { ich: 'bin', du: 'bist', er: 'ist', wir: 'sind', ihr: 'seid', sie: 'sind' }, 'sein')
eq(conjugatePresent('haben'), { ich: 'habe', du: 'hast', er: 'hat', wir: 'haben', ihr: 'habt', sie: 'haben' }, 'haben')
eq(conjugatePresent('können'), { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt', sie: 'können' }, 'können')
eq(conjugatePresent('nehmen'), { ich: 'nehme', du: 'nimmst', er: 'nimmt', wir: 'nehmen', ihr: 'nehmt', sie: 'nehmen' }, 'nehmen')

// -eln
eq(conjugatePresent('sammeln'), { ich: 'sammle', du: 'sammelst', er: 'sammelt', wir: 'sammeln', ihr: 'sammelt', sie: 'sammeln' }, 'sammeln')

// Сильные с основой на -t: БЕЗ вставки -e- (du hältst, er hält — не «hältest»); ihr — регулярно
eq(conjugatePresent('halten'), { ich: 'halte', du: 'hältst', er: 'hält', wir: 'halten', ihr: 'haltet', sie: 'halten' }, 'halten')
eq(conjugatePresent('raten'), { ich: 'rate', du: 'rätst', er: 'rät', wir: 'raten', ihr: 'ratet', sie: 'raten' }, 'raten')
eq(conjugatePresent('gelten'), { ich: 'gelte', du: 'giltst', er: 'gilt', wir: 'gelten', ihr: 'geltet', sie: 'gelten' }, 'gelten')

// Немая h после гласной: без -e- (wohnen); но «chn» (zeichnen) — с -e-
eq(conjugatePresent('wohnen'), { ich: 'wohne', du: 'wohnst', er: 'wohnt', wir: 'wohnen', ihr: 'wohnt', sie: 'wohnen' }, 'wohnen')
eq(conjugatePresent('zeichnen'), { ich: 'zeichne', du: 'zeichnest', er: 'zeichnet', wir: 'zeichnen', ihr: 'zeichnet', sie: 'zeichnen' }, 'zeichnen')

// möchten — Konjunktiv II: er möchte (без -t!)
eq(conjugatePresent('möchten'), { ich: 'möchte', du: 'möchtest', er: 'möchte', wir: 'möchten', ihr: 'möchtet', sie: 'möchten' }, 'möchten')
})
