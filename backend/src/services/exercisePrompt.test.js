import { describe, it, expect } from 'vitest'
import { EXERCISES_PROMPT } from './claude.js'

// В промпте самое действенное — примеры. Раньше они были жёстко немецкими для ВСЕХ
// языков, и модель копировала их язык: в испанском курсе появлялись предложения
// «Die abeja ist klein», в английском — варианты [Kamera, Fernglas, Linse].
// Аудит 28.07.2026 нашёл 270 таких упражнений.
const LANGS = { de: 'немецкий', es: 'испанский', en: 'английский', fr: 'французский' }
const promptFor = (code) => {
  const t = {
    de: { name: 'немецкий', nounRule: 'существительные ВСЕГДА с артиклем (der/die/das) и с большой буквы',
      exNoun: { sentence: 'Die ___ trinkt Milch.', blank: 'Katze', options: ['Katze','Maus','Blume'] },
      exVerb: { sentence: 'Ich ___ den Lehrer.', blank: 'frage', options: ['frage','antworte','sehe'] },
      exMask: { word: 'Hund', masked: 'H_nd', tr: 'собака' }, askRu: 'Wie heißt das auf Russisch' },
    es: { name: 'испанский', nounRule: 'существительные с артиклем (el/la/los/las)',
      exNoun: { sentence: 'La ___ bebe leche.', blank: 'gata', options: ['gata','ratona','flor'] },
      exVerb: { sentence: 'Yo ___ al profesor.', blank: 'pregunto', options: ['pregunto','respondo','veo'] },
      exMask: { word: 'perro', masked: 'p_rro', tr: 'собака' }, askRu: 'Cómo se dice en ruso' },
    en: { name: 'английский', nounRule: 'существительные',
      exNoun: { sentence: 'The ___ drinks milk.', blank: 'cat', options: ['cat','mouse','flower'] },
      exVerb: { sentence: 'I ___ the teacher.', blank: 'ask', options: ['ask','answer','see'] },
      exMask: { word: 'dog', masked: 'd_g', tr: 'собака' }, askRu: 'How do you say it in Russian' },
  }[code]
  return EXERCISES_PROMPT(t)
}

describe('EXERCISES_PROMPT — примеры должны быть на языке курса', () => {
  it('испанский промпт не содержит немецких примеров', () => {
    const p = promptFor('es')
    expect(p).toContain('La ___ bebe leche.')
    expect(p).not.toContain('Die ___ trinkt Milch.')
    expect(p).not.toContain('Ich ___ den Lehrer.')
    expect(p).not.toContain('Wie heißt das auf Russisch')
  })

  it('английский промпт не содержит немецких примеров', () => {
    const p = promptFor('en')
    expect(p).toContain('The ___ drinks milk.')
    expect(p).not.toContain('Katze')
    expect(p).not.toContain('Hund')
  })

  it('немецкий промпт остался прежним', () => {
    const p = promptFor('de')
    expect(p).toContain('Die ___ trinkt Milch.')
    expect(p).toContain('Wie heißt das auf Russisch')
  })

  it('нигде не осталось жёсткой привязки «на немецком»', () => {
    for (const code of ['es', 'en']) {
      const p = promptFor(code)
      expect(p).not.toContain('на немецком')
      expect(p).not.toContain('немецкое слово')
      expect(p).not.toContain('в немецком все существительные')
    }
  })

  it('маска для «Добавь букву» тоже на языке курса', () => {
    expect(promptFor('es')).toContain('p_rro')
    expect(promptFor('en')).toContain('d_g')
  })
})
