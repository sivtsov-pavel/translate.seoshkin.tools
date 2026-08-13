import { describe, it, expect } from 'vitest'
import { exampleHasWord } from './systemCheck.js'
import { conjugatePresent } from './germanConjugator.js'

const has = (word, sentence) => exampleHasWord(word, sentence, conjugatePresent)

// Все случаи ниже — живые из базы. Первая версия правила забраковала их как
// «пример не содержит слова», хотя слово там есть.
describe('exampleHasWord — верные примеры не обвиняем', () => {
  it('отделяемая приставка: глагол разорван', () => {
    expect(has('einkaufen', 'Ich kaufe gerne ein.')).toBe(true)
    expect(has('abholen', 'Ich hole die Kinder ab')).toBe(true)
    expect(has('anfangen', 'Ich fange die Arbeit an.')).toBe(true)
  })

  it('возвратный глагол с управлением', () => {
    expect(has('sich ärgern über', 'Ich ärgere mich über den Lärm.')).toBe(true)
  })

  it('чередование корня в личной форме', () => {
    expect(has('wollen', 'Ich will Deutsch lernen.')).toBe(true)
    expect(has('nehmen', 'Du nimmst das Buch.')).toBe(true)
  })

  it('управление предлогом в словарной записи', () => {
    expect(has('denken an', 'Ich denke an meine Familie.')).toBe(true)
  })

  it('множественное число в скобках', () => {
    expect(has('das Wort (Wörter)', 'Das Wort ist lang.')).toBe(true)
  })

  it('существительное во множественном числе', () => {
    expect(has('der Gast', 'Die Gäste kommen um acht.')).toBe(true)
  })
})

describe('exampleHasWord — настоящие находки', () => {
  it('пример о другом слове', () => {
    expect(has('die Erlaubnis', 'Darf ich das Wasser trinken?')).toBe(false)
    expect(has('die Antwort', 'Ist das Ihre Tasche?')).toBe(false)
  })

  it('пустой пример считаем нормальным — это другая проверка', () => {
    expect(has('der Gast', '')).toBe(true)
  })

  it('короткое слово не проверяем: слишком много случайных совпадений', () => {
    expect(has('das Eis', 'Der Hund schläft.')).toBe(true)
  })
})

describe('exampleHasWord — записи с вариантами через слэш', () => {
  it('слово есть, если есть любой вариант (ложное срабатывание 13.08)', () => {
    expect(has('sie/Sie', 'Sie sind meine Freunde.')).toBe(true)
    expect(has('er/sie/es', 'Er ist mein Bruder.')).toBe(true)
    // Варианты пишут и через запятую — поймано первой боевой автопроверкой (урок 638)
    expect(has('sie, Sie', 'Sie sind freundlich.')).toBe(true)
    expect(has('er, sie, es', 'Er ist mein Freund.')).toBe(true)
  })

  it('нет ни одного варианта — настоящая находка', () => {
    expect(has('lesen/schreiben', 'Der Hund schläft im Garten.')).toBe(false)
  })
})
