// Спасение частично сломанного JSON от модели.
//
// Модель отвечает массивом объектов — упражнения, слова, темы. Один дефект в середине
// (незакрытая кавычка, лишняя запятая, оборванная строка) делал НЕПРИГОДНЫМ весь ответ:
// JSON.parse падал, и батч из сорока упражнений терялся целиком. В логах это выглядело как
// «Ошибка парсинга JSON от GPT (3124 символов): Expected ',' or ']' after array element»,
// а на деле означало, что двадцати словам урока не досталось упражнений. Именно так набор
// «Эмоции» остался с 36 словами и нулём упражнений.
//
// Здесь разбираем ответ поэлементно: находим верхнеуровневые объекты по балансу скобок и
// парсим каждый отдельно. Битый элемент теряется один, остальные доходят до базы.

/**
 * Достаёт из текста все объекты верхнего уровня, которые разбираются как JSON.
 * @param {string} text ответ модели (возможно, с мусором вокруг)
 * @returns {object[]} корректные объекты в порядке появления
 */
export function salvageJsonObjects(text) {
  const s = String(text || '')
  const out = []
  let depth = 0, start = -1, inString = false, escaped = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') { inString = true; continue }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue }
    if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(s.slice(start, i + 1))) } catch { /* битый элемент пропускаем */ }
        start = -1
      }
      // Лишняя закрывающая скобка — сбрасываем, иначе съедет весь дальнейший разбор.
      if (depth < 0) depth = 0
    }
  }
  return out
}
