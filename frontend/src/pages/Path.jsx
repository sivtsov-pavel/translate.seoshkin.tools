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
  // Тап по узлу раскрывает его, а не проваливает в упражнение: карта должна быть
  // интерактивной — сначала видно, что внутри станции, и уже оттуда выбираешь.
  const [selected, setSelected] = useState(null)   // ключ выбранного узла
  const [details, setDetails] = useState(null)     // содержимое станции (грузим по тапу)

  useEffect(() => {
    api.get('/path').then(setData).catch(() => setData({ error: true }))
  }, [])

  // Дорога показывается целиком, поэтому подкручиваем к текущему узлу — иначе
  // ученик открывает экран на первом уроке и не понимает, где он сейчас.
  useEffect(() => {
    if (!data?.nodes?.length) return
    const id = setTimeout(() => {
      document.querySelector('[data-current-node]')
        ?.scrollIntoView({ behavior: 'auto', block: 'center' })
    }, 60)
    return () => clearTimeout(id)
  }, [data])

  if (!data) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.common.loading}</div>
  if (data.error || !data.nodes?.length) {
    return <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>{t.path.empty}</div>
  }

  const { nodes, section, stats, road, tails, weekly, skills } = data
  // Дорога — уроки вперемежку со станциями (речь, грамматика, наборы слов, зачёт).
  // Станция стоит НА пути, а не в стороне: иначе диктант и произношение не делают.
  const items = road?.length ? road : nodes.map(n => ({ kind: 'lesson', ...n }))
  const current = nodes.find(n => n.state === 'current')
  const short = CP_SHORT(t)

  const go = (n) => {
    if (n?.__url) return navigate(n.__url)   // строка внутри плашки станции
    // «Начать» — короткая случайная сессия по двум главным типам (узнавание и карточки),
    // как облегчённый зачёт. Полный список шагов — по кнопке «Выбор упражнения».
    if (n.kind === 'lesson') return navigate(`/exercise-session?lesson_id=${n.lesson_id}&types=multiple_choice,flashcard&shuffle=1`)
    if (n.type === 'exam')    return navigate(`/exercise-session?lesson_id=${n.lesson_id}&exam=1`)
    if (n.type === 'wordset') return navigate(`/exercise-session?lesson_id=${n.lesson_id}`)
    if (n.type === 'phraseset') return navigate(`/phrases/${n.topic_id}`)
    if (n.type === 'speech')  return navigate(`/checkpoint/speech/${n.lesson_id}`)
    return navigate(`/checkpoint/grammar/${(n.lesson_ids || []).join(',')}`)
  }

  return (
    <div className="path-layout">
      <div className="path-main" style={{ maxWidth: 560, margin: '0 auto', padding: '10px 16px 40px' }}>
      {/* Три плитки-метрики — только на телефоне: на ПК и планшете те же цифры
          стоят в правой колонке, и наверху они дублировались. */}
      <div className="path-top-tiles" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Tile shape="circle"  tone="#E8863C" value={stats.streak} label={t.path.streak} />
        <Tile shape="square"  tone="#E8B024" value={stats.xp_today} label={t.path.xpToday} />
        <Tile shape="diamond" tone="#9A5CD8" value={`${data.done_lessons}/${data.total_lessons}`} label={t.path.lessons} />
      </div>

      {/* Карточка текущего урока: раньше здесь стояла неизменная надпись «Раздел N»,
          по которой нельзя было понять ни что учим сейчас, ни сколько осталось. */}
      <div onClick={() => document.querySelector('[data-current-node]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        title={t.path.start}
        style={{ padding: '16px 18px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 20, cursor: 'pointer' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {t.path.section} {section.index + 1} · {section.done}/{section.total}
        </div>
        {current && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, lineHeight: 1.25 }}>
              {getLessonTitle(current.title, current.title_translations, lang) || `${t.path.lesson} ${current.number ?? ''}`}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
              {t.path.lesson} {current.number} · {current.ex_done}/{current.ex_total}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
          {nodes.map((n, i) => (
            <div key={i} style={{ flex: 1, height: 7, borderRadius: 4,
              background: n.state === 'done' ? C.doneBorder : n.state === 'current' ? C.accent : 'var(--surface-2)' }} />
          ))}
        </div>
      </div>

      {/* Дорога: изогнутая нить, узлы смещены по змейке — как было в прежней карте.
          Кривая Безье идёт от кружка к кружку и обтекает их, а не ломается углами. */}
      <PathRoad items={items} short={short} lang={lang} t={t} go={go}
        selected={selected} setSelected={setSelected} details={details} setDetails={setDetails} />

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

      {/* Правая колонка (макет 2a, только ПК): неделя, «что уже умею», сундук.
          На телефоне и планшете скрыта — там эти данные отвлекают от дороги. */}
      <aside className="path-aside">
        <div className="path-aside-tiles">
          <Tile shape="circle"  tone="#E8863C" value={stats.streak} label={t.path.streak} />
          <Tile shape="square"  tone="#E8B024" value={stats.xp_today} label={t.path.xpToday} />
          <Tile shape="diamond" tone="#9A5CD8" value={`${data.done_lessons}/${data.total_lessons}`} label={t.path.lessons} />
        </div>

        {weekly?.length > 0 && (
          <div className="path-aside-card">
            <div className="path-aside-title">{t.path.week}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginTop: 12 }}>
              {weekly.map((d, i) => {
                const max = Math.max(...weekly.map(x => x.count), 1)
                const h = Math.max(6, Math.round((d.count / max) * 60))
                const today = i === weekly.length - 1
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: '100%', height: h, borderRadius: 7, background: today ? '#E8B024' : '#9A5CD8' }} />
                    <span style={{ fontSize: 10.5, fontWeight: today ? 800 : 600, color: today ? 'var(--ink)' : 'var(--ink-soft)' }}>
                      {(t.path.weekdays || [])[d.weekday - 1] || ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {skills && (
          <div className="path-aside-card">
            <div className="path-aside-title">{t.path.skills}</div>
            <Skill label={t.path.skillWords}  value={skills.words_known} pct={Math.min(100, skills.words_known / 5)} color="#9A5CD8" />
            <Skill label={t.path.skillListen} value={`${skills.listen_pct}%`} pct={skills.listen_pct} color="#3FA9C4" />
            <Skill label={t.path.skillSpeak}  value={`${skills.speak_pct}%`} pct={skills.speak_pct} color="#3FBF8F" />
          </div>
        )}

        <div className="path-aside-card path-aside-card--chest">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, background: '#E8B024', display: 'grid', placeItems: 'center', fontSize: 22 }}>🎁</span>
            <span>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{t.path.chest}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                {Math.max(0, section.total - section.done)} · {t.path.lessons}
              </div>
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}

// Строка навыка: подпись, значение и полоска — как в правой колонке макета
function Skill({ label, value, pct, color }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700 }}>
        <span>{label}</span><span style={{ color: 'var(--ink-soft)' }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', marginTop: 5 }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 4, background: color }} />
      </div>
    </div>
  )
}

// Плитка метрики по макету: цветная фигура вместо эмодзи, крупное число, подпись.
// Фигуры те же, что в навигации: круг, квадрат, ромб — глаз связывает их между экранами.
function Tile({ shape, tone, value, label }) {
  const radius = shape === 'circle' ? '50%' : shape === 'square' ? 6 : 3
  return (
    <div style={{ flex: 1, padding: '12px 10px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{
          width: 20, height: 20, borderRadius: radius, background: tone,
          transform: shape === 'diamond' ? 'rotate(45deg)' : 'none', display: 'block',
        }} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 1 }}>{label}</div>
    </div>
  )
}

