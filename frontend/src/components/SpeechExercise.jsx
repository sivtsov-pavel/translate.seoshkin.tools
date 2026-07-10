import { useState, useEffect, useCallback } from 'react'
import { speak } from '../hooks/useSpeech.jsx'
import { useSpeechRecognition, speechSimilarity, isSpeechRecognitionSupported } from '../hooks/useSpeechRecognition.jsx'
import { useI18nStore } from '../store/i18n.js'
import { getTranslation } from '../utils/translation.js'
import WordImage from './WordImage.jsx'
import { ExerciseActions } from './ExerciseActions.jsx'

// ── Немецкая фонетика ──────────────────────────────────────────────
// Комбинации букв — в порядке от длинных к коротким (иначе «sch» перехватит «ch»)
const PHONETIC_RULES = [
  { re: /tsch/gi,            hint: 'tsch = «ч»',    mark: 'tsch' },
  { re: /sch/gi,             hint: 'sch = «ш»',     mark: 'sch'  },
  { re: /ch(?=[aouäöür])/gi, hint: 'ch = «х»',      mark: 'ch'   },
  { re: /ch/gi,              hint: 'ch = «хь»',     mark: 'ch'   },
  { re: /qu/gi,              hint: 'qu = «кв»',     mark: 'qu'   },
  { re: /äu/gi,              hint: 'äu = «ой»',     mark: 'äu'   },
  { re: /eu/gi,              hint: 'eu = «ой»',     mark: 'eu'   },
  { re: /ei/gi,              hint: 'ei = «ай»',     mark: 'ei'   },
  { re: /ie/gi,              hint: 'ie = «и:»',     mark: 'ie'   },
  { re: /^sp/gi,             hint: 'sp- = «шп»',    mark: 'sp'   },
  { re: /^st/gi,             hint: 'st- = «шт»',    mark: 'st'   },
  { re: /ng(?!k)/gi,         hint: 'ng = «нг»',     mark: 'ng'   },
  { re: /nk/gi,              hint: 'nk = «нк»',     mark: 'nk'   },
  { re: /pf/gi,              hint: 'pf = «пф»',     mark: 'pf'   },
  { re: /ß/gi,               hint: 'ß = «сс»',      mark: 'ß'    },
  { re: /ä/gi,               hint: 'ä = «э»',       mark: 'ä'    },
  { re: /ö/gi,               hint: 'ö = «ö»',       mark: 'ö'    },
  { re: /ü/gi,               hint: 'ü = «ю»',       mark: 'ü'    },
  { re: /w(?!h)/gi,          hint: 'w = «в»',       mark: 'w'    },
  { re: /v/gi,               hint: 'v = «ф»',       mark: 'v'    },
  { re: /z(?!sch)/gi,        hint: 'z = «ц»',       mark: 'z'    },
  { re: /j/gi,               hint: 'j = «й»',       mark: 'j'    },
]

