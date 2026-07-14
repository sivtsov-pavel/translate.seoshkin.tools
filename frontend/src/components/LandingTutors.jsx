import { useState, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'

const CITY_COORDS = {
  'Мюнхен': [48.137, 11.575], 'Гамбург': [53.551, 9.993], 'Берлин': [52.520, 13.405],
  'Франкфурт': [50.110, 8.682], 'Кёльн': [50.937, 6.960], 'Вена': [48.208, 16.373], 'Цюрих': [47.377, 8.541],
}
const pinIcon = (t) => L.divIcon({
  className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
  html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#3B7A57;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
           <span style="transform:rotate(45deg);font-size:16px;">${t.type === 'Школа' ? '🏫' : '🧑‍🏫'}</span></div>`,
})
const jitter = (i) => (((i * 37) % 20) - 10) / 1000

export default function LandingTutors() {
  const [tutors, setTutors] = useState([])
  const [city, setCity] = useState('')
  const [format, setFormat] = useState('')

  useEffect(() => { api.get('/public/tutors').then(setTutors).catch(() => {}) }, [])

  const cities = useMemo(() => [...new Set(tutors.map(t => t.city).filter(Boolean))].sort(), [tutors])
  const filtered = tutors.filter(t =>
    (!city || t.city === city) && (!format || t.format === format))

  if (!tutors.length) return null // нет данных — секцию не показываем

  const withCoords = filtered.map((t, i) => {
    const c = (t.lat && t.lng) ? [Number(t.lat), Number(t.lng)] : (CITY_COORDS[t.city] || null)
    return c ? { ...t, _pos: [c[0] + jitter(i), c[1] + jitter(i + 3)] } : null
  }).filter(Boolean)

  return (
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 16px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40 }}>🏫</div>
        <h2 style={{ fontSize: 'clamp(24px,5vw,36px)', fontWeight: 900, margin: '6px 0', color: 'var(--ink)' }}>Школы и репетиторы немецкого рядом</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 16, margin: 0 }}>Найди преподавателя или школу в своём городе — очно и онлайн.</p>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
        <select value={city} onChange={e => setCity(e.target.value)} style={selStyle}>
          <option value="">🌍 Все города</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={format} onChange={e => setFormat(e.target.value)} style={selStyle}>
          <option value="">Любой формат</option>
          <option value="Онлайн">Онлайн</option>
          <option value="Очно">Очно</option>
          <option value="Онлайн и очно">Онлайн и очно</option>
        </select>
      </div>

      {/* Карта */}
      <div style={{ height: 360, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 18 }}>
        <MapContainer center={[49.5, 10.5]} zoom={5} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {withCoords.map(t => (
            <Marker key={t.id} position={t._pos} icon={pinIcon(t)}>
              <Popup>
                <b>{t.name}</b><br />{t.type} · {t.city}<br />{t.format} · ⭐ {t.rating || '—'}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Карточки — первые 6 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
        {filtered.slice(0, 6).map(t => (
          <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 12 }}>
            {t.avatar_url && <img src={t.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                {t.name} {t.verified && <span title="Проверен" style={{ color: 'var(--accent)' }}>✓</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.type} · {t.city} · {t.format}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>⭐ {t.rating || '—'} · {t.price || ''}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/register" style={ctaPrimary}>Найти преподавателя →</Link>
        <Link to="/register" style={ctaGhost}>Я преподаю — добавить анкету</Link>
      </div>
    </section>
  )
}

const selStyle = { padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }
const ctaPrimary = { padding: '13px 28px', borderRadius: 12, fontWeight: 700, fontSize: 15, background: 'var(--accent)', color: 'var(--accent-ink)', textDecoration: 'none' }
const ctaGhost = { padding: '13px 28px', borderRadius: 12, fontWeight: 600, fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', textDecoration: 'none', border: '1px solid var(--line)' }
