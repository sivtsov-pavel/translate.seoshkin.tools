import { useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { SpeakButton } from '../hooks/useSpeech.jsx'

// Оборачивает немецкий текст: каждое слово кликабельно → перевод на локаль ученика
// (из словаря, а нет — GPT-перевод) + возможность сохранить новое слово в разговорник.
export default function TapText({ children, style }) {
  const { lang } = useI18nStore()
  const [popup, setPopup] = useState(null) // { word, translation, inDict, loading, saved }

  const tap = async (token) => {
    const clean = token.replace(/[.,!?;:"«»„“()\[\]…]/g, '').trim()
    if (!clean) return
    setPopup({ word: clean, loading: true })
    try {
      const r = await api.get(`/words/tap?q=${encodeURIComponent(clean)}&lang=${lang}`)
      setPopup({ word: r?.word || clean, translation: r?.translation, inDict: !!r?.inDict, loading: false })
    } catch { setPopup(null) }
  }

  const save = async () => {
    try {
      await api.post('/phrasebook', { de: popup.word, ru: popup.translation || '', source: 'reader' })
      setPopup(p => ({ ...p, saved: true }))
    } catch {}
  }

  const text = String(children ?? '')
  const tokens = text.split(/(\s+)/)

  return (
    <>
      <span style={style} dir="ltr">
        {tokens.map((tk, i) => /\S/.test(tk)
          ? <span key={i} onClick={() => tap(tk)} style={{ cursor: 'pointer', borderBottom: '1px dotted var(--accent)' }}>{tk}</span>
          : tk)}
      </span>

      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.35)' }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed', left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)',
            maxWidth: 440, margin: '0 auto', background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,.25)', padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, flex: 1 }} dir="ltr">{popup.word}</span>
              <SpeakButton text={popup.word} size={22} />
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
            </div>
            {popup.loading ? (
              <div style={{ color: 'var(--ink-soft)' }}>Перевожу…</div>
            ) : (
              <>
                <div style={{ fontSize: 17, color: 'var(--ink)' }}>{popup.translation || '—'}</div>
                {popup.inDict ? (
                  <div style={{ fontSize: 12, color: 'var(--good, #16a34a)', marginTop: 8 }}>✓ В твоём словаре</div>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Нового слова нет в словаре</span>
                    <button onClick={save} disabled={popup.saved} style={{
                      marginLeft: 'auto', padding: '7px 14px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 13,
                      background: popup.saved ? 'var(--good-soft, rgba(34,197,94,.12))' : 'var(--accent)',
                      color: popup.saved ? 'var(--good, #16a34a)' : 'var(--accent-ink)', cursor: popup.saved ? 'default' : 'pointer',
                    }}>{popup.saved ? '✓ Сохранено' : '＋ В разговорник'}</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
