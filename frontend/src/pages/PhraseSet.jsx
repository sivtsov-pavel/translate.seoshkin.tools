import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { speak, speakAppend, isSpeakTranslationEnabled, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'
import PhraseTrainer from '../components/PhraseTrainer.jsx'

// Экран набора фраз: тема, картинка, нумерованный список с эмодзи, озвучка.
// Перевод виден всегда, но мельче и приглушённо — так он не перетягивает взгляд,
// а понять смысл можно сразу. Озвучивать ли перевод, решает общий тумблер
// «перевод вкл/выкл» — тот же, что у слов в уроках.
// «Слушать всё» проигрывает набор подряд: можно слушать в кармане, не глядя в экран.
export default function PhraseSet() {
  const { id, lessonId } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const [data, setData] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [training, setTraining] = useState(false)
  const stopRef = useRef(false)

  const load = async () => {
    const url = lessonId ? `/lessons/${lessonId}/phrases` : `/phrase-topics/${id}`
    try { setData(await api.get(`${url}?lang=${lang}`)) } catch { setData({ error: true }) }
  }
  useEffect(() => { load() }, [id, lessonId, lang])

  // Останавливаем проигрывание при уходе со страницы — иначе голос догоняет в другом разделе
  useEffect(() => () => { stopRef.current = true }, [])

  const playAll = async () => {
    if (playing) { stopRef.current = true; setPlaying(false); return }
    setPlaying(true); stopRef.current = false
    for (const p of data.phrases) {
      if (stopRef.current) break
      speak(p.text)
      if (isSpeakTranslationEnabled() && p.translation) speakAppend(p.translation)
      await new Promise(r => setTimeout(r, Math.max(1800, p.text.length * 90)))
    }
    setPlaying(false)
  }

  if (!data) return <div style={{ padding: 20, color: 'var(--ink-soft)' }}>{t.common.loading}</div>
  if (data.error || !data.phrases?.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-soft)' }}>
        {t.phrases.empty}
        <div><button onClick={() => navigate('/sets')} style={{ ...btn, marginTop: 16 }}>← {t.sets.title}</button></div>
      </div>
    )
  }
  if (training) return <PhraseTrainer phrases={data.phrases} onExit={() => { setTraining(false); load() }} />

  const { topic, phrases, stats } = data
  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>
          {topic.emoji} {String(topic.title || '').toUpperCase()}
        </div>
        {topic.title_local && (
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 2 }}>{topic.title_local}</div>
        )}
        <div style={{ display: 'inline-block', marginTop: 8, padding: '3px 14px', borderRadius: 12,
          background: 'var(--surface-2)', fontSize: 13, fontWeight: 700 }}>{topic.level}</div>
      </div>

      {topic.image_url && (
        <img src={topic.image_url} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 14 }} />
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <button onClick={playAll} style={btn}>{playing ? `⏹ ${t.phrases.stop}` : `🎧 ${t.phrases.listen}`}</button>
        <SpeakTranslationToggle />
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {phrases.map((p, i) => (
          <li key={p.id} onClick={() => {
            speak(p.text)
            if (isSpeakTranslationEnabled() && p.translation) speakAppend(p.translation)
          }}
            style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 4px',
              borderBottom: '1px solid var(--line)', cursor: 'pointer' }}>
            <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'var(--surface-2)',
              display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ fontSize: 20 }}>{p.emoji}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: 16 }}>{p.text}</div>
              {p.translation && <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{p.translation}</div>}
            </span>
            {p.progress.listen && p.progress.build && <span style={{ color: 'var(--good)' }}>✓</span>}
          </li>
        ))}
      </ol>

      <button onClick={() => setTraining(true)}
        style={{ ...btn, width: '100%', marginTop: 20, padding: 15, fontSize: 16,
          background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>
        {t.phrases.train} · {stats.done} {t.phrases.of} {stats.total}
      </button>
    </div>
  )
}

const btn = {
  flex: 1, padding: '11px 12px', borderRadius: 12, border: '1px solid var(--line)',
  background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 700, fontSize: 14,
}
