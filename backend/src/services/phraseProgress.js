// Прогресс по фразе.
//
// Шаг «говорю» необязателен: Web Speech API отсутствует в Safari/iOS (включая PWA)
// и требует сети в Chrome. Поэтому фраза считается пройденной по двум первым шагам —
// иначе на айфоне набор нельзя было бы закрыть в принципе.
export function isPhraseDone(p) {
  return Boolean(p && p.step_listen && p.step_build)
}

export function summarizePhraseProgress(rows = []) {
  const list = rows || []
  return { total: list.length, done: list.filter(isPhraseDone).length }
}
