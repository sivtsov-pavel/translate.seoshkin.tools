import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { useOnline, OfflineNotice } from '../components/OfflineGuard.jsx'
import { useAdminOpStore } from '../store/adminOp.js'

function Bar({ done, total, color = 'var(--accent)' }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const warn = pct < 50
  const ok   = pct >= 95
  const barColor = ok ? 'var(--good)' : warn ? 'var(--red)' : color
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 3 }}>
        <span>{done} / {total}</span>
        <span style={{ fontWeight: 700, color: ok ? 'var(--good)' : warn ? 'var(--red)' : 'var(--ink-soft)' }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width .6s ease' }} />
      </div>
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, done, total, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{label}</div>
      <Bar done={done} total={total} color={color} />
    </div>
  )
}

// «Проверка системы» — прогон всех правил качества по всей базе.
//
// Смысл блока: ошибки материала должны быть видны учителю, а не всплывать у ученика
// посреди занятия. Каждый вид проверки объясняет, чем он вреден, — иначе список
// замечаний читается как шум и его перестают открывать.
//
// ИИ не вызывается: проверки детерминированные, прогон стоит $0.
function SystemCheck({ t }) {
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)

  const run = () => {
    setBusy(true)
    api.post('/admin/system-check', {})
      .then(setReport)
      .catch(e => setReport({ error: e.message }))
      .finally(() => setBusy(false))
  }

  return (
    <Section title={t.reports?.secSystemCheck || 'Проверка системы'} icon="🧪">
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        {t.reports?.systemCheckHint || 'Прогон всех правил качества по всей базе: словарь, упражнения, переводы. Бесплатно — ИИ не участвует.'}
      </div>

      <button onClick={run} disabled={busy}
        style={{ width: '100%', minHeight: 48, borderRadius: 14, border: 'none', cursor: busy ? 'default' : 'pointer',
          background: busy ? 'var(--surface-2)' : 'var(--accent)', color: busy ? 'var(--ink-soft)' : 'var(--accent-ink)',
          fontSize: 15, fontWeight: 700 }}>
        {busy ? (t.reports?.systemCheckRunning || 'Проверяю…') : (t.reports?.systemCheckRun || 'Запустить проверку')}
      </button>

      {report?.error && (
        <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 13 }}>✗ {report.error}</div>
      )}

      {report && !report.error && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
            {t.reports?.systemCheckScanned
              ? t.reports.systemCheckScanned(report.checkedExercises, report.checkedWords)
              : `Проверено ${report.checkedExercises} упражнений и ${report.checkedWords} слов`}
          </div>

          {report.ok ? (
            <div style={{ background: 'rgba(78,154,110,0.12)', border: '1px solid var(--good)', borderRadius: 12,
              padding: '12px 16px', color: 'var(--good)', fontWeight: 600 }}>
              ✓ {t.reports?.systemCheckClean || 'Ошибок не найдено'}
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                {t.reports?.systemCheckFound || 'Найдено'}: {report.total}
              </div>
              {report.groups.map(g => (
                <div key={g.id} style={{ border: '1px solid var(--line)', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
                  <button onClick={() => setOpen(open === g.id ? null : g.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                      background: 'var(--surface-2)', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--ink)' }}>
                    <span style={{ minWidth: 42, textAlign: 'center', fontWeight: 800, fontSize: 15,
                      color: g.count > 20 ? 'var(--red)' : '#d97706' }}>{g.count}</span>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{g.title}</span>
                    <span style={{ color: 'var(--ink-soft)' }}>{open === g.id ? '▴' : '▾'}</span>
                  </button>
                  {open === g.id && (
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10, lineHeight: 1.5 }}>{g.hint}</div>
                      {g.samples.map((s, i) => (
                        <div key={i} style={{ fontSize: 12.5, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                          {s.lesson_id != null && (
                            <span style={{ color: 'var(--ink-soft)' }}>{t.reports?.lessonShort || 'урок'} {s.lesson_id} · </span>
                          )}
                          <span dir="ltr">{s.ref}</span>
                        </div>
                      ))}
                      {g.count > g.samples.length && (
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
                          … {t.reports?.andMore || 'и ещё'} {g.count - g.samples.length}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {report.clean?.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>
              ✓ {t.reports?.systemCheckPassed || 'Без замечаний'}: {report.clean.join(' · ')}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// Отчёты строятся сервером из попыток всех учеников — офлайн невозможны
export default function Report() {
  const t = useI18nStore(s => s.t)
  const online = useOnline()
  if (!online) return <OfflineNotice />
  return <ReportInner />
}

function ReportInner() {
  const t = useI18nStore(s => s.t)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const adminOp = useAdminOpStore()

  const load = () => {
    setLoading(true)
    api.get('/admin/report')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Автообновление каждые 5 секунд если идёт операция
  useEffect(() => {
    if (adminOp.status !== 'running') return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [adminOp.status])

  if (loading) return <div style={{ padding: 20, color: 'var(--ink-soft)' }}>{t.reports.loadingReport}</div>
  if (!data) return <div style={{ padding: 20, color: 'var(--red)' }}>{t.reports.teacherOnlyData}</div>

  const { op } = data

  return (
    <div style={{ padding: '16px 12px 80px' }}>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        📊 Отчёт по контенту
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 16 }}>
        Статус данных в системе — картинки, переводы, упражнения
      </div>

      {/* Текущая операция */}
      {op.status === 'running' && (
        <div style={{ background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            ⏳ Идёт операция: {op.name}
          </div>
          <Bar done={op.done} total={op.total} color="#fff" />
          <div style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>
            Обновлено: {op.updated} · Ошибок: {op.failed}
          </div>
        </div>
      )}
      {op.status === 'done' && (
        <div style={{ background: 'rgba(78,154,110,0.12)', border: '1px solid var(--good)', borderRadius: 12, padding: '10px 16px', marginBottom: 12, color: 'var(--good)', fontWeight: 600 }}>
          ✓ Операция завершена: {op.name} — обновлено {op.updated}
        </div>
      )}
      {op.status === 'error' && (
        <div style={{ background: 'rgba(220,50,50,0.08)', border: '1px solid var(--red)', borderRadius: 12, padding: '10px 16px', marginBottom: 12, color: 'var(--red)', fontWeight: 600 }}>
          ✗ Ошибка: {op.error}
        </div>
      )}

      <SystemCheck t={t} />

      {/* Уроки */}
      <Section title={t.reports.secLessons} icon="📚">
        <Row label={t.reports.rowLessonsDone} done={data.lessons_done} total={data.lessons_total} />
        {data.lessons_processing > 0 && (
          <div style={{ fontSize: 13, color: '#d97706' }}>
            ⏳ Обрабатываются прямо сейчас: {data.lessons_processing}
          </div>
        )}
      </Section>

      {/* Словарь */}
      <Section title={t.reports.secVocab} icon="📖">
        <Row label={t.reports.rowWordsRu} done={data.words_with_ru} total={data.words_total} />
        <Row label={t.reports.rowWordsImg} done={data.words_with_images} total={data.words_total} color="#d97706" />
        <Row label={t.reports.rowWordsExample} done={data.words_with_example} total={data.words_total} color="#7c3aed" />
        <Row label={t.reports.rowWordsTranslated} done={data.words_translated} total={data.words_total} color="#0891b2" />
        {data.words_translated < data.words_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод на все языки → осталось {data.words_total - data.words_translated} слов
          </div>
        )}
      </Section>

      {/* Упражнения */}
      <Section title={t.reports.secExercises} icon="✏️">
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Флеш-карты: {data.fc_total} · Диктант: {data.dict_total}
        </div>
        <Row label={t.reports.rowMc} done={data.mc_translated} total={data.mc_total} />
        {data.mc_translated < data.mc_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод упражнений → осталось {data.mc_total - data.mc_translated}
          </div>
        )}
        <div style={{ marginTop: 8 }} />
        <Row label={t.reports.rowFb} done={data.fb_translated} total={data.fb_total} />
        {data.fb_translated < data.fb_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод упражнений → осталось {data.fb_total - data.fb_translated}
          </div>
        )}
        <div style={{ marginTop: 8 }} />
        <Row label={t.reports.rowSw} done={data.sw_translated} total={data.sw_total} />
        {data.sw_translated < data.sw_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод упражнений → осталось {data.sw_total - data.sw_translated}
          </div>
        )}
      </Section>

      <button onClick={load} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer', color: 'var(--ink)' }}>
        🔄 Обновить отчёт
      </button>
    </div>
  )
}
