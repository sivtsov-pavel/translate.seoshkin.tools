import { useNavigate } from 'react-router-dom'
import loveData from '../data/loveKids.json'
import { SpeakButton, speak } from '../hooks/useSpeech.jsx'
import { useI18nStore } from '../store/i18n.js'
import { ex } from '../utils/extraI18n.js'

// ❤️ Любовь к детям — тёплые немецкие фразы для общения родителя с ребёнком.
// Комплименты, ласка, забота, спокойной ночи, похвала. С прослушкой и переводом.
export default function LoveKids() {
  const navigate = useNavigate()
  const E = ex(useI18nStore(s => s.lang))
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 48px' }}>
      <div style={{ textAlign: 'center', padding: '12px 0 18px' }}>
        <div style={{ fontSize: 40 }}>❤️</div>
        <h1 style={{ fontSize: 24, margin: '4px 0 6px' }}>{E.loveTitle}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: 0 }}>
          {E.loveSub}
        </p>
      </div>

      {/* Поговорить с тренером на эту тему */}
      <button onClick={() => navigate('/ai-trainer?scenario=family_love&character=pablo')}
        style={{ width: '100%', marginBottom: 22, padding: '13px 16px', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #e0576f, #c9455e)', color: '#fff', fontWeight: 700, fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        🗣️ Потренироваться с Pablo на эту тему
      </button>

      {loveData.map(cat => (
        <section key={cat.key} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{cat.emoji}</span>{cat.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(cat.phrases || []).map((p, i) => (
              <div key={i} onClick={() => speak(p.de, 'de-DE')}
                style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: '4px solid #e0576f',
                  borderRadius: 12, padding: '11px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span dir="ltr" style={{ flex: 1, fontSize: 16, fontWeight: 600, fontFamily: 'Georgia,serif', color: 'var(--ink)' }}>{p.de}</span>
                  <SpeakButton text={p.de} size={18} />
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 3 }}>{p.ru}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginTop: 10 }}>
        Сделано с любовью 💛 Говори детям тёплые слова каждый день.
      </p>
    </div>
  )
}
