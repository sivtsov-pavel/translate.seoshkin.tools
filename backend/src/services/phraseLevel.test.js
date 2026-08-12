import { describe, it, expect } from 'vitest'
import { checkPhraseLevel, isAcceptablePhrase } from './phraseLevel.js'

describe('checkPhraseLevel A1', () => {
  it('пропускает простую фразу настоящего времени', () => {
    expect(checkPhraseLevel('Ich wasche meine Hände.', 'A1')).toEqual([])
    expect(checkPhraseLevel('Ich koche Suppe im Topf.', 'A1')).toEqual([])
  })

  it('бракует придаточное с союзом', () => {
    const r = checkPhraseLevel('Nachdem ich gekocht hatte, esse ich.', 'A1')
    expect(r.length).toBeGreaterThan(0)
    expect(r.join(' ')).toMatch(/придаточ/)
  })

  it('бракует запятую — на A1 фраза одна и простая', () => {
    expect(checkPhraseLevel('Ich koche und du isst, wir essen.', 'A1').join(' ')).toMatch(/запят/)
  })

  it('бракует прошедшее время (Perfekt)', () => {
    expect(checkPhraseLevel('Ich habe Suppe gekocht.', 'A1').join(' ')).toMatch(/прошед/)
  })

  it('бракует слишком длинную фразу', () => {
    const long = 'Ich gehe heute mit meiner Familie in die große Küche neben dem Garten.'
    expect(checkPhraseLevel(long, 'A1').join(' ')).toMatch(/длинн/)
  })

  it('бракует пустую строку и текст без конечной точки', () => {
    expect(checkPhraseLevel('', 'A1').length).toBeGreaterThan(0)
    expect(checkPhraseLevel('Ich koche Suppe', 'A1').join(' ')).toMatch(/точк/)
  })

  it('бракует кириллицу в целевом языке', () => {
    expect(checkPhraseLevel('Ich koche суп.', 'A1').join(' ')).toMatch(/кириллиц/)
  })

  it('на B1 придаточные и прошедшее разрешены', () => {
    expect(checkPhraseLevel('Ich glaube, dass er heute kommt.', 'B1')).toEqual([])
    expect(checkPhraseLevel('Ich habe Suppe gekocht.', 'B1')).toEqual([])
  })

  it('A0 строже A1 по длине', () => {
    const s = 'Ich gehe heute in die neue Küche.'  // 7 слов
    expect(checkPhraseLevel(s, 'A1')).toEqual([])
    expect(checkPhraseLevel(s, 'A0').join(' ')).toMatch(/длинн/)
  })

  it('isAcceptablePhrase — короткая обёртка', () => {
    expect(isAcceptablePhrase('Ich koche Suppe im Topf.', 'A1')).toBe(true)
    expect(isAcceptablePhrase('Ich habe Suppe gekocht.', 'A1')).toBe(false)
  })
})
