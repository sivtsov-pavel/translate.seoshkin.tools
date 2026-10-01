import { describe, it, expect } from 'vitest'

// Та же функция, что в store/i18n.js — проверяем поведение слияния локалей
function withFallback(target, ...fallbacks) {
  const out = {}
  const keys = new Set([...fallbacks, target].flatMap(o => Object.keys(o || {})))
  for (const k of keys) {
    const vals = [target, ...fallbacks].map(o => o?.[k]).filter(v => v !== undefined)
    const v = vals[0]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = withFallback(...vals.filter(x => x && typeof x === 'object' && !Array.isArray(x)))
    } else {
      out[k] = v
    }
  }
  return out
}

const ru = {
  path: { now: 'СЕЙЧАС', ofLessons: (a, b) => `${a} из ${b}`, weekdays: ['пн','вт','ср'] },
  common: { loading: 'Загрузка' },
}
const en = { path: { now: 'NOW', ofLessons: (a, b) => `${a} of ${b}` }, common: { loading: 'Loading' } }

describe('withFallback — локаль не должна ронять приложение', () => {
  it('свой перевод важнее запасного', () => {
    const t = withFallback({ path: { now: 'JETZT' } }, en, ru)
    expect(t.path.now).toBe('JETZT')
  })

  it('пропущенный ключ берётся из английской, потом из русской', () => {
    const t = withFallback({ path: {} }, en, ru)
    expect(t.path.now).toBe('NOW')                 // есть в en
    expect(t.path.weekdays).toEqual(['пн','вт','ср']) // только в ru
  })

  it('функция-ключ не теряется — ровно из-за этого был белый экран', () => {
    // Павел переключил на английский, а ofLessons лежал только в ru: undefined(...) ронял React
    const t = withFallback({ path: {} }, {}, ru)
    expect(typeof t.path.ofLessons).toBe('function')
    expect(t.path.ofLessons(37, 49)).toBe('37 из 49')
  })

  it('массив берётся целиком, а не сливается поэлементно', () => {
    const t = withFallback({ path: { weekdays: ['Mo','Tu'] } }, en, ru)
    expect(t.path.weekdays).toEqual(['Mo','Tu'])   // без хвоста 'ср' из русской
  })

  it('пустая локаль даёт полный набор ключей', () => {
    const t = withFallback({}, en, ru)
    expect(Object.keys(t).sort()).toEqual(['common','path'])
    expect(t.common.loading).toBe('Loading')
  })

  it('вложенные разделы сливаются вглубь, а не заменяются целиком', () => {
    const t = withFallback({ common: { loading: 'Wird geladen' } }, en, ru)
    expect(t.common.loading).toBe('Wird geladen')
    expect(t.path.now).toBe('NOW')
  })
})
