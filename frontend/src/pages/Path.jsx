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

      {/* Дорога */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {items.map((n, i) => {
          const isLesson = n.kind === 'lesson'
          const isCurrent = isLesson && n.state === 'current'
          const isDone = n.state === 'done'
          const locked = n.state === 'locked'
          // Змейка: узлы уходят влево-вправо от центра, активный — по центру
          const shift = isCurrent ? 0 : [-52, 0, 52, 0][i % 4]
          const color = isLesson ? C.current : C[n.type] || C.speech
          const label = isLesson
            ? getLessonTitle(n.title, n.title_translations, lang) || `${t.path.lesson} ${n.number ?? ''}`
            : (n.type === 'wordset'
                ? getLessonTitle(n.title, n.title_translations, lang) || short.wordset
                : n.type === 'phraseset'
                  ? `${n.emoji || ''} ${n.title}`.trim()
                  : t.path[{ speech: 'cpSpeech', grammar: 'cpGrammar', exam: 'cpExam' }[n.type]])

          return (
            <div key={`${n.kind}-${n.lesson_id ?? i}-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              {i > 0 && (
                <div style={{ width: 4, height: 22, borderRadius: 2, margin: '5px 0',
                  background: isDone ? C.doneBorder : 'var(--line)', transform: `translateX(${shift / 2}px)` }} />
              )}

              {isCurrent ? (
                // Активный узел: крупный круг с кольцом прогресса и плашкой справа
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', justifyContent: 'center' }}>
                  <button onClick={() => go(n)}
                    style={{
                      width: 104, height: 104, borderRadius: '50%', cursor: 'pointer', border: 'none', flex: 'none',
                      background: `conic-gradient(${C.accent} 0 ${Math.round((n.progress || 0) * 100)}%, var(--surface-2) ${Math.round((n.progress || 0) * 100)}%)`,
                      display: 'grid', placeItems: 'center', boxShadow: `0 0 0 8px ${C.accent}2E`,
                    }}>
                    <span style={{ width: 84, height: 84, borderRadius: '50%', background: C.current, color: '#fff', display: 'grid', placeItems: 'center' }}>
                      <span style={{ fontSize: 28, fontWeight: 800 }}>{n.number ?? '•'}</span>
                    </span>
                  </button>

                  <div style={{ flex: 1, minWidth: 0, padding: '13px 16px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.25 }}>{label}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                      {n.ex_done}/{n.ex_total} · {t.path.lessonShort.toLowerCase()}
                    </div>
                    <button onClick={() => go(n)}
                      style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none',
                        background: C.accent, color: C.accentInk, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
                      {t.path.start}
                    </button>
                  </div>
                </div>
              ) : (
                // Обычный узел: небольшой круг, подпись под ним
                <div style={{ transform: `translateX(${shift}px)`, textAlign: 'center', maxWidth: 150 }}>
                  <button onClick={() => !locked && go(n)} disabled={locked}
                    style={{
                      width: isLesson ? 60 : 54, height: isLesson ? 60 : 54, borderRadius: '50%',
                      cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.55 : 1,
                      background: isDone ? C.done : 'var(--surface)',
                      border: `3px ${isDone ? 'solid' : isLesson ? 'solid' : 'dashed'} ${isDone ? C.doneBorder : isLesson ? 'var(--line)' : color}`,
                      color: isDone ? C.doneInk : isLesson ? 'var(--ink)' : color,
                      fontSize: isLesson ? 19 : 12, fontWeight: 800, display: 'grid', placeItems: 'center',
                      lineHeight: 1.1, padding: 2,
                    }}>
                    {isDone ? '✓' : isLesson ? (n.number ?? '•') : short[n.type]}
                  </button>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 5, color: 'var(--ink-soft)', lineHeight: 1.2 }}>
                    {label}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

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
