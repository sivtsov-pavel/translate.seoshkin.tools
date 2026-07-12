// Чистые функции памяти AI-тренера (без сети/AI — легко юнит-тестировать).
// AI-вызов суммаризации живёт в claude.js (summarizeTrainerSession).

// Слить накопленную память с обновлением после завершённой сессии.
// - known_facts: мёрж объектов (новые факты перекрывают старые)
// - recurring_mistakes: повторная ошибка того же типа увеличивает times_seen,
//   новая — добавляется с times_seen = 1
// - topics_covered: добавляются в конец
// - summary_text: берётся новый (AI отдаёт обновлённую накопительную выжимку)
export function mergeMemory(existing, update, now = () => new Date().toISOString()) {
  const base = existing || {}
  const upd = update || {}

  const known_facts = { ...(base.known_facts || {}), ...(upd.known_facts || {}) }

  const recurring = (base.recurring_mistakes || []).map(m => ({ ...m }))
  for (const nm of (upd.recurring_mistakes || [])) {
    if (!nm || !nm.type) continue
    const found = recurring.find(m => m.type === nm.type)
    if (found) {
      found.times_seen = (found.times_seen || 1) + 1
      found.last_seen_at = now()
      if (nm.example) found.example = nm.example
    } else {
      recurring.push({
        type: nm.type,
        example: nm.example || '',
        times_seen: 1,
        last_seen_at: now(),
      })
    }
  }

  const topics_covered = [
    ...(base.topics_covered || []),
    ...(upd.topics_covered || []),
  ]

  return {
    summary_text: (upd.summary_text != null && upd.summary_text !== '')
      ? upd.summary_text
      : (base.summary_text || ''),
    known_facts,
    recurring_mistakes: recurring,
    topics_covered,
  }
}

// Топ-N повторяющихся ошибок по частоте — для инъекции в промпт следующей сессии
export function topMistakes(recurring_mistakes, n = 3) {
  return [...(recurring_mistakes || [])]
    .sort((a, b) => (b.times_seen || 0) - (a.times_seen || 0))
    .slice(0, n)
}

// Отчёт по сессии из массива сообщений (роль/текст/коррекция).
export function buildReport(messages) {
  const msgs = messages || []
  const userMsgs = msgs.filter(m => m.role === 'user')
  const mistakes = userMsgs
    .filter(m => m.correction && m.correction !== 'null' && m.correction !== null)
    .map(m => ({ original: m.text, correction: m.correction }))
  return {
    message_count: msgs.length,
    user_message_count: userMsgs.length,
    mistakes,
    mistakes_count: mistakes.length,
  }
}
