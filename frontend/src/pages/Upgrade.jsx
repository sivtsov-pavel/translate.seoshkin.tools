import { useEffect, useState } from 'react'
import { api } from '../api/client.js'

// Страница подписки Premium. Тарифы берём из публичного конфига (супер-админка).
// Кнопка «Оформить» → Stripe Checkout. Пока Stripe не настроен — показываем «скоро».

const CUR = { EUR: '€', USD: '$', RUB: '₽', UAH: '₴' }

export default function Upgrade() {
  const [cfg, setCfg] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/platform/public-config').then(setCfg).catch(() => {})
    api.get('/billing/status').then(setStatus).catch(() => {})
  }, [])

  const checkout = async (plan) => {
    setBusy(plan); setErr('')
    try {
      const { url } = await api.post('/billing/checkout', { plan })
      window.location.href = url
    } catch (e) { setErr(e.message); setBusy('') }
  }

  const price = cfg?.pricing || {}
  const sym = CUR[price.currency] || price.currency || ''
  const isPremium = status?.plan === 'premium'
  const notConfigured = status && status.configured === false

  const card = {
    background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
    padding: 24, textAlign: 'center', flex: 1, minWidth: 220,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 46 }}>⭐</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '4px 0' }}>Premium</h1>
        <p style={{ color: 'var(--ink-soft)', margin: 0 }}>Без рекламы, без дневных лимитов, все возможности.</p>
      </div>

      {isPremium ? (
        <div style={{ ...card, borderColor: 'var(--accent)' }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <h2 style={{ margin: '8px 0' }}>У тебя Premium</h2>
          {status.plan_until && <p style={{ color: 'var(--ink-soft)' }}>Действует до {new Date(status.plan_until).toLocaleDateString('ru-RU')}</p>}
          <button onClick={async () => {
            try { const { url } = await api.post('/billing/portal'); window.location.href = url } catch (e) { setErr(e.message) }
          }} style={btnGhost}>Управление подпиской</button>
        </div>
      ) : notConfigured ? (
        <div style={{ ...card }}>
          <div style={{ fontSize: 40 }}>🛠️</div>
          <h2 style={{ margin: '8px 0' }}>Скоро</h2>
          <p style={{ color: 'var(--ink-soft)' }}>Оплата подписки готовится к запуску.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={card}>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-soft)' }}>Месяц</div>
            <div style={{ fontSize: 34, fontWeight: 800, margin: '6px 0' }}>{sym}{price.monthly}</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 14 }}>в месяц</div>
            <button onClick={() => checkout('monthly')} disabled={busy} style={btnAccent}>
              {busy === 'monthly' ? '…' : 'Оформить'}
            </button>
          </div>
          <div style={{ ...card, borderColor: 'var(--accent)' }}>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--accent)' }}>Год · выгодно</div>
            <div style={{ fontSize: 34, fontWeight: 800, margin: '6px 0' }}>{sym}{price.yearly}</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 14 }}>в год</div>
            <button onClick={() => checkout('yearly')} disabled={busy} style={btnAccent}>
              {busy === 'yearly' ? '…' : 'Оформить'}
            </button>
          </div>
        </div>
      )}
      {err && <p style={{ color: 'var(--red)', textAlign: 'center', marginTop: 16 }}>{err}</p>}
    </div>
  )
}

const btnAccent = {
  width: '100%', padding: '12px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
  background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer',
}
const btnGhost = {
  marginTop: 12, padding: '10px 18px', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--surface-2)', color: 'var(--ink)', cursor: 'pointer', fontSize: 14,
}
