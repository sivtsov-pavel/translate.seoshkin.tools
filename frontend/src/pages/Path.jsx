import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle } from '../utils/translation.js'

// Экран «Путь» (режим новичка), макет 2a из docs/design_novichok.
//
// Дорога — одинаковые круглые узлы, активный крупнее остальных, и рядом с ним
// плашка с описанием: что это за урок и что делать. Иконок внутри кругов нет
// намеренно — от девяти разных значков рябит, а компактные подписи читаются
// быстрее и дают дороге спокойный ритм.
//
// Палитра из токенов хендоффа (oklch → sRGB), фон и текст — из тем проекта,
// чтобы экран не выбивался в светлой теме.
const C = {
  done: '#2E7D63', doneBorder: '#3FBF8F', doneInk: '#E8F7F0',
  future: 'var(--surface-2)', futureBorder: 'var(--line)', futureInk: 'var(--ink-soft)',
  current: '#9A5CD8', accent: '#E8B024', accentInk: '#3A2A05',
  speech: '#2F8296', grammar: '#9A5CD8', wordset: '#2E7D63', phraseset: '#B07D1B', exam: '#E8B024',
}

// Короткая подпись внутри круга станции: без иконок, но понятно, что это
const CP_SHORT = (t) => ({
  speech:  t.path.cpShortSpeech,
  grammar: t.path.cpShortGrammar,
  wordset: t.path.cpShortWordset,
  phraseset: t.path.cpShortPhrases,
  exam:    t.path.cpShortExam,
})

