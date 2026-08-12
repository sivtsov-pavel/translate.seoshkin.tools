import { useState, useEffect } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { speak } from '../hooks/useSpeech.jsx'
import { useSpeechRecognition, isSpeechRecognitionSupported } from '../hooks/useSpeechRecognition.jsx'
import { speechSimilarity } from '../utils/speechMatch.js'
import { playCorrect, playWrong } from '../utils/sound.js'

// Тренажёр фразы в три шага: 🎧 слушаю (понять на слух) → 🧩 собираю (порядок слов)
// → 🎤 говорю (произношение).
//
// Шаг «говорю» необязателен: Web Speech API отсутствует в Safari/iOS (включая PWA),
// поэтому там он просто не показывается, а фраза засчитывается по двум первым шагам.

// Три варианта перевода: верный плюс два соседних из этого же набора
export function buildOptions(phrases, index) {
  const correct = phrases[index]?.translation || ''
  const picked = []
  for (const p of phrases) {
    if (picked.length >= 2) break
    const t = p.translation
    if (t && t !== correct && !picked.includes(t)) picked.push(t)
  }
  const opts = [correct, ...picked]
  // Перемешиваем детерминированно по индексу фразы, чтобы верный не всегда был первым
  return opts.sort((a, b) => ((a.length + index) % 3) - ((b.length + index) % 3))
}

export function shuffleWords(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  return [...words].sort((a, b) => (a.charCodeAt(0) % 7) - (b.charCodeAt(0) % 7))
}

export function checkBuilt(picked, text) {
  return picked.join(' ').trim() === String(text || '').trim()
}

export default function PhraseTrainer({ phrases, onExit }) {
  const { t } = useI18nStore()
  const [i, setI] = useState(0)
  const [step, setStep] = useState('listen')
  const [pool, setPool] = useState([])
  const [picked, setPicked] = useState([])
  const [wrong, setWrong] = useState(false)
  const [heard, setHeard] = useState('')

  const phrase = phrases[i]
  const micAvailable = isSpeechRecognitionSupported()

  const mark = (name) => { api.post(`/phrases/${phrase.id}/step`, { step: name }).catch(() => {}) }

  const next = () => {
    if (i + 1 < phrases.length) setI(i + 1)
    else onExit()
  }

  const { listening, start } = useSpeechRecognition({
    lang: 'de-DE',
    onResult: (transcript) => {
      setHeard(transcript)
      // Порог 0.55 — тот же, что в SpeechExercise считается «почти верно».
      // Это тренажёр, а не экзамен: придираться к акценту здесь незачем.
      if (speechSimilarity(transcript, phrase.text) >= 0.55) {
        playCorrect(); mark('speak'); next()
      } else {
        playWrong(); setWrong(true)
      }
    },
  })

  useEffect(() => {
    setStep('listen'); setPicked([]); setWrong(false); setHeard('')
    setPool(shuffleWords(phrases[i]?.text || ''))
    if (phrases[i]) speak(phrases[i].text)
  }, [i])

  const answerListen = (opt) => {
    if (opt === phrase.translation) { playCorrect(); setWrong(false); mark('listen'); setStep('build') }
    else { playWrong(); setWrong(true) }
  }

  const tapWord = (w, idx) => {
    const nextPicked = [...picked, w]
    setPicked(nextPicked)
    setPool(pool.filter((_, k) => k !== idx))
    if (nextPicked.length !== shuffleWords(phrase.text).length) return

    if (checkBuilt(nextPicked, phrase.text)) {
      playCorrect(); setWrong(false); mark('build')
      if (micAvailable) setStep('speak')
      else next()
    } else {
      playWrong(); setWrong(true)
      setPicked([]); setPool(shuffleWords(phrase.text))
    }
  }

  if (!phrase) return null

  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13, color: 'var(--ink-soft)' }}>
        <span>{i + 1} {t.phrases.of} {phrases.length}</span>
        <button onClick={onExit} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)' }}>✕</button>
      </div>

      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', marginBottom: 20 }}>
        <div style={{ height: '100%', width: `${((i) / phrases.length) * 100}%`, borderRadius: 3, background: 'var(--accent)', transition: 'width .3s' }} />
      </div>

      {step === 'listen' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🎧 {t.phrases.listenTask}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => speak(phrase.text)} style={btn}>🔊 {t.phrases.repeat}</button>
            {/* сигнатура speak(text, lang, rate) — скорость третьим параметром */}
            <button onClick={() => speak(phrase.text, undefined, 0.6)} style={btn}>🐢 {t.phrases.slower}</button>
          </div>
          {buildOptions(phrases, i).map(opt => (
            <button key={opt} onClick={() => answerListen(opt)}
              style={{ ...btn, width: '100%', marginBottom: 10, textAlign: 'left' }}>{opt}</button>
          ))}
        </div>
      )}

      {step === 'build' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🧩 {t.phrases.buildTask}</div>
          <div style={{ minHeight: 56, padding: 12, border: '2px dashed var(--line)', borderRadius: 12, marginBottom: 14, fontSize: 17 }}>
            {picked.join(' ')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pool.map((w, idx) => (
              <button key={`${w}-${idx}`} onClick={() => tapWord(w, idx)} style={btn}>{w}</button>
            ))}
          </div>
        </div>
      )}

      {step === 'speak' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>🎤 {t.phrases.speakTask}</div>
          <div style={{ fontSize: 20, marginBottom: 8 }}>{phrase.text}</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 16 }}>{phrase.translation}</div>
          <button onClick={start} style={{ ...btn, width: '100%', marginBottom: 10, background: listening ? 'var(--accent)' : 'var(--surface)' }}>
            {listening ? '🎙 …' : `🎤 ${t.phrases.speakTask}`}
          </button>
          {heard && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>{heard}</div>}
          <button onClick={() => { mark('speak'); next() }} style={{ ...btn, width: '100%' }}>
            {t.phrases.skip}
          </button>
        </div>
      )}

      {wrong && <div style={{ marginTop: 14, color: 'var(--red)', fontSize: 14 }}>✗</div>}
    </div>
  )
}

const btn = {
  padding: '11px 16px', borderRadius: 12, border: '1px solid var(--line)',
  background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', fontWeight: 600, fontSize: 15,
}
