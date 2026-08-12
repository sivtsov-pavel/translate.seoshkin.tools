import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { Mic, Puzzle, MessageCircle, Headphones } from 'lucide-react'

// Экран чекпойнта — станции между уроками (идея Павла).
//
// Урок оставляем ядром: слова и их узнавание. Речь, слух и грамматику выносим сюда,
// чтобы урок можно было пройти за один присест, а у вынесенного появилась своя
// галочка и свой смысл. Станция стоит на дороге, поэтому её не пропускают.
const SPEECH_STATIONS = [
  { key: 'phrases',   C: MessageCircle, labelKey: 'lessonSet' },
  { key: 'dictation', C: Headphones,    labelKey: null },
  { key: 'speech',    C: Mic,           labelKey: null },
]

export default function Checkpoint() {
  const { kind, id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18nStore()
  const [data, setData] = useState(null)

  // Для речевой станции нужен один урок, для грамматики — их может быть несколько
  const lessonIds = String(id || '').split(',').filter(Boolean)

  useEffect(() => {
    if (!lessonIds[0]) return
    api.get(`/path/lesson/${lessonIds[0]}`).then(setData).catch(() => setData({ error: true }))
  }, [id])

  if (!data) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.common.loading}</div>

  const steps = data.steps || []
  const byType = (type) => steps.find(s => s.type === type)
  const isSpeech = kind === 'speech'

  const stations = isSpeech
    ? [
        data.phrases?.total ? { key: 'phrases', C: MessageCircle, label: t.phrases.lessonSet, done: data.phrases.done, total: data.phrases.total, go: () => navigate(`/phrases/lesson/${lessonIds[0]}`) } : null,
        byType('dictation') ? { key: 'dictation', C: Headphones, label: t.exercise.dictation, ...byType('dictation'), go: () => navigate(`/exercise-session?lesson_id=${lessonIds[0]}&type=dictation`) } : null,
        byType('speech') ? { key: 'speech', C: Mic, label: t.exercise.speech || 'Произношение', ...byType('speech'), go: () => navigate(`/exercise-session?lesson_id=${lessonIds[0]}&type=speech`) } : null,
      ].filter(Boolean)
    : [
        byType('conjugation') ? { key: 'conjugation', C: Puzzle, label: t.exercise.conjugation, ...byType('conjugation'), go: () => navigate(`/exercise-session?lesson_id=${lessonIds[0]}&type=conjugation`) } : null,
        byType('declension') ? { key: 'declension', C: Puzzle, label: t.exercise.declension || 'Падежи', ...byType('declension'), go: () => navigate(`/exercise-session?lesson_id=${lessonIds[0]}&type=declension`) } : null,
      ].filter(Boolean)

  const title = isSpeech ? t.path.cpSpeech : t.path.cpGrammar
  const color = isSpeech ? '#2F8296' : '#9A5CD8'

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate('/')} style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', fontSize: 17 }}>←</button>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{title}</div>
      </div>

      <div style={{ borderRadius: 26, padding: 24, marginBottom: 20, background: color, color: '#fff' }}>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{isSpeech ? '🎤' : '🧩'} {title}</div>
        <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 8 }}>
          {isSpeech ? t.path.cpSpeechHint : t.path.cpGrammarHint}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stations.length === 0 && (
          <div style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: 20 }}>{t.phrases.empty}</div>
        )}
        {stations.map((st, i) => {
          const done = st.done >= st.total
          return (
            <button key={st.key} onClick={st.go}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 20,
                border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left',
                opacity: done ? 0.75 : 1,
              }}>
              <span style={{
                width: 44, height: 44, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                background: done ? '#2E7D63' : 'var(--surface-2)', color: done ? '#E8F7F0' : 'var(--ink-soft)',
                fontWeight: 800, fontSize: 17,
              }}>{done ? '✓' : i + 1}</span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <st.C size={17} strokeWidth={1.9} /> {st.label}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 2 }}>{st.done} / {st.total}</div>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