// Транслитерация немецкого → русская фонетика (кириллица)
function germanPhonetic(text) {
  return text.split(/(\s+|[-–,!?.])/u).map(tok => {
    if (/^[\s\-–,!?.]$/.test(tok)) return tok
    const w = tok.toLowerCase()
    let out = ''
    let i = 0
    while (i < w.length) {
      const s = w.slice(i)
      const prev = w[i - 1] || ''
      const next = w[i + 1] || ''
      const prevV = 'aeiouäöü'.includes(prev)
      const nextV = 'aeiouäöü'.includes(next)
      const wordStart = i === 0
      if      (s.startsWith('tsch'))            { out += 'ч';  i += 4 }
      else if (s.startsWith('sch'))             { out += 'ш';  i += 3 }
      else if (s.startsWith('ch'))              { out += 'х';  i += 2 }
      else if (s.startsWith('qu'))              { out += 'кв'; i += 2 }
      else if (s.startsWith('äu'))              { out += 'ой'; i += 2 }
      else if (s.startsWith('eu'))              { out += 'ой'; i += 2 }
      else if (s.startsWith('ei'))              { out += 'ай'; i += 2 }
      else if (s.startsWith('ie'))              { out += 'и';  i += 2 }
      else if (s.startsWith('au'))              { out += 'ау'; i += 2 }
      else if (wordStart && s.startsWith('sp')) { out += 'шп'; i += 2 }
      else if (wordStart && s.startsWith('st')) { out += 'шт'; i += 2 }
      else if (s.startsWith('ng'))              { out += 'нг'; i += 2 }
      else if (s.startsWith('nk'))              { out += 'нк'; i += 2 }
      else if (s.startsWith('pf'))              { out += 'пф'; i += 2 }
      else if (s.startsWith('ph'))              { out += 'ф';  i += 2 }
      else if (s.startsWith('th'))              { out += 'т';  i += 2 }
      else {
        const c = w[i]
        switch (c) {
          case 'a': out += 'а'; break
          case 'b': out += 'б'; break
          case 'c': out += (next === 'e' || next === 'i') ? 'ц' : 'к'; break
          case 'd': out += 'д'; break
          case 'e': out += 'е'; break
          case 'f': out += 'ф'; break
          case 'g': out += 'г'; break
          case 'h': out += prevV ? '' : 'х'; break // немое после гласной
          case 'i': out += 'и'; break
          case 'j': out += 'й'; break
          case 'k': out += 'к'; break
          case 'l': out += 'л'; break
          case 'm': out += 'м'; break
          case 'n': out += 'н'; break
          case 'o': out += 'о'; break
          case 'p': out += 'п'; break
          case 'r': out += 'р'; break
          case 's': out += (prevV && nextV) ? 'з' : 'с'; break
          case 't': out += 'т'; break
          case 'u': out += 'у'; break
          case 'v': out += 'ф'; break
          case 'w': out += 'в'; break
          case 'x': out += 'кс'; break
          case 'y': out += 'й'; break
          case 'z': out += 'ц'; break
          case 'ä': out += 'э'; break
          case 'ö': out += 'ё'; break
          case 'ü': out += 'ю'; break
          case 'ß': out += 'сс'; break
          default:  out += c; break
        }
        i++
      }
    }
    return out.charAt(0).toUpperCase() + out.slice(1)
  }).join('')
}

// Собираем список подсказок для конкретного слова (без дублей)
function getPhoneticHints(word) {
  const w = word.toLowerCase()
  const seen = new Set()
  const hints = []
  for (const rule of PHONETIC_RULES) {
    rule.re.lastIndex = 0
    if (rule.re.test(w) && !seen.has(rule.hint)) {
      seen.add(rule.hint)
      hints.push(rule.hint)
    }
  }
  return hints
}

// Рендерим слово с подсветкой особых комбинаций
function HighlightedWord({ word }) {
  // Собираем позиции всех совпадений чтобы раскрасить их
  const lower = word.toLowerCase()
  // Помечаем каждый символ: highlighted или нет
  const highlighted = new Array(word.length).fill(false)

  for (const rule of PHONETIC_RULES) {
    rule.re.lastIndex = 0
    let m
    while ((m = rule.re.exec(lower)) !== null) {
      for (let i = m.index; i < m.index + m[0].length; i++) highlighted[i] = true
    }
  }

  // Группируем в spans
  const spans = []
  let i = 0
  while (i < word.length) {
    if (highlighted[i]) {
      let j = i
      while (j < word.length && highlighted[j]) j++
      spans.push(
        <span key={i} style={{ color: 'var(--accent)', borderBottom: '2px solid var(--accent)' }}>
          {word.slice(i, j)}
        </span>
      )
      i = j
    } else {
      let j = i
      while (j < word.length && !highlighted[j]) j++
      spans.push(<span key={i}>{word.slice(i, j)}</span>)
      i = j
    }
  }
  return <>{spans}</>
}

// ── Ударение: простая эвристика ────────────────────────────────────
// Безударные префиксы немецких глаголов
const UNSTRESSED_PREFIXES = ['be', 'ge', 'er', 'ver', 'ent', 'zer', 'miss', 'emp']

