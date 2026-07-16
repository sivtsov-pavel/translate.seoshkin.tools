import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getTranslation } from '../utils/translation.js'

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

// Создать карточки из пар слов. mode:
//  'translation' — немецкое слово ↔ перевод; 'image' — немецкое слово ↔ картинка.
function buildCards(words, lang, mode) {
  const pool = mode === 'image' ? words.filter(w => w.image_url) : words
  const pairs = shuffle(pool).slice(0, 8)
  const cards = []
  pairs.forEach((w, i) => {
    cards.push({ uid: `de-${i}`, pairId: i, side: 'de', text: w.word_de, matched: false, flipped: false })
    if (mode === 'image') {
      cards.push({ uid: `img-${i}`, pairId: i, side: 'img', image: w.image_url, text: w.word_de, matched: false, flipped: false })
    } else {
      // Перевод на язык локали пользователя (для ru — русский из translation_ru), НЕ английский
      const target = getTranslation(w.translations, lang, w.translation_ru) || w.translation_ru
      cards.push({ uid: `tr-${i}`, pairId: i, side: 'tr', text: target, matched: false, flipped: false })
    }
  })
  return { cards: shuffle(cards), pairCount: pairs.length }
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
        position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden',
        border: `2px solid ${card.matched ? 'var(--good, #22c55e)' : 'var(--accent)'}`,
        background: card.matched
          ? 'var(--good-soft, rgba(34,197,94,.12))'
          : isDE
            ? 'var(--surface)'
            : 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: card.side === 'img' ? 0 : '6px 10px', textAlign: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity .25s',
        pointerEvents: 'none',
      }}>
        {card.side === 'img' ? (
          <img src={card.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
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
        )}
      </div>
    </div>
  )
}

export default function WordMatch() {
  const { t, lang } = useI18nStore()
  const [lessons, setLessons] = useState([])
  const [lessonId, setLessonId] = useState('')
  const [mode, setMode] = useState('translation') // 'translation' | 'image'
  const [pairCount, setPairCount] = useState(8)
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
      const usable = mode === 'image' ? (words || []).filter(w => w.image_url) : (words || [])
      if (usable.length < 4) {
        alert(mode === 'image' ? t.games.need4img : t.games.need4)
        return
      }
      const { cards: c, pairCount: pc } = buildCards(words, lang, mode)
      setCards(c)
      setPairCount(pc)
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
  }, [lessonId, lang, mode])

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
        if (newMatched === pairCount) {
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
  }, [flippedUids, matchedCount, pairCount])

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
          <div>{t.games.moves}: <strong>{moves}</strong></div>
          <div>{t.games.time}: <strong>{formatTime(seconds)}</strong></div>
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
          Найди все пары: немецкое слово и его {mode === 'image' ? t.games.picture : t.games.translation}
        </p>

        {/* Тумблер режима: перевод / картинки */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>{t.games.mode}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['translation', t.games.modeWordTr], ['image', t.games.modeWordImg]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 14, fontWeight: mode === m ? 700 : 500,
                border: `1.5px solid ${mode === m ? 'var(--accent)' : 'var(--line)'}`,
                background: mode === m ? 'var(--accent)' : 'var(--surface-2)',
                color: mode === m ? 'var(--accent-ink)' : 'var(--ink)', cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Правила */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 6 }}>{t.games.howToPlay}</strong>
          Переверни карточку — найди её пару.<br />
          {mode === 'image'
            ? <><span style={{ fontFamily: 'Georgia,serif', fontWeight: 700 }}>Serif = немецкое слово</span> · 🖼️ картинка</>
            : <><span style={{ fontFamily: 'Georgia,serif', fontWeight: 700 }}>Serif = немецкое</span> · <span style={{ fontStyle: 'italic' }}>Italic = перевод</span></>}
          <br />до 8 пар · сетка
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'block', marginBottom: 6 }}>{t.games.lesson}</label>
          {lessons.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t.games.noLessons}</p>
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
          {loading ? t.games.loading : t.games.startGame}
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
          <span>🎯 {matchedCount}/{pairCount}</span>
          <span>👆 {moves}</span>
          <button onClick={() => { setCards([]); setRunning(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 18, padding: 4 }}>✕</button>
        </div>
      </div>

      {/* Прогресс-бар */}
      <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${(matchedCount / pairCount) * 100}%`, transition: 'width .3s' }} />
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
        <span>{mode === 'image' ? '🖼️ картинка' : <span style={{ fontStyle: 'italic' }}>Italic = перевод</span>}</span>
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
