// Русская транскрипция немецкого слова: «Tschüss» → «Чюсс».
//
// Нужна в двух местах, поэтому живёт отдельно от экрана произношения:
//  • подсказка ученику, как читать слово;
//  • сравнение с тем, что услышал микрофон. Распознавание на Android нередко отдаёт
//    результат КИРИЛЛИЦЕЙ («чус» вместо «Tschüss») — при сравнении по латинским буквам
//    такой ответ обнулялся, и правильно произнесённое слово не засчитывалось.
export function germanPhonetic(text) {
  return text.split(/(\s+|[-–,!?.])/u).map(tok => {
    if (/^[\s\-–,!?.]$/.test(tok)) return tok
    const w = tok.toLowerCase()
    let out = ''
    let i = 0
    while (i < w.length) {
      const s = w.slice(i)
      const prev = w[i - 1] || ''
      const next = w[i + 1] || ''
      const prevV = 'aeiouäöü'.includes(prev)
      const nextV = 'aeiouäöü'.includes(next)
      const wordStart = i === 0
      if      (s.startsWith('tsch'))            { out += 'ч';  i += 4 }
      else if (s.startsWith('sch'))             { out += 'ш';  i += 3 }
      else if (s.startsWith('ch'))              { out += 'х';  i += 2 }
      else if (s.startsWith('qu'))              { out += 'кв'; i += 2 }
      else if (s.startsWith('äu'))              { out += 'ой'; i += 2 }
      else if (s.startsWith('eu'))              { out += 'ой'; i += 2 }
      else if (s.startsWith('ei'))              { out += 'ай'; i += 2 }
      else if (s.startsWith('ie'))              { out += 'и';  i += 2 }
      else if (s.startsWith('au'))              { out += 'ау'; i += 2 }
      else if (wordStart && s.startsWith('sp')) { out += 'шп'; i += 2 }
      else if (wordStart && s.startsWith('st')) { out += 'шт'; i += 2 }
      else if (s.startsWith('ng'))              { out += 'нг'; i += 2 }
      else if (s.startsWith('nk'))              { out += 'нк'; i += 2 }
      else if (s.startsWith('pf'))              { out += 'пф'; i += 2 }
      else if (s.startsWith('ph'))              { out += 'ф';  i += 2 }
      else if (s.startsWith('th'))              { out += 'т';  i += 2 }
      else {
        const c = w[i]
        switch (c) {
          case 'a': out += 'а'; break
          case 'b': out += 'б'; break
          case 'c': out += (next === 'e' || next === 'i') ? 'ц' : 'к'; break
          case 'd': out += 'д'; break
          case 'e': out += 'е'; break
          case 'f': out += 'ф'; break
          case 'g': out += 'г'; break
          case 'h': out += prevV ? '' : 'х'; break // немое после гласной
          case 'i': out += 'и'; break
          case 'j': out += 'й'; break
          case 'k': out += 'к'; break
          case 'l': out += 'л'; break
          case 'm': out += 'м'; break
          case 'n': out += 'н'; break
          case 'o': out += 'о'; break
          case 'p': out += 'п'; break
          case 'r': out += 'р'; break
          case 's': out += (prevV && nextV) ? 'з' : 'с'; break
          case 't': out += 'т'; break
          case 'u': out += 'у'; break
          case 'v': out += 'ф'; break
          case 'w': out += 'в'; break
          case 'x': out += 'кс'; break
          case 'y': out += 'й'; break
          case 'z': out += 'ц'; break
          case 'ä': out += 'э'; break
          case 'ö': out += 'ё'; break
          case 'ü': out += 'ю'; break
          case 'ß': out += 'сс'; break
          default:  out += c; break
        }
        i++
      }
    }
    return out.charAt(0).toUpperCase() + out.slice(1)
  }).join('')
}
