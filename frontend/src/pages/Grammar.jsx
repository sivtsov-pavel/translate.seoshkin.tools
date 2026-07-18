import { useState } from 'react'
import grammarData from '../data/grammarData.json'
import { useI18nStore } from '../store/i18n.js'
import { ex } from '../utils/extraI18n.js'

// Цвета родов как в немецкой школе: der=синий, die=красный, das=зелёный, мн.ч.=серый
const GENDER = [
  { c: '#2f7bd6', label: 'der' },   // Maskulin
  { c: '#d64550', label: 'die' },   // Feminin
  { c: '#3aa856', label: 'das' },   // Neutrum
  { c: '#7a7f87', label: 'die (мн.)' }, // Plural
]

// Похоже ли на таблицу по родам (строки из 3-4 немецких форм)?
function isGenderTable(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false
  const counts = rows.map(r => String(r).trim().split(/\s+/).length)
  return counts.every(n => n === 3 || n === 4) && counts.some(n => n >= 3)
}

// Одна секция грамматики: заголовок + вопрос падежа + школьное объяснение + таблица/чипы
function GrammarSection({ s }) {
  const gender = { m: 0, f: 1, n: 2, pl: 3 }[s.gender]
  const headColor = gender != null ? GENDER[gender].c : 'var(--accent)'
  const table = isGenderTable(s.rows)
  return (
    <div style={{ marginBottom: 12, background: 'var(--surface-2)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line)', borderLeft: `4px solid ${headColor}` }}>
      {s.heading && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: headColor }}>{s.heading}</span>
          {s.question_de && (
            <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{s.question_de}</span>
          )}
        </div>
      )}
      {s.explain_ru && (
        <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55, margin: '0 0 10px' }}>{s.explain_ru}</p>
      )}
      {table ? (
        <div style={{ overflowX: 'auto' }}>
          {/* Шапка родов */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            {GENDER.map((g, i) => (
              <div key={i} style={{ flex: 1, minWidth: 56, fontSize: 11, fontWeight: 700, color: g.c, textAlign: 'center' }}>{g.label}</div>
            ))}
          </div>
          {s.rows.map((r, k) => {
            const cells = String(r).trim().split(/\s+/)
            return (
              <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                {cells.map((cell, i) => (
                  <div key={i} dir="ltr" style={{ flex: 1, minWidth: 56, textAlign: 'center', fontFamily: 'Georgia,serif', fontWeight: 700, fontSize: 15, color: GENDER[i]?.c || 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 4px' }}>
                    {cell === '_' || cell === '—' ? '—' : cell}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : (
        Array.isArray(s.rows) && s.rows.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {s.rows.map((r, k) => (
              <span key={k} dir="ltr" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 11px', fontSize: 15, fontFamily: 'Georgia,serif', fontWeight: 600 }}>{r}</span>
            ))}
          </div>
        )
      )}
      {s.note_ru && <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic', marginTop: 8 }}>{s.note_ru}</div>}
    </div>
  )
}

// 📐 Грамматика — справочник-шпаргалка (падежи, предлоги, глаголы, Konjunktiv).
// Только просмотр: фото-таблицы из класса + правила текстом. Без флеш-карт и кредитов.
export default function Grammar() {
  const [zoom, setZoom] = useState(null)   // url фото для полноэкранного просмотра
  const [open, setOpen] = useState(0)      // индекс раскрытой карточки
  const E = ex(useI18nStore(s => s.lang))

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 40px' }}>
      <h1 style={{ fontSize: 22, margin: '4px 0 6px' }}>📐 {E.grammarTitle}</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 14 }}>
        {E.grammarSub}
      </p>

      {/* Ссылка на интерактивные шпаргалки (глаголы + местоимения) */}
      <a href="/cheatsheet" style={{
        display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', marginBottom: 20,
        padding: '14px 16px', borderRadius: 16, border: '1px solid var(--accent)',
        background: 'linear-gradient(135deg, rgba(201,165,74,0.14), rgba(124,92,255,0.10))', color: 'var(--ink)',
      }}>
        <span style={{ fontSize: 26 }}>🔖</span>
        <span style={{ flex: 1 }}>
          <span style={{ fontWeight: 800, display: 'block' }}>Шпаргалки</span>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Неправильные глаголы (3 формы) и местоимения — с озвучкой и тренажёром</span>
        </span>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>→</span>
      </a>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {grammarData.map((c, i) => {
          const expanded = open === i
          return (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)' }}>
              {/* Шапка карточки */}
              <button onClick={() => setOpen(expanded ? -1 : i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)' }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{c.emoji || '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{c.title}</div>
                  {c.topic_de && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.topic_de}</div>}
                </div>
                <span style={{ fontSize: 18, color: 'var(--ink-soft)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
              </button>

              {expanded && (
                <div style={{ padding: '0 16px 16px' }}>
                  {/* Чистое описание (главное) */}
                  {c.summary_ru && (
                    <p style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 16px' }}>{c.summary_ru}</p>
                  )}
                  {/* Секции — цветные таблицы (рода) + школьные объяснения падежей */}
                  {(c.sections || []).map((s, j) => <GrammarSection key={j} s={s} />)}
                  {/* Оригинал-плакат (фото из класса) — вторично, по кнопке */}
                  {c.image && (
                    <button onClick={() => setZoom(c.image)}
                      style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 12px', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 13 }}>
                      📷 Показать оригинал плаката
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Полноэкранный просмотр фото */}
      {zoom && (
        <div onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, cursor: 'zoom-out' }}>
          <img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
