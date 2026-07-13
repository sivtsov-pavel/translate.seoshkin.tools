// Генератор кроссворда из немецких слов (жадное размещение с пересечениями).
// Вход: [{ word, clue }]. Выход: { cells, entries, rows, cols } или null.

const norm = (w) => (w || '').toUpperCase().replace(/ß/g, 'SS').replace(/[^A-ZÄÖÜ]/g, '')

export function generateCrossword(rawEntries, maxWords = 11) {
  // Готовим и чистим слова: 3-9 букв, без дублей, длинные первыми
  const seen = new Set()
  let words = []
  for (const e of rawEntries) {
    const word = norm((e.word || '').replace(/^(der|die|das|ein|eine)\s+/i, ''))
    if (word.length < 3 || word.length > 9) continue
    if (seen.has(word)) continue
    seen.add(word)
    words.push({ word, clue: e.clue || '' })
  }
  words.sort((a, b) => b.word.length - a.word.length)
  words = words.slice(0, Math.max(maxWords, 6))
  if (words.length < 3) return null

  const cells = new Map()       // "r,c" -> letter
  const placed = []             // { word, clue, row, col, dir }
  const at = (r, c) => cells.get(`${r},${c}`)

  function canPlace(word, row, col, dir) {
    const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0
    // клетки до/после слова должны быть пусты
    if (at(row - dr, col - dc) || at(row + dr * word.length, col + dc * word.length)) return false
    let crosses = 0
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i, c = col + dc * i
      const cur = at(r, c)
      if (cur) { if (cur !== word[i]) return false; crosses++; continue }
      // пустая клетка: перпендикулярные соседи должны быть пусты (иначе слипание)
      if (dir === 'H') { if (at(r - 1, c) || at(r + 1, c)) return false }
      else { if (at(r, c - 1) || at(r, c + 1)) return false }
    }
    return crosses >= 1
  }

  function put(word, clue, row, col, dir) {
    const dr = dir === 'V' ? 1 : 0, dc = dir === 'H' ? 1 : 0
    for (let i = 0; i < word.length; i++) cells.set(`${row + dr * i},${col + dc * i}`, word[i])
    placed.push({ word, clue, row, col, dir })
  }

  // Первое слово — горизонтально в центре
  put(words[0].word, words[0].clue, 0, 0, 'H')

  for (let wi = 1; wi < words.length; wi++) {
    const { word, clue } = words[wi]
    let best = null
    for (const p of placed) {
      for (let i = 0; i < p.word.length; i++) {
        for (let j = 0; j < word.length; j++) {
          if (p.word[i] !== word[j]) continue
          const dir = p.dir === 'H' ? 'V' : 'H'
          const pr = p.dir === 'H' ? p.row : p.row + i
          const pc = p.dir === 'H' ? p.col + i : p.col
          const row = dir === 'H' ? pr : pr - j
          const col = dir === 'H' ? pc - j : pc
          if (canPlace(word, row, col, dir)) { best = { row, col, dir }; break }
        }
        if (best) break
      }
      if (best) break
    }
    if (best) put(word, clue, best.row, best.col, best.dir)
  }

  if (placed.length < 3) return null

  // Нормализуем координаты
  const minR = Math.min(...placed.map(p => p.row))
  const minC = Math.min(...placed.map(p => p.col))
  const maxR = Math.max(...placed.map(p => (p.dir === 'V' ? p.row + p.word.length - 1 : p.row)))
  const maxC = Math.max(...placed.map(p => (p.dir === 'H' ? p.col + p.word.length - 1 : p.col)))
  const rows = maxR - minR + 1, cols = maxC - minC + 1

  // Строим карту клеток и нумерацию
  const grid = new Map()  // "r,c" -> { letter, num }
  for (const p of placed) { p.row -= minR; p.col -= minC }
  for (const p of placed) {
    const dr = p.dir === 'V' ? 1 : 0, dc = p.dir === 'H' ? 1 : 0
    for (let i = 0; i < p.word.length; i++) {
      const key = `${p.row + dr * i},${p.col + dc * i}`
      if (!grid.has(key)) grid.set(key, { letter: p.word[i] })
    }
  }
  // Нумеруем стартовые клетки
  let num = 0
  const startNum = new Map()
  const entries = []
  // сортируем по (row, col) для читаемой нумерации
  const sorted = [...placed].sort((a, b) => a.row - b.row || a.col - b.col)
  for (const p of sorted) {
    const key = `${p.row},${p.col}`
    if (!startNum.has(key)) { num++; startNum.set(key, num); grid.get(key).num = num }
    entries.push({ ...p, num: startNum.get(key) })
  }
  return { grid, entries, rows, cols }
}