// Нить дороги и узлы поверх неё.
//
// Геометрия как в прежней карте уроков: узлы расставлены змейкой по сетке 320px,
// между ними — кубическая кривая Безье, поэтому линия течёт плавно и обтекает
// кружки, а не ломается прямыми углами.
function PathRoad({ items, short, lang, t, go, selected, setSelected, details, setDetails }) {
  // Ключ узла: у уроков он по lesson_id, у станций — по типу и цели
  const keyOf = (n, i) => `${n.kind}-${n.type || 'lesson'}-${n.lesson_id ?? n.topic_id ?? i}`

  // Раскрываем узел и подгружаем, что внутри станции (три озвучки, падежи и т.п.)
  const openNode = async (n, i) => {
    const k = keyOf(n, i)
    if (selected === k) { setSelected(null); setDetails(null); return }
    setSelected(k); setDetails(null)
    if (n.kind === 'checkpoint' && (n.type === 'speech' || n.type === 'grammar')) {
      const lid = n.lesson_id ?? (n.lesson_ids || [])[0]
      if (lid) {
        try { setDetails(await api.get(`/path/lesson/${lid}`)) } catch { setDetails({ error: true }) }
      }
    }
  }

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
  // Доля закрашенной нити — по позиции последнего пройденного узла. Если считать
  // количеством, непройденные станции между уроками рвут линию, хотя путь пройден.
  let lastDone = -1
  points.forEach((p, i) => { if (p.n.state === 'done') lastDone = i })
  const filled = points.length > 1 ? (lastDone + 0.5) / points.length : 0

  return (
    <div style={{ position: 'relative', height, margin: '0 -4px' }}>
      <svg viewBox={`0 0 320 ${height}`} preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d={d} fill="none" stroke="var(--line)" strokeWidth="7" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#3FBF8F" strokeWidth="7" strokeLinecap="round"
          style={{
            strokeDasharray: 4000,
            strokeDashoffset: 4000 - 4000 * Math.max(0, filled),
            transition: 'stroke-dashoffset .6s ease-out',
          }} />
      </svg>

      {points.map(({ n, x, y }, i) => {
        const k = keyOf(n, i)
        const isLesson = n.kind === 'lesson'
        const isOpen = selected ? selected === k : (isLesson && n.state === 'current')
        const isDone = n.state === 'done'
        const locked = n.state === 'locked'
        const color = isLesson ? '#9A5CD8' : (C[n.type] || C.speech)
        const size = isOpen ? 104 : isLesson ? 62 : 58

        // Форма станции: наборы — квадрат, грамматика и зачёт — ромб, речь и уроки — круг.
        // Те же фигуры, что в навигации: форма читается быстрее подписи.
        const shape = isLesson || n.type === 'speech' ? 'circle'
          : (n.type === 'wordset' || n.type === 'phraseset') ? 'square' : 'diamond'
        const radius = shape === 'circle' ? '50%' : shape === 'square' ? '16px' : '14px'

        const title = isLesson
          ? (getLessonTitle(n.title, n.title_translations, lang) || `${t.path.lesson} ${n.number ?? ''}`)
          : (n.type === 'wordset' || n.type === 'phraseset'
              ? (getLessonTitle(n.title, n.title_translations, lang) || n.title || short[n.type])
              : t.path[{ speech: 'cpSpeech', grammar: 'cpGrammar', exam: 'cpExam' }[n.type]])

        const inner = isLesson ? (isDone ? '✓' : (n.number ?? '•')) : short[n.type]
        const pct = isLesson
          ? Math.round((n.progress || 0) * 100)
          : (n.total ? Math.round((n.done / n.total) * 100) : 0)

        return (
          <div key={k} {...(isLesson && n.state === 'current' ? { 'data-current-node': '1' } : {})}
            style={{ position: 'absolute', left: `${(x / 320) * 100}%`, top: y - size / 2, transform: 'translateX(-50%)', zIndex: isOpen ? 5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => !locked && openNode(n, i)} disabled={locked}
                style={{
                  width: size, height: size, borderRadius: radius, flex: 'none',
                  transform: shape === 'diamond' ? 'rotate(45deg)' : 'none',
                  cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.55 : 1,
                  background: isOpen
                    ? `conic-gradient(${C.accent} 0 ${pct}%, var(--surface-2) ${pct}%)`
                    : isDone ? C.done : 'var(--surface)',
                  border: isOpen ? 'none'
                    : `3px ${isDone || isLesson ? 'solid' : 'dashed'} ${isDone ? C.doneBorder : isLesson ? 'var(--line)' : color}`,
                  color: isDone ? C.doneInk : isLesson ? 'var(--ink)' : color,
                  boxShadow: isOpen ? `0 0 0 8px ${C.accent}2E` : 'none',
                  display: 'grid', placeItems: 'center', padding: 4,
                  fontSize: isLesson ? 19 : 10.5, fontWeight: 800, lineHeight: 1.15,
                  wordBreak: 'break-word', textAlign: 'center', transition: 'width .18s, height .18s',
                }}>
                <span style={{
                  transform: shape === 'diamond' ? 'rotate(-45deg)' : 'none',
                  display: 'grid', placeItems: 'center',
                  ...(isOpen ? {
                    width: size - 20, height: size - 20, borderRadius: shape === 'circle' ? '50%' : 12,
                    background: isLesson ? '#9A5CD8' : color, color: '#fff',
                    fontSize: isLesson ? 26 : 12,
                  } : { maxWidth: size - 14 }),
                }}>
                  {isOpen ? (isLesson ? (n.number ?? '•') : short[n.type]) : inner}
                </span>
              </button>

              {/* Плашка раскрытого узла: что внутри и кнопки — из неё и выбираешь */}
              {isOpen && (
                <NodeCard n={n} title={title} details={details} t={t} go={go} pct={pct} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Плашка раскрытого узла: название, что внутри и кнопки.
// Для станции «речь» это три занятия (фразы, диктант, произношение), для грамматики —
// спряжение и падежи, для наборов — сам набор. Тап по карте больше никуда не проваливает.
function NodeCard({ n, title, details, t, go, pct }) {
  const isLesson = n.kind === 'lesson'
  // Что это за узел: без подписи по одному названию непонятно, урок это,
  // набор слов или станция речи.
  const kindLabel = isLesson
    ? `${t.path.kindLesson} ${n.number ?? ''}`.trim()
    : ({ speech: t.path.cpSpeech, grammar: t.path.cpGrammar, wordset: t.path.cpWordset,
         phraseset: t.path.cpPhraseset, exam: t.path.cpExam })[n.type] || ''
  const steps = details?.steps || []
  const byType = (type) => steps.find(s => s.type === type)

  const rows = []
  if (n.kind === 'checkpoint' && n.type === 'speech' && details) {
    if (details.phrases?.total) rows.push({ label: t.phrases.lessonSet, done: details.phrases.done, total: details.phrases.total, go: `/phrases/lesson/${n.lesson_id}` })
    const d = byType('dictation'); if (d) rows.push({ label: t.exercise.dictation, done: d.done, total: d.total, go: `/exercise-session?lesson_id=${n.lesson_id}&type=dictation` })
    const sp = byType('speech');   if (sp) rows.push({ label: t.exercise.speech || 'Произношение', done: sp.done, total: sp.total, go: `/exercise-session?lesson_id=${n.lesson_id}&type=speech` })
  }
  if (n.kind === 'checkpoint' && n.type === 'grammar' && details) {
    const c = byType('conjugation'); if (c) rows.push({ label: t.exercise.conjugation, done: c.done, total: c.total, go: `/exercise-session?lesson_id=${details.lesson.id}&type=conjugation` })
    const dc = byType('declension'); if (dc) rows.push({ label: t.exercise.declension || 'Падежи', done: dc.done, total: dc.total, go: `/exercise-session?lesson_id=${details.lesson.id}&type=declension` })
  }

  return (
    <div style={{ width: 208, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 12px 30px -24px rgba(0,0,0,.6)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{kindLabel}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.25, marginTop: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>
        {isLesson ? `${n.ex_done}/${n.ex_total}` : `${n.done}/${n.total}`} · {pct}%
      </div>

      {/* Что внутри станции */}
      {rows.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => (
            <button key={r.label} onClick={() => go({ __url: r.go })}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 10,
                border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
              <span>{r.label}</span>
              <span style={{ color: r.done >= r.total ? 'var(--good)' : 'var(--ink-soft)' }}>{r.done}/{r.total}</span>
            </button>
          ))}
        </div>
      )}

      {n.kind === 'checkpoint' && !rows.length && details === null && (n.type === 'speech' || n.type === 'grammar') && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>…</div>
      )}

      <button onClick={() => go(n)}
        style={{ marginTop: 10, width: '100%', padding: '9px 12px', borderRadius: 12, border: 'none',
          background: C.accent, color: C.accentInk, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        {t.path.start}
      </button>

      {/* Пропустить станцию: непройденное уходит в хвосты и вернётся позже.
          Речь ночью не сделаешь — но и терять её нельзя. */}
      {n.kind === 'checkpoint' && (n.type === 'speech' || n.type === 'grammar') && (
        <button onClick={async () => {
          const lid = n.lesson_id ?? (n.lesson_ids || [])[0]
          try { await api.post('/path/checkpoint/defer', { type: n.type, lesson_id: lid }) } catch {}
          go({ __url: '/' })
        }}
          style={{ marginTop: 7, width: '100%', padding: '9px 12px', borderRadius: 12,
            border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-soft)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {t.phrases.skip} → {t.path.tails}
        </button>
      )}

      {/* Полный список упражнений урока — карточка урока со всеми шагами,
          словами, зачётом и печатью */}
      {isLesson && (
        <button onClick={() => go({ __url: `/lesson/${n.lesson_id}` })}
          style={{ marginTop: 7, width: '100%', padding: '9px 12px', borderRadius: 12,
            border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {t.path.chooseExercise}
        </button>
      )}
    </div>
  )
}
