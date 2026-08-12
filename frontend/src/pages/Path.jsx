import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle } from '../utils/translation.js'

// Экран «Путь» (режим новичка), макет 2a из docs/design_novichok.
//
// Принцип макета: один следующий шаг. На экране ровно одна яркая кнопка — «Начать»
// у текущего узла; всё остальное приглушено. Выбор ученику не требуется: видно, где он,
// что дальше и сколько осталось до конца раздела.
//
// Палитра взята из токенов хендоффа (oklch → sRGB), но фон и текст берём из тем проекта,
// чтобы экран не выбивался в светлой теме.
const C = {
  nodeDone:   '#2E7D63', nodeDoneBorder: '#3FBF8F', nodeDoneInk: '#E8F7F0',
  nodeFuture: '#26222F', nodeFutureBorder: '#38334A', nodeFutureInk: '#7A768A',
  current:    '#9A5CD8', accent: '#E8B024', accentInk: '#3A2A05',
  chest:      '#3A3218', chestBorder: '#8A7328',
}

export default function Path() {
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/path').then(setData).catch(() => setData({ error: true }))
  }, [])

  if (!data) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.common.loading}</div>
  if (data.error || !data.nodes?.length) {
    return (
      <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>
        {t.path.empty}
      </div>
    )
  }

  const { nodes, section, stats } = data
  const current = nodes.find(n => n.state === 'current')

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '10px 16px 40px' }}>
      {/* Три плитки-метрики */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Tile icon="🔥" value={stats.streak} label={t.path.streak} />
        <Tile icon="⚡" value={stats.xp_today} label={t.path.xpToday} />
        <Tile icon="📘" value={`${data.done_lessons}/${data.total_lessons}`} label={t.path.lessons} />
      </div>

      {/* Карточка раздела: полоски прогресса вместо цифр */}
      <div style={{ padding: '16px 18px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--line)', marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t.path.section} {section.index + 1}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink-soft)' }}>{section.done}/{section.total}</div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {nodes.map((n, i) => (
            <div key={i} style={{
              flex: 1, height: 7, borderRadius: 4,
              background: n.state === 'done' ? C.current : 'var(--surface-2)',
            }} />
          ))}
        </div>
      </div>

      {/* Дорога: узлы чередуются влево-вправо, между ними коннекторы */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {nodes.map((n, i) => {
          const shift = n.state === 'current' ? 40 : (i % 3 === 0 ? -48 : i % 3 === 1 ? 0 : 44)
          const title = getLessonTitle(n.title, n.title_translations, lang) || `${t.path.lesson} ${n.number ?? ''}`
          return (
            <div key={n.lesson_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {i > 0 && (
                <div style={{ width: 5, height: 30, borderRadius: 3, marginBottom: 6,
                  background: n.state === 'done' ? C.nodeDoneBorder : 'var(--line)',
                  transform: `translateX(${shift / 2}px)` }} />
              )}

              {n.state === 'current' ? (
                <div style={{ transform: `translateX(${shift}px)`, textAlign: 'center' }}>
                  <button onClick={() => navigate(`/lesson/${n.lesson_id}`)}
                    style={{
                      width: 112, height: 112, borderRadius: '50%', cursor: 'pointer', border: 'none',
                      background: `conic-gradient(${C.accent} 0 ${Math.round(n.progress * 100)}%, var(--surface-2) ${Math.round(n.progress * 100)}%)`,
                      display: 'grid', placeItems: 'center', boxShadow: `0 0 0 9px ${C.accent}33`,
                    }}>
                    <span style={{
                      width: 88, height: 88, borderRadius: '50%', background: C.current, color: '#fff',
                      display: 'grid', placeItems: 'center', lineHeight: 1.1,
                    }}>
                      <span style={{ fontSize: 30, fontWeight: 800 }}>{n.number ?? '•'}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.12em' }}>{t.path.lessonShort}</span>
                    </span>
                  </button>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8, maxWidth: 150 }}>{title}</div>
                  <button onClick={() => navigate(`/lesson/${n.lesson_id}`)}
                    style={{
                      marginTop: 10, padding: '13px 28px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: C.accent, color: C.accentInk, fontSize: 16, fontWeight: 700,
                    }}>{t.path.start}</button>
                </div>
              ) : (
                <div style={{ transform: `translateX(${shift}px)`, textAlign: 'center' }}>
                  <button
                    onClick={() => n.state === 'done' && navigate(`/lesson/${n.lesson_id}`)}
                    disabled={n.state === 'locked'}
                    style={{
                      width: 74, height: 74, borderRadius: '50%',
                      cursor: n.state === 'done' ? 'pointer' : 'default',
                      background: n.state === 'done' ? C.nodeDone : C.nodeFuture,
                      border: `4px solid ${n.state === 'done' ? C.nodeDoneBorder : C.nodeFutureBorder}`,
                      color: n.state === 'done' ? C.nodeDoneInk : C.nodeFutureInk,
                      fontSize: 24, fontWeight: 700, display: 'grid', placeItems: 'center',
                      opacity: n.state === 'locked' ? 0.7 : 1,
                    }}>
                    {n.state === 'done' ? '✓' : (n.number ?? '•')}
                  </button>
                  <div style={{ fontSize: 12, fontWeight: n.state === 'done' ? 600 : 500, marginTop: 6,
                    color: n.state === 'done' ? 'var(--ink-soft)' : C.nodeFutureInk, maxWidth: 130 }}>{title}</div>
                </div>
              )}
            </div>
          )
        })}

        {/* Сундук — конец раздела */}
        <div style={{ width: 5, height: 30, borderRadius: 3, margin: '6px 0', background: 'var(--line)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 74, height: 74, borderRadius: '50%', background: C.chest,
            border: `4px dashed ${C.chestBorder}`, display: 'grid', placeItems: 'center', fontSize: 30,
          }}>🎁</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: C.chestBorder }}>{t.path.chest}</div>
        </div>
      </div>

      {/* Фразы текущего урока — второй шаг после упражнений */}
      {current && (
        <button onClick={() => navigate(`/phrases/lesson/${current.lesson_id}`)}
          style={{
            width: '100%', marginTop: 28, padding: '13px 16px', borderRadius: 14,
            border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>🗣 {t.phrases.lessonSet}</button>
      )}
    </div>
  )
}

function Tile({ icon, value, label }) {
  return (
    <div style={{
      flex: 1, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)',
      border: '1px solid var(--line)', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{label}</div>
    </div>
  )
}