function splitSyllables(word) {
  // Упрощённое разбиение на слоги: гласный + следующие согласные
  const vowelRe = /[aeiouyäöü]/gi
  const positions = []
  let m
  while ((m = vowelRe.exec(word.toLowerCase())) !== null) positions.push(m.index)
  if (positions.length <= 1) return [{ text: word, stressed: true }]

  // Делим между гласными приблизительно
  const cuts = [0]
  for (let i = 1; i < positions.length; i++) {
    const between = positions[i] - positions[i - 1]
    const cut = between > 2
      ? positions[i - 1] + 1 + Math.floor((between - 1) / 2)
      : positions[i - 1] + 1
    cuts.push(cut)
  }
  cuts.push(word.length)

  const syllables = cuts.slice(0, -1).map((start, idx) => ({
    text: word.slice(start, cuts[idx + 1]),
    stressed: false,
  }))

  // Первый слог ударный, если нет безударного префикса
  const lw = word.toLowerCase()
  const hasPrefix = UNSTRESSED_PREFIXES.some(p => lw.startsWith(p))
  const stressIdx = hasPrefix ? 1 : 0
  if (syllables[stressIdx]) syllables[stressIdx].stressed = true

  return syllables
}

function StressedWord({ word }) {
  // Убираем артикль если есть («der Hund» → показываем всё, ударение только на Hund)
  const parts = word.split(/\s+/)
  const articles = new Set(['der', 'die', 'das', 'ein', 'eine', 'eines', 'einem', 'einen'])
  return (
    <>
      {parts.map((part, pi) => {
        if (articles.has(part.toLowerCase())) {
          return <span key={pi} style={{ fontWeight: 400, opacity: 0.6 }}>{part}{pi < parts.length - 1 ? ' ' : ''}</span>
        }
        const syls = splitSyllables(part)
        return (
          <span key={pi}>
            {syls.map((s, si) => (
              <span key={si} style={s.stressed ? { textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationThickness: 2 } : {}}>
                {s.text}
              </span>
            ))}
            {pi < parts.length - 1 ? ' ' : ''}
          </span>
        )
      })}
    </>
  )
}

// ── Оценка ─────────────────────────────────────────────────────────
function scoreResult(sim) {
  if (sim >= 0.90) return { quality: 5, label: '🎉 Превосходно!', color: 'var(--good)' }
  if (sim >= 0.75) return { quality: 4, label: '✓ Хорошо!',       color: 'var(--good)' }
  if (sim >= 0.55) return { quality: 3, label: '≈ Почти!',         color: 'var(--accent)' }
  return { quality: 1, label: '✗ Попробуй ещё',                    color: 'var(--red)' }
}

