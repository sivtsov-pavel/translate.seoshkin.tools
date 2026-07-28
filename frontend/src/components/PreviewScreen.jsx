// Превью распознанного: учитель видит, что ИИ нашёл на фото, снимает галочки с ненужного
// и дописывает пропущенное — и только тогда данные попадают в урок.
//
// Экран общий для двух сценариев, и это принципиально:
//  • создание урока (NewLesson) — фото учебника, урока ещё нет;
//  • дозагрузка тетради в готовый урок (LessonList) — слова добавляются к существующим.
// Раньше превью жило внутри NewLesson, и дозагрузка шла мимо него: фото распознавались
// и все слова заходили в урок молча, вместе с повторами и подписями к заданиям.
export default function PreviewScreen({ preview, error, N, onToggleWord, onToggleGroup, onToggleSentence, newWordDe, setNewWordDe, newWordTr, setNewWordTr, onAddWord, newSentence, setNewSentence, onAddSentence, onConfirm, onCancel }) {
  const wordsChecked = preview.words.filter(w => w.checked).length
  // Индекс сохраняем: переключение галочки идёт по позиции в общем списке
  const withIdx = preview.words.map((w, idx) => ({ w, idx }))
  const groups = [
    { key: 'new', title: N.grpNew || 'Новые слова', color: 'var(--good)',
      hint: N.grpNewHint || 'их и добавляем в урок',
      items: withIdx.filter(x => x.w.isNew !== false && !x.w.isFunction) },
    { key: 'seen', title: N.grpSeen || 'Уже проходили', color: 'var(--ink-soft)',
      hint: N.grpSeenHint || 'упражнения на них уже есть',
      items: withIdx.filter(x => x.w.isNew === false && !x.w.isFunction) },
    { key: 'fn', title: N.grpFn || 'Служебные и подписи', color: 'var(--ink-soft)',
      hint: N.grpFnHint || 'артикли, предлоги, заголовки заданий',
      items: withIdx.filter(x => x.w.isFunction) },
  ]
  const sentChecked = preview.sentences.filter(s => s.checked).length
  const srcTag = s => s === 'extra' ? '✏️' : '📘'
  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>{N.title}</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 20 }}>{N.hint}</p>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(179,56,44,0.1)', borderRadius: 8, border: '1px solid rgba(179,56,44,0.3)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* Слова разбиты на три группы. Учебник целиком даёт сотни слов, и вычитывать
          их подряд невозможно — а решение по каждой группе очевидно:
            • новые — берём (отмечены);
            • повторы — упражнения на них уже есть, брать незачем (сняты, но видны);
            • служебные — артикли, предлоги и куски подписей к заданиям
              («Sehen Sie die Bilder an») — в словарь не нужны (сняты). */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{N.words} ({wordsChecked} / {preview.words.length})</div>
        {groups.map(g => g.items.length > 0 && (
          <div key={g.key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.title} · {g.items.length}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 1 }}>{g.hint}</span>
              <button type="button" onClick={() => onToggleGroup(g.items.map(x => x.idx), true)}
                style={{ fontSize: 12, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}>{N.pickAll || 'все'}</button>
              <button type="button" onClick={() => onToggleGroup(g.items.map(x => x.idx), false)}
                style={{ fontSize: 12, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-soft)', cursor: 'pointer' }}>{N.pickNone || 'снять'}</button>
            </div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', maxHeight: 300, overflowY: 'auto' }}>
              {g.items.map(({ w, idx }, i) => (
                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < g.items.length - 1 ? '1px solid var(--line)' : 'none', opacity: w.checked ? 1 : 0.45, cursor: 'pointer' }}>
                  <input type="checkbox" checked={w.checked} onChange={() => onToggleWord(idx)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flexShrink: 0 }} title={w.source === 'extra' ? N.fromExtra : N.fromBook}>{srcTag(w.source)}</span>
                  <span style={{ fontWeight: 600 }}>{w.word_de}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>— {w.translation_ru || '…'}</span>
                  {w.seenIn && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-soft)', flexShrink: 0 }}>{w.seenIn.title}</span>}
                </label>
              ))}
            </div>
          </div>
        ))}
        {!preview.words.length && <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 14, border: '1px solid var(--line)', borderRadius: 12 }}>{N.noWords}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input value={newWordDe} onChange={e => setNewWordDe(e.target.value)} placeholder={N.wordPh} style={{ flex: '1 1 140px' }} />
          <input value={newWordTr} onChange={e => setNewWordTr(e.target.value)} placeholder={N.trPh} style={{ flex: '1 1 140px' }} />
          <button type="button" onClick={onAddWord} disabled={!newWordDe.trim()}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: newWordDe.trim() ? 'pointer' : 'not-allowed' }}>
            {N.addWord}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{N.sentences} ({sentChecked} / {preview.sentences.length})</div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', maxHeight: 260, overflowY: 'auto' }}>
          {preview.sentences.map((s, idx) => (
            <label key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 14px', borderBottom: idx < preview.sentences.length - 1 ? '1px solid var(--line)' : 'none', opacity: s.checked ? 1 : 0.45, cursor: 'pointer' }}>
              <input type="checkbox" checked={s.checked} onChange={() => onToggleSentence(idx)} style={{ width: 17, height: 17, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, flexShrink: 0 }} title={s.source === 'extra' ? N.fromExtra : N.fromBook}>{srcTag(s.source)}</span>
              <span>
                <div>{s.text}</div>
                {s.translation_ru && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{s.translation_ru}</div>}
              </span>
            </label>
          ))}
          {!preview.sentences.length && <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 14 }}>{N.noSentences}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={newSentence} onChange={e => setNewSentence(e.target.value)} placeholder={N.sentPh} style={{ flex: 1 }} />
          <button type="button" onClick={onAddSentence} disabled={!newSentence.trim()}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: newSentence.trim() ? 'pointer' : 'not-allowed' }}>
            {N.addSent}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '13px 20px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {N.cancel}
        </button>
        <button type="button" onClick={onConfirm} disabled={wordsChecked === 0}
          style={{ flex: 1, padding: '13px 20px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 16, cursor: wordsChecked === 0 ? 'not-allowed' : 'pointer',
            background: wordsChecked === 0 ? 'var(--surface-2)' : 'var(--accent)', color: wordsChecked === 0 ? 'var(--ink-soft)' : 'var(--accent-ink)' }}>
          {N.confirm}
        </button>
      </div>
    </div>
  )
}
