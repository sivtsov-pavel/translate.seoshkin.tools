import { useEffect, useState } from 'react'
import { api } from '../api/client.js'
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

export default function Report() {
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

  if (loading) return <div style={{ padding: 20, color: 'var(--ink-soft)' }}>Загрузка отчёта...</div>
  if (!data) return <div style={{ padding: 20, color: 'var(--red)' }}>Нет данных (только для учителя)</div>

  const { op } = data

  return (
    <div style={{ padding: '16px 12px 80px', maxWidth: 640, margin: '0 auto' }}>
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

      {/* Уроки */}
      <Section title="Уроки" icon="📚">
        <Row label="Обработанные уроки (статус done)" done={data.lessons_done} total={data.lessons_total} />
        {data.lessons_processing > 0 && (
          <div style={{ fontSize: 13, color: '#d97706' }}>
            ⏳ Обрабатываются прямо сейчас: {data.lessons_processing}
          </div>
        )}
      </Section>

      {/* Словарь */}
      <Section title="Словарь" icon="📖">
        <Row label="Слова с переводом на русский" done={data.words_with_ru} total={data.words_total} />
        <Row label="Слова с картинкой (Unsplash)" done={data.words_with_images} total={data.words_total} color="#d97706" />
        <Row label="Слова с примером предложения" done={data.words_with_example} total={data.words_total} color="#7c3aed" />
        <Row label="Переводы на 7 языков (en/uk/fr/ar/bg/tr/es)" done={data.words_translated} total={data.words_total} color="#0891b2" />
        {data.words_translated < data.words_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод на все языки → осталось {data.words_total - data.words_translated} слов
          </div>
        )}
      </Section>

      {/* Упражнения */}
      <Section title="Упражнения" icon="✏️">
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Флеш-карты: {data.fc_total} · Диктант: {data.dict_total}
        </div>
        <Row label="Выбор ответа (multiple_choice)" done={data.mc_translated} total={data.mc_total} />
        {data.mc_translated < data.mc_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод упражнений → осталось {data.mc_total - data.mc_translated}
          </div>
        )}
        <div style={{ marginTop: 8 }} />
        <Row label="Заполни пропуск (fill_blank)" done={data.fb_translated} total={data.fb_total} />
        {data.fb_translated < data.fb_total && (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
            Нужно: Перевод упражнений → осталось {data.fb_total - data.fb_translated}
          </div>
        )}
        <div style={{ marginTop: 8 }} />
        <Row label="Напиши предложение (sentence_write)" done={data.sw_translated} total={data.sw_total} />
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
