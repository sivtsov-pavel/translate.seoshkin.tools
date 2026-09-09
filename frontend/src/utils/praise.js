import { speak, uiLocale } from '../hooks/useSpeech.jsx'
import { playCorrect, playWrong } from './sound.js'

// Реакция Pablo на ответ ученика: похвала ГОЛОСОМ НА ЕГО ЯЗЫКЕ.
//
// Живёт отдельным помощником, потому что нужна в восьми типах упражнений сразу.
// Раньше половина типов умела только пикнуть, а другая половина проигрывала клип
// с немецким «Sehr gut» — и у ученика из Турции или Украины реакция была либо
// невнятным звуком, либо чужой речью (замечание Павла 09.09.2026: в классе десять стран).
//
// Выключается прежним тумблером «реакции тренера» (trainer_reactions) — он есть и в
// шапке упражнения, и в Настройках. Выключен — вместо голоса короткий звук, как было.
//
//   ok   — ответ верный
//   t    — словарь локали (useI18nStore)
//   lang — код языка интерфейса ('ru', 'tr', …), НЕ изучаемого языка
export function reactToAnswer(ok, t, lang) {
  if (localStorage.getItem('trainer_reactions') === 'false') {
    if (ok) playCorrect(); else playWrong()
    return
  }
  const phrase = ok ? t?.exercise?.praiseCorrect : t?.exercise?.praiseWrong
  // Фразы нет (старая локаль без ключа) — не молчим, а пикаем, как раньше
  if (!phrase) { if (ok) playCorrect(); else playWrong(); return }
  speak(phrase, uiLocale(lang))
}