export default function Path() {
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const [data, setData] = useState(null)
  // «Показать все уроки» — по умолчанию видно окно вокруг текущего (принцип макета:
  // один следующий шаг), но список целиком тоже нужен.
  const [showAll, setShowAll] = useState(() => localStorage.getItem('path_show_all') === '1')

  useEffect(() => {
    api.get(`/path${showAll ? '?all=1' : ''}`).then(setData).catch(() => setData({ error: true }))
  }, [showAll])

  if (!data) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.common.loading}</div>
  if (data.error || !data.nodes?.length) {
    return <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>{t.path.empty}</div>
  }

  const { nodes, section, stats, road, tails } = data
  // Дорога — уроки вперемежку со станциями (речь, грамматика, наборы слов, зачёт).
  // Станция стоит НА пути, а не в стороне: иначе диктант и произношение не делают.
  const items = road?.length ? road : nodes.map(n => ({ kind: 'lesson', ...n }))
  const current = nodes.find(n => n.state === 'current')
  const short = CP_SHORT(t)

  const go = (n) => {
    if (n.kind === 'lesson') return navigate(`/lesson/${n.lesson_id}`)
    if (n.type === 'exam')    return navigate(`/exercise-session?lesson_id=${n.lesson_id}&exam=1`)
    if (n.type === 'wordset') return navigate(`/exercise-session?lesson_id=${n.lesson_id}`)
    if (n.type === 'phraseset') return navigate(`/phrases/${n.topic_id}`)
    if (n.type === 'speech')  return navigate(`/checkpoint/speech/${n.lesson_id}`)
    return navigate(`/checkpoint/grammar/${(n.lesson_ids || []).join(',')}`)
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '10px 16px 40px' }}>
      {/* Три плитки-метрики */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Tile icon="🔥" value={stats.streak} label={t.path.streak} />
        <Tile icon="⚡" value={stats.xp_today} label={t.path.xpToday} />
        <Tile icon="📘" value={`${data.done_lessons}/${data.total_lessons}`} label={t.path.lessons} />
      </div>

      {/* Карточка раздела: полоски вместо цифр */}
      <div style={{ padding: '16px 18px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t.path.section} {section.index + 1}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-soft)' }}>{section.done}/{section.total}</div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {nodes.map((n, i) => (
            <div key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: n.state === 'done' ? C.current : 'var(--surface-2)' }} />
          ))}
        </div>
      </div>

      {/* Дорога: изогнутая нить, узлы смещены по змейке — как было в прежней карте.
          Кривая Безье идёт от кружка к кружку и обтекает их, а не ломается углами. */}
      <PathRoad items={items} short={short} lang={lang} t={t} go={go} />

      <button onClick={() => { const v = !showAll; setShowAll(v); localStorage.setItem('path_show_all', v ? '1' : '0') }}
        style={{ width: '100%', marginTop: 24, padding: '11px 16px', borderRadius: 14, border: '1px solid var(--line)',
          background: 'var(--surface)', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {showAll ? t.path.showSection : t.path.showAll}
      </button>

      {/* Хвосты — общим числом: пропущенное не теряется и видно, сколько его */}
      {tails?.total > 0 && (
        <button onClick={() => navigate(current ? `/exercise-session?lesson_id=${current.lesson_id}&tails=1` : '/')}
          style={{ width: '100%', marginTop: 10, padding: '13px 16px', borderRadius: 14, border: '1px solid var(--line)',
            background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>↩️ {t.path.tails}</span>
          <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{tails.total}</span>
        </button>
      )}
    </div>
  )
}

function Tile({ icon, value, label }) {
  return (
    <div style={{ flex: 1, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{label}</div>
    </div>
  )
}

// Нить дороги и узлы поверх неё.
//
// Геометрия как в прежней карте уроков: узлы расставлены змейкой по сетке 320px,
// между ними — кубическая кривая Безье, поэтому линия течёт плавно и обтекает
// кружки, а не ломается прямыми углами.
function PathRoad({ items, short, lang, t, go }) {
  const GAP_Y = 118
  const X_PATTERN = [160, 92, 228, 120, 200, 160]

  const points = items.map((n, i) => ({
    n,
    x: X_PATTERN[i % X_PATTERN.length],
    y: 60 + i * GAP_Y,
  }))
  if (!points.length) return null

  const d = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const midY = (prev.y + p.y) / 2
    return `${acc} C ${prev.x} ${midY}, ${p.x} ${midY}, ${p.x} ${p.y}`
  }, '')

  const height = points[points.length - 1].y + 90
  const doneCount = points.filter(p => p.n.state === 'done').length

  return (
    <div style={{ position: 'relative', height, margin: '0 -4px' }}>
      <svg viewBox={`0 0 320 ${height}`} preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d={d} fill="none" stroke="var(--line)" strokeWidth="7" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#3FBF8F" strokeWidth="7" strokeLinecap="round"
          style={{
            strokeDasharray: 4000,
            strokeDashoffset: 4000 - (4000 * (doneCount + 0.4)) / points.length,
            transition: 'stroke-dashoffset .6s ease-out',
          }} />
      </svg>

      {points.map(({ n, x, y }, i) => {
        const isLesson = n.kind === 'lesson'
        const isCurrent = isLesson && n.state === 'current'
        const isDone = n.state === 'done'
        const locked = n.state === 'locked'
        const color = isLesson ? '#9A5CD8' : (C[n.type] || C.speech)
        const size = isCurrent ? 104 : isLesson ? 62 : 58

        // Подпись внутри круга: у станции это её название с переносом по словам,
        // у урока — номер. Отдельной подписи под кружком больше нет: от неё дорога
        // разъезжалась, а половина станций оставалась вовсе без имени.
        const inner = isLesson
          ? (isDone ? '✓' : (n.number ?? '•'))
          : (n.type === 'wordset' || n.type === 'phraseset'
              ? (getLessonTitle(n.title, n.title_translations, lang) || n.title || short[n.type])
              : short[n.type])

        return (
          <div key={`${n.kind}-${n.lesson_id ?? n.topic_id ?? i}-${i}`}
            style={{ position: 'absolute', left: `${(x / 320) * 100}%`, top: y - size / 2, transform: 'translateX(-50%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => !locked && go(n)} disabled={locked}
                style={{
                  width: size, height: size, borderRadius: '50%', flex: 'none',
                  cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.55 : 1,
                  background: isCurrent
                    ? `conic-gradient(${C.accent} 0 ${Math.round((n.progress || 0) * 100)}%, var(--surface-2) ${Math.round((n.progress || 0) * 100)}%)`
                    : isDone ? C.done : 'var(--surface)',
                  border: isCurrent ? 'none'
                    : `3px ${isDone || isLesson ? 'solid' : 'dashed'} ${isDone ? C.doneBorder : isLesson ? 'var(--line)' : color}`,
                  color: isDone ? C.doneInk : isLesson ? 'var(--ink)' : color,
                  boxShadow: isCurrent ? `0 0 0 8px ${C.accent}2E` : 'none',
                  display: 'grid', placeItems: 'center', padding: 4,
                  fontSize: isLesson ? 19 : 10.5, fontWeight: 800, lineHeight: 1.15,
                  wordBreak: 'break-word', hyphens: 'auto', textAlign: 'center',
                }}>
                {isCurrent
                  ? <span style={{ width: 84, height: 84, borderRadius: '50%', background: '#9A5CD8', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 28 }}>{n.number ?? '•'}</span>
                  : <span style={{ display: 'block', maxWidth: size - 14 }}>{inner}</span>}
              </button>

              {/* Плашка справа от активного узла — что за урок и что дальше */}
              {isCurrent && (
                <div style={{ width: 190, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.25 }}>
                    {getLessonTitle(n.title, n.title_translations, lang) || `${t.path.lesson} ${n.number ?? ''}`}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>{n.ex_done}/{n.ex_total}</div>
                  <button onClick={() => go(n)}
                    style={{ marginTop: 9, width: '100%', padding: '9px 12px', borderRadius: 12, border: 'none',
                      background: C.accent, color: C.accentInk, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    {t.path.start}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
