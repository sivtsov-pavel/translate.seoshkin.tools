import { BookOpen, MessageCircle, Quote, Lock, Check, Trophy, Gift } from 'lucide-react'

// Узлы дороги: шесть состояний из SPEC макета (docs/maket-home, раздел 5).
//
// Иконка типа — значок, а не обрубок слова. Прежняя карта писала внутрь кружка «Речь»,
// «Грам», «Слова»: текст в круге диаметром 58px приходилось резать, и он всё равно читался
// медленнее картинки. Значок узнаётся боковым зрением, а название стоит подписью под узлом.

export const TYPE_COLOR = {
  speech:    { main: '#23809E', dark: '#17627A' },
  wordset:   { main: '#2F8F6A', dark: '#206B4E' },
  phraseset: { main: '#B07F1C', dark: '#8A6212' },
  grammar:   { main: '#7C4DCC', dark: '#5B34A0' },
  exam:      { main: '#E3AE3A', dark: '#B98718' },
  lesson:    { main: '#7C4DCC', dark: '#5B34A0' },
}

export function TypeIcon({ type, size = 18, strokeWidth = 2.4 }) {
  const p = { size, strokeWidth, 'aria-hidden': true }
  if (type === 'speech')    return <MessageCircle {...p} />
  if (type === 'phraseset') return <Quote {...p} />
  if (type === 'exam')      return <Trophy {...p} />
  // Грамматика — «A» с плюсом: буква говорит про формы слова, а не про предмет вообще
  if (type === 'grammar') {
    return (
      <span aria-hidden style={{ fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: '-.04em' }}>
        A<sup style={{ fontSize: size * 0.55 }}>+</sup>
      </span>
    )
  }
  return <BookOpen {...p} />
}

// Значок типа бейджем в углу пройденного/открытого узла: внутри кружка уже стоит галочка
// или номер, а тип всё равно нужно видеть, не нажимая.
export function TypeBadge({ type }) {
  const c = TYPE_COLOR[type] || TYPE_COLOR.lesson
  return (
    <span className="path-node-badge" style={{ color: c.main, borderColor: c.main }}>
      <TypeIcon type={type} size={13} strokeWidth={2.6} />
    </span>
  )
}

/**
 * Один узел дороги. Всегда <button> с aria-label: карта проходится с клавиатуры,
 * а область нажатия не меньше 44px даже у самого мелкого, запертого узла.
 */
export function RoadNode({ node, title, label, onOpen, isOpen, tabIndex }) {
  // Внутри урока стоит его НОМЕР, а не значок типа. У станции тип — главное, что о ней надо
  // знать; у урока тип один на всех (значок книги в каждом кружке — шум), а номер отвечает
  // на вопрос «где я на дороге», ради которого на карту и смотрят.
  const kind = node.kind === 'lesson' ? 'lesson' : node.type
  const c = TYPE_COLOR[kind] || TYPE_COLOR.lesson
  const locked = node.state === 'locked'
  const done = node.state === 'done'
  const current = node.state === 'current'

  if (node.type === 'chest') {
    return (
      <button className="path-node path-node--chest" onClick={onOpen} aria-label={label} tabIndex={tabIndex}>
        <Gift size={28} strokeWidth={2.2} aria-hidden />
      </button>
    )
  }

  if (node.type === 'exam') {
    return (
      <button className={`path-node path-node--exam${locked ? ' is-locked' : ''}`}
        onClick={onOpen} aria-label={label} tabIndex={tabIndex}>
        <span className="path-node-exam-inner"><Trophy size={26} strokeWidth={2.2} aria-hidden /></span>
      </button>
    )
  }

  const cls = ['path-node',
    current ? 'path-node--current' : done ? 'path-node--done' : locked ? 'path-node--locked' : 'path-node--open',
    isOpen ? 'is-open' : ''].filter(Boolean).join(' ')

  return (
    <button className={cls} onClick={onOpen} aria-label={label} tabIndex={tabIndex}
      style={locked ? undefined : { '--node': c.main, '--node-d': c.dark }}>
      {current && <span className="path-node-ring" aria-hidden />}
      <span className="path-node-face">
        {locked ? <Lock size={22} strokeWidth={2.4} aria-hidden />
          : done ? <Check size={28} strokeWidth={3.2} aria-hidden />
          : kind === 'lesson' && node.number != null
            ? <span className="path-node-num" style={{ fontSize: current ? 30 : 22 }}>{node.number}</span>
            : <TypeIcon type={kind} size={current ? 30 : 22} />}
      </span>
      {(done || (!locked && !current)) && kind !== 'lesson' && <TypeBadge type={kind} />}
      {done && kind === 'lesson' && <TypeBadge type="lesson" />}
    </button>
  )
}
