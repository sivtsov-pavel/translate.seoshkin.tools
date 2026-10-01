// Геометрия карты уроков: где стоят узлы и как между ними течёт дорога.
//
// Вынесено из компонента отдельно, потому что это чистая математика — её можно проверить
// тестами, не поднимая браузер. Раскладка и формула кривой взяты из хендоффа макета
// (docs/maket-home, reference/road-path.js).

/**
 * Плавная кривая через центры узлов: Catmull-Rom, переведённый в кубические Безье.
 * Прежняя карта строила дорогу вручную «по случаю» — отдельно для движения вдоль ряда,
 * отдельно для перехода между рядами, — и на стыках ломалась углами. Catmull-Rom даёт
 * одну непрерывную линию через все точки без разбора случаев.
 * @param {Array<[number, number]>} pts
 * @returns {string} атрибут d для <path>
 */
export function roadPath(pts) {
  if (!pts.length) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`
  }
  return d
}

// Смещения узлов от центра колонки (ПК, px). Повторяются по кругу для длинных разделов.
export const OFFSETS = [40, 150, 170, 40, -170, -170, 10, 150, 110, -40]

// Размер узла по его состоянию — от него зависит и шаг по вертикали, и подпись.
export const NODE_SIZE = { done: 64, open: 64, current: 96, locked: 60, chest: 72, exam: 88 }

/**
 * Куда ставить узлы одного раздела.
 *
 * @param {Array<{state:string, kind?:string, type?:string}>} items узлы по порядку дороги
 * @param {object} o
 * @param {number} o.centerX    центр колонки в координатах карты
 * @param {number} o.startY     отступ сверху
 * @param {number} [o.step]     шаг по вертикали
 * @param {number} [o.afterCurrent] добавка после текущего узла — место под карточку урока
 * @param {number} [o.scale]    множитель горизонтальных смещений (планшет/телефон уже)
 * @returns {Array<{x:number, y:number}>}
 */
export function layoutNodes(items, { centerX, startY, step = 118, afterCurrent = 90, scale = 1 }) {
  let y = startY
  // Текущий узел всегда ставим на ЛЕВУЮ сторону: карточка урока раскрывается справа от него,
  // и справа ей нужно место. Паттерн смещений для этого проворачиваем так, чтобы на текущем
  // узле оказался слот -170. Без этого карточка у правого узла уезжала за край экрана —
  // ровно та беда, из-за которой её когда-то вообще убрали вниз (жалоба Павла 05.09.2026).
  const curIdx = items.findIndex(n => n.state === 'current')
  const shift = curIdx >= 0 ? (curIdx - 4 + OFFSETS.length) % OFFSETS.length : 0

  return items.map((n, i) => {
    // Контрольная — крупный ромб, ему нужен воздух сверху, иначе подпись предыдущего узла
    // ложится на его пунктирную рамку.
    if (n.type === 'exam') y += 20
    const off = OFFSETS[(i - shift + OFFSETS.length * 10) % OFFSETS.length] * scale
    const p = { x: centerX + off, y }
    y += step + (n.state === 'current' ? afterCurrent : 0)
    return p
  })
}

/**
 * Разложить плоскую дорогу по разделам.
 *
 * Бэкенд отдаёт road одним списком: уроки вперемежку со станциями (речь, грамматика, наборы,
 * зачёт). Главы же нужны экрану — по ним сворачивается пройденное. Станцию относим к разделу
 * её урока; грамматическая станция собрана из нескольких уроков, берём первый.
 *
 * Узлы, чьего урока в разделах нет (такое бывает у ученика при дрипе), не теряем — кладём
 * в последний раздел: потерять узел хуже, чем показать его чуть не там.
 */
export function splitRoadBySections(road, sections) {
  if (!sections?.length) return []
  const sectionOf = new Map()
  sections.forEach((s, i) => (s.lesson_ids || []).forEach(id => sectionOf.set(id, i)))

  const buckets = sections.map(() => [])
  for (const item of road || []) {
    const lid = item.lesson_id ?? (item.lesson_ids || [])[0]
    const idx = sectionOf.has(lid) ? sectionOf.get(lid) : buckets.length - 1
    buckets[idx].push(item)
  }
  return buckets
}
