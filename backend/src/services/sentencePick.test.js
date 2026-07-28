import { describe, it, expect } from 'vitest'
import { pickSentencesFor, matchKey } from './sentencePick.js'

// Заполнитель, чтобы список предложений превысил лимит и отбор реально включился
const filler = (n) => Array.from({ length: n }, (_, i) => `Das ist Satz Nummer ${i}.`)

describe('matchKey', () => {
  it('срезает артикль', () => {
    expect(matchKey('das Kind')).toBe('kind')
  })

  it('длинное слово укорачивает — иначе склонение не найдётся', () => {
    // «arbeiten» → ключ «arbeit», найдётся и в «arbeitet», и в «arbeiten»
    expect(matchKey('arbeiten')).toBe('arbeit')
  })

  it('короткое оставляет целиком', () => {
    expect(matchKey('ich')).toBe('ich')
  })

  it('многословное ищет по первому слову', () => {
    expect(matchKey('noch nicht')).toBe('noch')
  })

  it('испанский артикль тоже срезается', () => {
    expect(matchKey('la casa', 'es')).toBe('casa')
  })
})

describe('pickSentencesFor', () => {
  it('короткий список отдаёт целиком — отбирать нечего', () => {
    const s = ['Ich wohne hier.', 'Du kommst spät.']
    expect(pickSentencesFor(s, [{ word_de: 'das Kind' }])).toEqual(s)
  })

  it('предложения со словами пачки идут первыми', () => {
    const s = [...filler(50), 'Das Kind spielt draußen.']
    const out = pickSentencesFor(s, [{ word_de: 'das Kind' }], 'de', 40)
    expect(out[0]).toBe('Das Kind spielt draußen.')
    expect(out).toHaveLength(40)
  })

  it('находит слово в изменённой форме', () => {
    const s = [...filler(50), 'Er arbeitet im Büro.']
    expect(pickSentencesFor(s, [{ word_de: 'arbeiten' }], 'de', 40)[0]).toBe('Er arbeitet im Büro.')
  })

  it('короткое слово не ловится внутри другого («du» в «durch»)', () => {
    const s = [...filler(50), 'Wir gehen durch den Park.']
    // релевантных нет → первым идёт обычный заполнитель, а не «durch»-предложение
    expect(pickSentencesFor(s, [{ word_de: 'du' }], 'de', 40)[0]).toBe('Das ist Satz Nummer 0.')
  })

  it('остаток добирается прочими — модель не остаётся без примеров стиля', () => {
    const s = [...filler(50), 'Die Katze schläft.']
    const out = pickSentencesFor(s, [{ word_de: 'die Katze' }], 'de', 5)
    expect(out[0]).toBe('Die Katze schläft.')
    expect(out).toHaveLength(5)
  })

  it('пустой вход не роняет', () => {
    expect(pickSentencesFor(null, null)).toEqual([])
  })
})
