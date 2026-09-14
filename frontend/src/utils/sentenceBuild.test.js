import { describe, it, expect } from 'vitest'
import { splitWords, buildTokens, shuffleTokens, isAssembledCorrect, canBuild } from './sentenceBuild.js'

describe('splitWords', () => {
  it('режет фразу на слова и снимает знаки препинания по краям', () => {
    expect(splitWords('Die Blume steht auf dem Tisch.'))
      .toEqual(['Die', 'Blume', 'steht', 'auf', 'dem', 'Tisch'])
  })

  it('запятая внутри фразы не превращается в слово', () => {
    expect(splitWords('Ich denke, dass es gut ist!'))
      .toEqual(['Ich', 'denke', 'dass', 'es', 'gut', 'ist'])
  })

  it('апостроф внутри слова остаётся — это часть слова', () => {
    expect(splitWords("Wie geht's dir?")).toEqual(['Wie', "geht's", 'dir'])
  })

  it('кавычки и тире по краям снимаются', () => {
    expect(splitWords('«Ja» — sagte er.')).toEqual(['Ja', 'sagte', 'er'])
  })

  it('пустое значение не роняет', () => {
    expect(splitWords(null)).toEqual([])
    expect(splitWords('   ')).toEqual([])
  })
})

describe('canBuild', () => {
  it('фразу из двух и более слов собирать можно', () => {
    expect(canBuild('Ich sage danke.')).toBe(true)
  })

  it('одно слово собирать нечего — остаётся прежний режим', () => {
    expect(canBuild('Danke.')).toBe(false)
    expect(canBuild('')).toBe(false)
    expect(canBuild(null)).toBe(false)
  })
})

describe('shuffleTokens', () => {
  const tokens = buildTokens('Die Blume steht auf dem Tisch.')

  it('состав слов не меняется, меняется только порядок', () => {
    const mixed = shuffleTokens(tokens)
    expect([...mixed].map(x => x.text).sort()).toEqual([...tokens].map(x => x.text).sort())
    expect(mixed).toHaveLength(tokens.length)
  })

  it('порядок эталона не оставляем: иначе ответ лежит собранным', () => {
    // Генератор, который «перемешивает» в тот же порядок — проверяем, что защита сработала
    let calls = 0
    const rnd = () => { calls++; return calls <= 6 ? 0.999999 : Math.random() }
    const mixed = shuffleTokens(tokens, rnd)
    expect(mixed.map(x => x.id)).not.toEqual(tokens.map(x => x.id))
  })

  it('одно слово перемешивать нечего', () => {
    const one = buildTokens('Danke')
    expect(shuffleTokens(one).map(x => x.text)).toEqual(['Danke'])
  })
})

describe('isAssembledCorrect', () => {
  const ref = 'Die Blume steht auf dem Tisch.'

  it('верный порядок засчитывается, точку ставить не нужно', () => {
    expect(isAssembledCorrect(buildTokens(ref), ref)).toBe(true)
  })

  it('другой порядок слов — не засчитывается', () => {
    const wrong = buildTokens('Die Blume auf dem Tisch steht')
    expect(isAssembledCorrect(wrong, ref)).toBe(false)
  })

  it('неполный ответ — не засчитывается', () => {
    expect(isAssembledCorrect(buildTokens('Die Blume steht'), ref)).toBe(false)
  })

  it('повтор слова в фразе разбирается верно', () => {
    const r = 'Ja, ja, das stimmt.'
    expect(isAssembledCorrect(buildTokens(r), r)).toBe(true)
  })

  it('регистр важен: die Blume и Die Blume — разные', () => {
    expect(isAssembledCorrect(buildTokens('die Blume steht auf dem Tisch'), ref)).toBe(false)
  })
})
