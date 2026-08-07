import { describe, it, expect } from 'vitest'
import { checkWord, checkSentenceText } from './wordGate.js'

// Кейсы из реального брака (ИИ-аудит 07.08.2026) и из калибровки по всей базе (08.08.2026)
describe('checkWord — словарный гейт', () => {
  it('обычные немецкие слова и формы проходят', async () => {
    for (const w of ['der Hund', 'das Gespräch', 'übersetzt', 'du packst', 'fünfundfünfzig', 'sie/Sie lesen', 'nach Hause gekommen']) {
      expect((await checkWord(w, 'de')).ok, w).toBe(true)
    }
  })

  it('композиты проходят через разбиение', async () => {
    for (const w of ['der Bahnhof', 'die Volkshochschule', 'der Geburtstag', 'die Postleitzahl', 'der Hauptbahnhof']) {
      expect((await checkWord(w, 'de')).ok, w).toBe(true)
    }
  })

  it('выдуманные и разорванные слова ловятся', async () => {
    // «Furzehen»/«Briefland» здесь нет: разбиение композитов принимает их (Furz+Ehen,
    // Brief+Land — формально валидное словообразование). Их ловит проверка перевода
    // (ниже) и ИИ-аудит вторым эшелоном.
    for (const w of ['Hommian', 'Peda', 'Quit tungen', 'n']) {
      expect((await checkWord(w, 'de')).ok, w).toBe(false)
    }
  })

  it('слово без перевода — брак, даже если словообразование формально валидно', async () => {
    expect((await checkWord('Briefland', 'de', 'нет перевода')).ok).toBe(false)
    expect((await checkWord('Superdug', 'de', '')).ok).toBe(false)
    expect((await checkWord('der Hund', 'de', 'собака')).ok).toBe(true)
  })

  it('аббревиатуры, сокращения, топонимы и дефисные — не брак', async () => {
    for (const w of ['das GSM', 'z.B.', 'die U-Bahn', 'die Veststraße', 'welch-', '6 Millionen', 'er,sie,es']) {
      expect((await checkWord(w, 'de')).ok, w).toBe(true)
    }
  })

  it('английский принимает обе орфографии и апострофы', async () => {
    for (const w of [`That's a pity.`, 'neighbour', 'favourite', 'T-shirt']) {
      expect((await checkWord(w, 'en')).ok, w).toBe(true)
    }
  })

  it('язык без словаря не блокируется', async () => {
    expect((await checkWord('щось', 'uk')).ok).toBe(true)
  })
})

describe('checkSentenceText — гейт предложений', () => {
  it('нормальные предложения проходят', async () => {
    expect((await checkSentenceText('Die Katze trinkt Milch.', 'de')).ok).toBe(true)
    expect((await checkSentenceText('Können Sie das bitte wiederholen?', 'de')).ok).toBe(true)
  })

  it('OCR-мусор ловится', async () => {
    expect((await checkSentenceText('___ Sie _ie ih i.', 'de')).ok).toBe(false)          // пропуски и огрызки
    expect((await checkSentenceText('Schreiben Sie J j Y y ih i.', 'de')).ok).toBe(false) // россыпь огрызков
    expect((await checkSentenceText('Ich habe десять Bücher.', 'de')).ok).toBe(false)     // кириллица
    expect((await checkSentenceText('Die Furzehen Hommian Peda sind.', 'de')).ok).toBe(false) // несловарные
  })
})