// ── Главный компонент ───────────────────────────────────────────────
export default function SpeechExercise({ payload, onAnswer, lessonTitle, imageUrl, translations, translationRu, exerciseId }) {
  const { word_de, translation_ru } = payload
  const { t, lang } = useI18nStore()

  const [phase, setPhase] = useState('ready')
  const [result, setResult] = useState(null)

  const russianPhonetic = germanPhonetic(word_de)

  const displayTranslation = lang === 'de'
    ? word_de
    : getTranslation(translations, lang, translationRu || translation_ru)

  const hints = getPhoneticHints(word_de)

  useEffect(() => {
    setTimeout(() => speak(word_de, 'de-DE', 0.75), 400)
  }, [word_de])

  const handleResult = useCallback((transcript) => {
    const sim = speechSimilarity(transcript, word_de)
    const { quality, label, color } = scoreResult(sim)
    setResult({ transcript, sim, quality, label, color })
    setPhase('result')
  }, [word_de])

  const { start, listening, isSupported, error } = useSpeechRecognition({
    lang: 'de-DE',
    onResult: handleResult,
  })

  useEffect(() => {
    if (listening) setPhase('listening')
    else if (phase === 'listening' && !result) setPhase('ready')
  }, [listening])

  const handleMic = () => {
    if (phase === 'result') {
      setResult(null); setPhase('ready')
      return
    }
    start()
  }

  if (!isSupported) {
    return (
      <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
        <WordImage imageUrl={imageUrl} wordDe={word_de} bleed />
        <div className="exercise-card-content" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px' }}>🎤</p>
          <p style={{ color: 'var(--ink)', fontSize: 15 }}>Распознавание речи не поддерживается.</p>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Используйте Google Chrome на Android или ПК.</p>
          <button onClick={() => onAnswer(3)}
            style={{ marginTop: 16, padding: '12px 28px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            {t.exercise.next}
          </button>
        </div>
      </div>
    )
  }

  const micBg = {
    ready:     'var(--surface-2)',
    listening: 'var(--red)',
    result:    result ? result.color : 'var(--surface-2)',
  }[phase]

  const micLabel = listening ? '⏺' : phase === 'result' && result?.quality >= 3 ? '✓' : '🎤'

  return (
    <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, background: 'var(--surface)' }}>
      <WordImage imageUrl={imageUrl} wordDe={word_de} bleed />

      <div className="exercise-card-content" style={{ padding: '20px 20px 24px' }}>
        {lessonTitle && (
          <div style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 10, fontWeight: 500 }}>
            📚 {lessonTitle}
          </div>
        )}

        {/* ── Немецкое слово с подсветкой и ударением ── */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '16px 18px', marginBottom: 14 }}>
          {/* Само слово */}
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: 'Georgia,serif', fontSize: 38, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
              <HighlightedWord word={word_de} />
            </span>
          </div>

          {/* Ударение — подчёркнутый слог */}
          <div style={{ textAlign: 'center', fontSize: 22, color: 'var(--ink-soft)', marginBottom: 10, fontFamily: 'Georgia,serif', letterSpacing: 2 }}>
            <StressedWord word={word_de} />
          </div>

          {/* Фонетические подсказки для трудных букв/сочетаний */}
          {hints.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
              {hints.map(h => (
                <span key={h} style={{
                  fontSize: 12, padding: '2px 10px', borderRadius: 20,
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  fontWeight: 600, fontFamily: 'monospace', letterSpacing: 0.3,
                }}>
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Произношение кириллицей */}
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)', marginRight: 4 }}>читать:</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontStyle: 'italic', letterSpacing: 0.5 }}>
              {russianPhonetic}
            </span>
          </div>

          {/* Перевод */}
          <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--ink-soft)' }}>
            {displayTranslation}
          </div>

          {/* Прослушать образец */}
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button onClick={() => speak(word_de, 'de-DE', 0.75)}
              style={{ padding: '4px 16px', borderRadius: 20, border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-soft)', fontSize: 13, cursor: 'pointer' }}>
              ◄ Слушать образец
            </button>
          </div>
        </div>

        {/* ── Легенда ударения ── */}
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center', marginBottom: 14, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span><span style={{ borderBottom: '2px dotted var(--ink-soft)' }}>слог</span> — ударный</span>
          <span><span style={{ color: 'var(--accent)', borderBottom: '2px solid var(--accent)' }}>буквы</span> — особое чтение</span>
        </div>

        {/* ── Кнопка микрофона ── */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <button onClick={handleMic}
            style={{
              width: 76, height: 76, borderRadius: '50%',
              border: 'none', cursor: 'pointer', fontSize: 30,
              background: micBg,
              color: phase === 'listening' ? '#fff' : 'var(--ink)',
              boxShadow: listening
                ? '0 0 0 8px rgba(179,56,44,0.2), 0 0 0 16px rgba(179,56,44,0.1)'
                : '0 2px 10px rgba(0,0,0,.2)',
              transition: 'all 0.2s',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {micLabel}
          </button>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            {listening
              ? '🎤 Слушаю... говорите!'
              : phase === 'result'
                ? 'Нажми чтобы повторить'
                : 'Нажми и произнеси слово по-немецки'}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', marginBottom: 10 }}>
            Ошибка: {error}. Разрешите доступ к микрофону в браузере.
          </div>
        )}

        {/* ── Результат ── */}
        {phase === 'result' && result && (
          <div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '12px 16px', marginBottom: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: result.color, marginBottom: 4 }}>
                {result.label}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
                Распознано: <span style={{ fontWeight: 600, color: 'var(--ink)', fontFamily: 'Georgia,serif' }}>
                  {result.transcript || '—'}
                </span>
              </div>
              {result.quality < 3 && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Правильно: <span style={{ fontWeight: 700, color: 'var(--good)', fontFamily: 'Georgia,serif' }}>{word_de}</span>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
                Совпадение: {Math.round(result.sim * 100)}%
              </div>
            </div>

            <ExerciseActions
              de={word_de} ru={displayTranslation}
              type="speech" exerciseId={exerciseId}
              userAnswer={result.transcript} correctAnswer={word_de}
              isCorrect={result.quality >= 3}
            />

            <button onClick={() => onAnswer(result.quality, result.transcript)}
              style={{ marginTop: 10, width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              {t.exercise.next}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
