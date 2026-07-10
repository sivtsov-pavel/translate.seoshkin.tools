import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'

// Перемешать массив (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Создать 16 карточек из 8 пар слов
function buildCards(words, lang) {
  const pairs = shuffle(words).slice(0, 8)
  const cards = []
  pairs.forEach((w, i) => {
    const target = (lang !== 'de' && lang !== 'en' && w.translations?.[lang]) ? w.translations[lang]
      : (w.translations?.en || w.translation_ru)
    cards.push({ uid: `de-${i}`, pairId: i, side: 'de', text: w.word_de, matched: false, flipped: false })
    cards.push({ uid: `tr-${i}`, pairId: i, side: 'tr', text: target || w.translation_ru, matched: false, flipped: false })
  })
  return shuffle(cards)
}

// Одна карточка
function Card({ card, onClick, disabled, showAll }) {
  const isDE = card.side === 'de'
  const visible = showAll || card.flipped || card.matched

  return (
    <div
      onClick={() => !disabled && !card.matched && !card.flipped && onClick(card.uid)}
      style={{
        position: 'relative',
        height: 80,
        borderRadius: 14,
        cursor: card.matched || card.flipped || disabled ? 'default' : 'pointer',
        userSelect: 'none',
        perspective: 600,
      }}
    >
      {/* Задняя сторона (рубашка) */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 14,
        background: 'var(--surface-2)', border: '2px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, opacity: visible ? 0 : 1,
        transition: 'opacity .25s',
        pointerEvents: 'none',
      }}>
        🇩🇪
      </div>

      {/* Лицевая сторона */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 14,
        border: `2px solid ${card.matched ? 'var(--good, #22c55e)' : 'var(--accent)'}`,
        background: card.matched
          ? 'var(--good-soft, rgba(34,197,94,.12))'
          : isDE
            ? 'var(--surface)'
            : 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '6px 10px', textAlign: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity .25s',
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: card.text.length > 12 ? 12 : card.text.length > 8 ? 14 : 16,
          fontWeight: 700,
          fontFamily: isDE ? 'Georgia, serif' : 'inherit',
          fontStyle: isDE ? 'normal' : 'italic',
          color: 'var(--ink)',
          lineHeight: 1.2,
          wordBreak: 'break-word',
        }}>
          {card.text}
        </span>
      </div>
    </div>
  )
}

