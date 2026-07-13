import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import tutors from '../data/tutors.json'
import { useI18nStore } from '../store/i18n.js'
import { ex } from '../utils/extraI18n.js'

// Координаты городов (для меток на карте)
const CITY_COORDS = {
  'Мюнхен': [48.137, 11.575], 'Гамбург': [53.551, 9.993], 'Берлин': [52.520, 13.405],
  'Франкфурт': [50.110, 8.682], 'Кёльн': [50.937, 6.960], 'Вена': [48.208, 16.373], 'Цюрих': [47.377, 8.541],
}
// Иконка-метка (эмодзи в кружке), чтобы не тянуть картинки leaflet
const pinIcon = (t) => L.divIcon({
  className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
  html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#3B7A57;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
           <span style="transform:rotate(45deg);font-size:16px;">${t.type === 'Школа' ? '🏫' : '🧑‍🏫'}</span></div>`,
})
// Небольшой разброс, если несколько в одном городе
const jitter = (i) => (((i * 37) % 20) - 10) / 1000

// 🏫 Каталог школ и репетиторов немецкого (демо). Фильтры: страна, город, формат, для кого.
export default function Tutors() {
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [format, setFormat] = useState('')
  const [audience, setAudience] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list')  // list | map
  const E = ex(useI18nStore(s => s.lang))

  const countries = [...new Set(tutors.map(t => t.country))].sort()
  const cities = [...new Set(tutors.filter(t => !country || t.country === country).map(t => t.city))].sort()
  const audiences = [...new Set(tutors.flatMap(t => t.audience))].sort()

  const list = useMemo(() => tutors.filter(t => {
    if (country && t.country !== country) return false
    if (city && t.city !== city) return false
    if (format && t.format !== format && t.format !== 'Оба') return false
    if (audience && !t.audience.includes(audience)) return false
    const q = search.trim().toLowerCase()
    if (q && !(t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q) || t.about.toLowerCase().includes(q))) return false
    return true
  }), [country, city, format, audience, search])

  const sel = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px 40px' }}>
      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <h1 style={{ fontSize: 24, margin: '4px 0 6px' }}>🏫 {E.tutorsTitle}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: 0 }}>{E.tutorsSub}</p>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Поиск…" style={{ ...sel, flex: 1, minWidth: 140 }} />
        <select value={country} onChange={e => { setCountry(e.target.value); setCity('') }} style={sel}>
          <option value="">🌍 Страна</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={city} onChange={e => setCity(e.target.value)} style={sel}>
          <option value="">🏙️ Город</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {['Онлайн', 'Офлайн'].map(f => (
          <Chip key={f} active={format === f} onClick={() => setFormat(format === f ? '' : f)}>{f === 'Онлайн' ? '💻' : '📍'} {f}</Chip>
        ))}
        {audiences.map(a => (
          <Chip key={a} active={audience === a} onClick={() => setAudience(audience === a ? '' : a)}>{a}</Chip>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Найдено: {list.length}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip active={view === 'list'} onClick={() => setView('list')}>📋 Список</Chip>
          <Chip active={view === 'map'} onClick={() => setView('map')}>🗺️ Карта</Chip>
        </div>
      </div>

      {view === 'map' ? (
        <div style={{ height: 480, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)' }}>
          <MapContainer center={[50.5, 10.5]} zoom={5} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {list.map((t, i) => {
              const base = CITY_COORDS[t.city]
              if (!base) return null
              const pos = [base[0] + jitter(i + 1), base[1] + jitter(i + 3)]
              return (
                <Marker key={t.id} position={pos} icon={pinIcon(t)}>
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <img src={t.avatar} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{t.type} · {t.city}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>⭐ {t.rating} · {t.price === 0 ? 'Бесплатно' : `€${t.price}/час`}</div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {list.map(t => <TutorCard key={t.id} t={t} />)}
        </div>
      )}
      {list.length === 0 && view === 'list' && <div style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 30 }}>Никого не найдено — измени фильтры</div>}
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 13px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontWeight: active ? 700 : 500,
      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      background: active ? 'var(--accent)' : 'var(--surface-2)', color: active ? 'var(--accent-ink)' : 'var(--ink)',
    }}>{children}</button>
  )
}

function TutorCard({ t }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, padding: 14 }}>
        <img src={t.avatar} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
            {t.verified && <span title="Проверенный" style={{ color: 'var(--accent)', fontSize: 13 }}>✓</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {t.type === 'Школа' ? '🏫' : '🧑‍🏫'} {t.type} · 📍 {t.city}{t.district ? `, ${t.district}` : ''}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--accent)', marginTop: 2 }}>⭐ {t.rating} <span style={{ color: 'var(--ink-soft)' }}>({t.reviews}) · {t.experience} лет</span></div>
        </div>
      </div>
      <div style={{ padding: '0 14px 12px', flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 8 }}>{t.about}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <Tag>{t.format === 'Онлайн' ? '💻 Онлайн' : t.format === 'Офлайн' ? '📍 Офлайн' : '💻📍 Онлайн+Офлайн'}</Tag>
          {t.levels.length > 0 && <Tag>{t.levels[0]}–{t.levels[t.levels.length - 1]}</Tag>}
          {t.audience.slice(0, 2).map(a => <Tag key={a}>{a}</Tag>)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{t.price === 0 ? 'Бесплатно' : `€${t.price}/час`}</span>
        <button onClick={() => alert('Демо: здесь будет чат/запись к учителю')} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Написать</button>
      </div>
    </div>
  )
}

function Tag({ children }) {
  return <span style={{ fontSize: 11.5, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 8px', color: 'var(--ink-soft)' }}>{children}</span>
}
