// Разделы дороги — «главы» карты уроков.
//
// В данных разделов нет и не было: таблица lessons знает только номер урока. Но макет новой
// главной (docs/maket-home) стоит на них — свёрнутая полоса пройденного раздела, карточка
// текущего, запертая шапка будущего. Без глав дорога на 49 уроков превращается в ленту без
// единой точки, где можно сказать «эту часть я закончил».
//
// Решение Павла 01.10.2026: резать автоматически по десять уроков, название брать из темы
// первого урока раздела. Он переспросил про размер («по 25 может по 20») — там речь шла о
// словах; разделов на 49 уроков тогда вышло бы два, и смысл главы пропал бы. Десять даёт
// пять глав и совпадает с макетом, где в разделе девять уроков.
//
// Название раздела отдаём ВМЕСТЕ с переводами первого урока: выбор локали — дело клиента,
// у него для этого есть getLessonTitle. Резать «Урок 31:» на сервере нельзя — приставка в
// каждом языке своя.

export const SECTION_LESSONS = 10

/**
 * @param {Array<{lesson_id:number, number:number, title:string, title_translations:object, state:string}>} nodes
 *        узлы-уроки в естественном порядке
 * @param {number} [size] уроков в разделе
 * @returns {Array<{index, from, to, title, title_translations, done, total, state}>}
 */
export function buildSections(nodes, size = SECTION_LESSONS) {
  if (!nodes?.length) return []
  const sections = []
  for (let i = 0; i < nodes.length; i += size) {
    const part = nodes.slice(i, i + size)
    const head = part[0]
    const done = part.filter(n => n.state === 'done').length
    sections.push({
      index: sections.length,
      number: sections.length + 1,
      from: head.number ?? null,
      to: part[part.length - 1].number ?? null,
      lesson_ids: part.map(n => n.lesson_id),
      title: head.title,
      title_translations: head.title_translations || {},
      done,
      total: part.length,
      // Состояние считаем по узлам, а не по счётчику: «текущий» — тот раздел, где стоит
      // текущий урок. Раздел, пройденный целиком, остаётся пройденным, даже если текущий
      // узел оказался позади него (дрип и пропуски такое допускают).
      state: part.some(n => n.state === 'current') ? 'current'
           : done === part.length ? 'done'
           : 'future',
    })
  }
  // Текущего узла может не быть вовсе (всё пройдено или всё заперто). Тогда текущим
  // объявляем первый непройденный — иначе на экране не окажется ни одной раскрытой главы.
  if (!sections.some(s => s.state === 'current')) {
    const first = sections.find(s => s.state !== 'done')
    if (first) first.state = 'current'
  }
  return sections
}

/**
 * Сколько уроков осталось до конца текущего раздела — подпись сундука.
 * @returns {{left:number, done:number, total:number}|null}
 */
export function chestProgress(sections) {
  const cur = sections.find(s => s.state === 'current')
  if (!cur) return null
  return { left: Math.max(0, cur.total - cur.done), done: cur.done, total: cur.total }
}
