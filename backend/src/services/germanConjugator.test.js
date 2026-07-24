// Тест конъюгатора Präsens. Запуск: node backend/src/services/germanConjugator.test.js
import { conjugatePresent } from './germanConjugator.js'

let pass = 0, fail = 0
const eq = (got, exp, name) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  if (ok) { pass++ } else { fail++; console.log(`❌ ${name}\n   ожидал: ${JSON.stringify(exp)}\n   получил: ${JSON.stringify(got)}`) }
}

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

console.log(`\n${fail === 0 ? '✅ ВСЕ ТЕСТЫ ПРОШЛИ' : '❌ ЕСТЬ ПАДЕНИЯ'}: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
