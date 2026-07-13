import { useState } from 'react'
import grammarData from '../data/grammarData.json'

// 📐 Грамматика — справочник-шпаргалка (падежи, предлоги, глаголы, Konjunktiv).
// Только просмотр: фото-таблицы из класса + правила текстом. Без флеш-карт и кредитов.
export default function Grammar() {
  const [zoom, setZoom] = useState(null)   // url фото для полноэкранного просмотра
  const [open, setOpen] = useState(0)      // индекс раскрытой карточки

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px 40px' }}>
      <h1 style={{ fontSize: 22, margin: '4px 0 6px' }}>📐 Грамматика</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 20 }}>
        Справочник-шпаргалка: падежи, предлоги, глаголы. Отдельно от словарных уроков — смотри и повторяй.
      </p>

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
                  {/* Секции — аккуратные таблицы (главное содержимое, вместо «дикого» фото) */}
                  {(c.sections || []).map((s, j) => (
                    <div key={j} style={{ marginBottom: 12, background: 'var(--surface-2)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--line)' }}>
                      {s.heading && (
                        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--accent)', marginBottom: 8 }}>{s.heading}</div>
                      )}
                      {Array.isArray(s.rows) && s.rows.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: s.note_ru ? 8 : 0 }}>
                          {s.rows.map((r, k) => (
                            <span key={k} dir="ltr" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 11px', fontSize: 15, fontFamily: 'Georgia,serif', fontWeight: 600 }}>{r}</span>
                          ))}
                        </div>
                      )}
                      {s.note_ru && (
                        <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>{s.note_ru}</div>
                      )}
                    </div>
                  ))}
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