export default function WordMatch() {
  const { lang } = useI18nStore()
  const [lessons, setLessons] = useState([])
  const [lessonId, setLessonId] = useState('')
  const [cards, setCards] = useState([])
  const [flippedUids, setFlippedUids] = useState([])
  const [matchedCount, setMatchedCount] = useState(0)
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(false)   // фаза предпросмотра
  const [previewSec, setPreviewSec] = useState(4)  // обратный отсчёт
  const lockRef = useRef(false)
  const timerRef = useRef(null)
  const previewRef = useRef(null)

  // Загружаем список уроков
  useEffect(() => {
    api.get('/lessons').then(data => {
      const done = (Array.isArray(data) ? data : data.lessons || []).filter(l => l.status === 'done' || l.words_count > 0)
      setLessons(done)
      if (done.length > 0) setLessonId(String(done[0].id))
    }).catch(() => {})
  }, [])

  const startGame = useCallback(async () => {
    if (!lessonId) return
    setLoading(true)
    try {
      const words = await api.get(`/lessons/${lessonId}/words`)
      if (!words || words.length < 4) {
        alert('Нужно минимум 4 слова в уроке')
        return
      }
      const c = buildCards(words, lang)
      setCards(c)
      setFlippedUids([])
      setMatchedCount(0)
      setMoves(0)
      setSeconds(0)
      setFinished(false)
      setRunning(false)
      lockRef.current = true
      // Фаза предпросмотра: все карточки открыты 4 секунды
      setPreview(true)
      setPreviewSec(4)
    } finally {
      setLoading(false)
    }
  }, [lessonId, lang])

  // Обратный отсчёт предпросмотра
  useEffect(() => {
    if (!preview) return
    if (previewSec <= 0) {
      setPreview(false)
      setRunning(true)
      lockRef.current = false
      return
    }
    const t = setTimeout(() => setPreviewSec(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [preview, previewSec])

  // Таймер
  useEffect(() => {
    if (running && !finished) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [running, finished])

  const handleFlip = useCallback((uid) => {
    if (lockRef.current) return
    if (flippedUids.includes(uid)) return

    const next = [...flippedUids, uid]
    setCards(prev => prev.map(c => c.uid === uid ? { ...c, flipped: true } : c))

    if (next.length < 2) {
      setFlippedUids(next)
      return
    }

    // Два открытых — проверяем совпадение
    lockRef.current = true
    setFlippedUids(next)
    setMoves(m => m + 1)

    const [uid1, uid2] = next
    setCards(prev => {
      const c1 = prev.find(c => c.uid === uid1)
      const c2 = prev.find(c => c.uid === uid2)
      if (c1 && c2 && c1.pairId === c2.pairId && c1.side !== c2.side) {
        // Совпадение!
        const updated = prev.map(c =>
          c.uid === uid1 || c.uid === uid2 ? { ...c, matched: true, flipped: false } : c
        )
        const newMatched = matchedCount + 1
        setMatchedCount(newMatched)
        setFlippedUids([])
        lockRef.current = false
        if (newMatched === 8) {
          setFinished(true)
          setRunning(false)
        }
        return updated
      } else {
        // Не совпадение — переворачиваем обратно через 900ms
        setTimeout(() => {
          setCards(p => p.map(c =>
            c.uid === uid1 || c.uid === uid2 ? { ...c, flipped: false } : c
          ))
          setFlippedUids([])
          lockRef.current = false
        }, 900)
        return prev
      }
    })
  }, [flippedUids, matchedCount])

  const lessonName = lessons.find(l => String(l.id) === lessonId)?.title || ''

  if (finished) {
    const rating = moves <= 10 ? '🥇' : moves <= 14 ? '🥈' : moves <= 18 ? '🥉' : '🎮'
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <div style={{ fontSize: 72, marginBottom: 12 }}>{rating}</div>
        <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 26, margin: '0 0 8px', color: 'var(--ink)' }}>
          Все пары найдены!
        </h2>
        <div style={{ fontSize: 15, color: 'var(--ink-soft)', marginBottom: 24 }}>
          <div>Ходов: <strong>{moves}</strong></div>
          <div>Время: <strong>{formatTime(seconds)}</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={startGame} style={btnStyle('accent')}>
            <i className="bi bi-arrow-clockwise" /> Играть снова
          </button>
          <button onClick={() => { setCards([]); setFinished(false); setRunning(false) }} style={btnStyle('ghost')}>
            Сменить урок
          </button>
        </div>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div style={{ padding: '24px 16px', maxWidth: 480, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 22, margin: '0 0 6px', color: 'var(--ink)' }}>
          🃏 Словопара
        </h2>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', margin: '0 0 24px' }}>
          Найди все пары немецких слов и переводов
        </p>

        {/* Правила */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Как играть</strong>
          Переверни карточку — найди её пару.<br />
          <span style={{ fontFamily: 'Georgia,serif', fontWeight: 700 }}>Serif = немецкое</span> · <span style={{ fontStyle: 'italic' }}>Italic = перевод</span><br />
          8 пар · 4×4 сетка
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>Урок</label>
          {lessons.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Нет доступных уроков</p>
          ) : (
            <select value={lessonId} onChange={e => setLessonId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }}>
              {lessons.map(l => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          )}
        </div>

        <button onClick={startGame} disabled={!lessonId || loading} style={btnStyle('accent')}>
          {loading ? 'Загрузка…' : '▶ Начать игру'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px', maxWidth: 500, margin: '0 auto' }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>🃏 Словопара</div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{lessonName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--ink-soft)' }}>
          <span>⏱ {formatTime(seconds)}</span>
          <span>🎯 {matchedCount}/8</span>
          <span>👆 {moves}</span>
          <button onClick={() => { setCards([]); setRunning(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, padding: 4 }}>✕</button>
        </div>
      </div>

      {/* Прогресс-бар */}
      <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${(matchedCount / 8) * 100}%`, transition: 'width .3s' }} />
      </div>

      {/* Баннер предпросмотра */}
      {preview && (
        <div style={{
          textAlign: 'center', marginBottom: 10, padding: '8px 16px',
          background: 'var(--accent)', color: 'var(--accent-ink)',
          borderRadius: 10, fontWeight: 700, fontSize: 14,
        }}>
          Запоминай! Игра начнётся через {previewSec}…
        </div>
      )}

      {/* Сетка 4×4 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {cards.map(card => (
          <Card key={card.uid} card={card} onClick={handleFlip} disabled={lockRef.current} showAll={preview} />
        ))}
      </div>

      {/* Подсказка по шрифтам */}
      <div style={{ marginTop: 14, display: 'flex', gap: 16, justifyContent: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>
        <span style={{ fontFamily: 'Georgia,serif', fontWeight: 700 }}>Serif = 🇩🇪 DE</span>
        <span style={{ fontStyle: 'italic' }}>Italic = перевод</span>
      </div>
    </div>
  )
}

const btnStyle = (v) => ({
  padding: '11px 24px', borderRadius: 12, fontSize: 14, fontWeight: 700,
  border: v === 'ghost' ? '1px solid var(--line)' : 'none',
  background: v === 'accent' ? 'var(--accent)' : 'transparent',
  color: v === 'accent' ? 'var(--accent-ink)' : 'var(--ink)',
  cursor: 'pointer',
})
