import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
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

// Канонические значения (тип/формат/аудитория) хранятся в БД по-русски (демо-данные + анкеты
// репетиторов) — переводим только ОТОБРАЖЕНИЕ, сравнения/фильтры остаются на исходных значениях.
const FORMAT_LABELS = {
  'Онлайн': { ru: 'Онлайн', en: 'Online', de: 'Online', uk: 'Онлайн', bg: 'Онлайн', tr: 'Online', ar: 'عبر الإنترنت', es: 'En línea', fr: 'En ligne', sq: 'Online' },
  'Офлайн': { ru: 'Офлайн', en: 'In person', de: 'Vor Ort', uk: 'Офлайн', bg: 'Присъствено', tr: 'Yüz yüze', ar: 'حضوريًا', es: 'Presencial', fr: 'En présentiel', sq: 'Në vend' },
  'Оба': { ru: 'Онлайн+Офлайн', en: 'Online + in person', de: 'Online + vor Ort', uk: 'Онлайн+Офлайн', bg: 'Онлайн+Присъствено', tr: 'Online + Yüz yüze', ar: 'عبر الإنترنت + حضوريًا', es: 'En línea + presencial', fr: 'En ligne + présentiel', sq: 'Online + Në vend' },
}
const TYPE_LABELS = {
  'Школа': { ru: 'Школа', en: 'School', de: 'Schule', uk: 'Школа', bg: 'Училище', tr: 'Okul', ar: 'مدرسة', es: 'Escuela', fr: 'École', sq: 'Shkollë' },
  'Репетитор': { ru: 'Репетитор', en: 'Tutor', de: 'Tutor', uk: 'Репетитор', bg: 'Учител', tr: 'Özel öğretmen', ar: 'مدرّس خاص', es: 'Tutor', fr: 'Tuteur', sq: 'Tutor' },
}
const AUD_LABELS = {
  'Дети': { ru: 'Дети', en: 'Kids', de: 'Kinder', uk: 'Діти', bg: 'Деца', tr: 'Çocuklar', ar: 'أطفال', es: 'Niños', fr: 'Enfants', sq: 'Fëmijë' },
  'Подростки': { ru: 'Подростки', en: 'Teens', de: 'Jugendliche', uk: 'Підлітки', bg: 'Тийнейджъри', tr: 'Gençler', ar: 'مراهقون', es: 'Adolescentes', fr: 'Adolescents', sq: 'Adoleshentë' },
  'Взрослые': { ru: 'Взрослые', en: 'Adults', de: 'Erwachsene', uk: 'Дорослі', bg: 'Възрастни', tr: 'Yetişkinler', ar: 'بالغون', es: 'Adultos', fr: 'Adultes', sq: 'Të rritur' },
  'Бизнес': { ru: 'Бизнес', en: 'Business', de: 'Business', uk: 'Бізнес', bg: 'Бизнес', tr: 'İş dünyası', ar: 'أعمال', es: 'Negocios', fr: 'Affaires', sq: 'Biznes' },
  'Начинающие': { ru: 'Начинающие', en: 'Beginners', de: 'Anfänger', uk: 'Початківці', bg: 'Начинаещи', tr: 'Başlangıç', ar: 'مبتدئون', es: 'Principiantes', fr: 'Débutants', sq: 'Fillestarë' },
}
const trVal = (map, key, lang) => map[key]?.[lang] || key

// 🏫 Каталог школ и репетиторов немецкого (демо). Фильтры: страна, город, формат, для кого.
export default function Tutors() {
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [format, setFormat] = useState('')
  const [audience, setAudience] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list')  // list | map
  const [all, setAll] = useState([])
  const [mine, setMine] = useState(null)
  const [editing, setEditing] = useState(false)
  const { user } = useAuthStore()
  const lang = useI18nStore(s => s.lang)
  const E = ex(lang)

  const reload = () => {
    api.get('/tutors').then(setAll).catch(() => {})
    api.get('/tutors/mine').then(setMine).catch(() => {})
  }
  useEffect(() => { reload() }, [])

  const countries = [...new Set(all.map(t => t.country).filter(Boolean))].sort()
  const cities = [...new Set(all.filter(t => !country || t.country === country).map(t => t.city).filter(Boolean))].sort()
  const audiences = [...new Set(all.flatMap(t => t.audience || []))].sort()

  const list = useMemo(() => all.filter(t => {
    if (country && t.country !== country) return false
    if (city && t.city !== city) return false
    if (format && t.format !== format && t.format !== 'Оба') return false
    if (audience && !(t.audience || []).includes(audience)) return false
    const q = search.trim().toLowerCase()
    if (q && !(`${t.name} ${t.city || ''} ${t.about || ''}`.toLowerCase().includes(q))) return false
    return true
  }), [all, country, city, format, audience, search])

  const sel = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px 40px' }}>
      <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
        <h1 style={{ fontSize: 24, margin: '4px 0 6px' }}>🏫 {E.tutorsTitle}</h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, margin: '0 0 10px' }}>{E.tutorsSub}</p>
        <button onClick={() => setEditing(true)}
          style={{ padding: '9px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 14 }}>
          {mine ? E.tutorsMyProfile : E.tutorsAddProfile}
        </button>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={E.tutorsSearchPlaceholder} style={{ ...sel, flex: 1, minWidth: 140 }} />
        <select value={country} onChange={e => { setCountry(e.target.value); setCity('') }} style={sel}>
          <option value="">{E.tutorsCountryFilter}</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={city} onChange={e => setCity(e.target.value)} style={sel}>
          <option value="">{E.tutorsCityFilter}</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {['Онлайн', 'Офлайн'].map(f => (
          <Chip key={f} active={format === f} onClick={() => setFormat(format === f ? '' : f)}>{f === 'Онлайн' ? '💻' : '📍'} {trVal(FORMAT_LABELS, f, lang)}</Chip>
        ))}
        {audiences.map(a => (
          <Chip key={a} active={audience === a} onClick={() => setAudience(audience === a ? '' : a)}>{trVal(AUD_LABELS, a, lang)}</Chip>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{E.tutorsFoundLabel}: {list.length}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip active={view === 'list'} onClick={() => setView('list')}>{E.tutorsListView}</Chip>
          <Chip active={view === 'map'} onClick={() => setView('map')}>{E.tutorsMapView}</Chip>
        </div>
      </div>

      {view === 'map' ? (
        <div style={{ height: 480, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)' }}>
          <MapContainer center={[50.5, 10.5]} zoom={5} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {list.map((t, i) => {
              const base = (t.lat != null && t.lng != null) ? [Number(t.lat), Number(t.lng)] : CITY_COORDS[t.city]
              if (!base) return null
              const pos = [base[0] + jitter(i + 1), base[1] + jitter(i + 3)]
              return (
                <Marker key={t.id} position={pos} icon={pinIcon(t)}>
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <img src={t.avatar_url} alt="" loading="lazy" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{t.type} · {t.city}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 6 }}>⭐ {t.rating} · {t.price === 0 ? E.tutorsFree : `€${t.price}/${E.hourUnit}`}</div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {list.map(t => <TutorCard key={t.id} t={t} E={E} lang={lang} />)}
        </div>
      )}
      {list.length === 0 && view === 'list' && <div style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 30 }}>{E.tutorsNoneFound}</div>}

      {editing && <TutorForm mine={mine} E={E} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload() }} />}
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

function TutorCard({ t, E, lang }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, padding: 14 }}>
        <img src={t.avatar_url} alt="" loading="lazy" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
            {t.verified && <span title={E.tutorsVerified} style={{ color: 'var(--accent)', fontSize: 13 }}>✓</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {t.type === 'Школа' ? '🏫' : '🧑‍🏫'} {trVal(TYPE_LABELS, t.type, lang)} · 📍 {t.city}{t.district ? `, ${t.district}` : ''}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--accent)', marginTop: 2 }}>⭐ {t.rating} <span style={{ color: 'var(--ink-soft)' }}>({t.reviews}) · {t.experience} {E.yearsUnit}</span></div>
        </div>
      </div>
      <div style={{ padding: '0 14px 12px', flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 8 }}>{t.about}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          <Tag>{t.format === 'Онлайн' ? '💻' : t.format === 'Офлайн' ? '📍' : '💻📍'} {trVal(FORMAT_LABELS, t.format, lang)}</Tag>
          {t.levels.length > 0 && <Tag>{t.levels[0]}–{t.levels[t.levels.length - 1]}</Tag>}
          {t.audience.slice(0, 2).map(a => <Tag key={a}>{trVal(AUD_LABELS, a, lang)}</Tag>)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{t.price === 0 ? E.tutorsFree : `€${t.price}/${E.hourUnit}`}</span>
        <button onClick={() => alert(E.tutorsContactDemo)} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{E.tutorsWrite}</button>
      </div>
    </div>
  )
}

function Tag({ children }) {
  return <span style={{ fontSize: 11.5, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 8px', color: 'var(--ink-soft)' }}>{children}</span>
}

const DEMO_AVATARS = ['/tutors/t1.png', '/tutors/t2.png', '/tutors/t3.png', '/tutors/t4.png', '/tutors/t5.png', '/tutors/t6.png', '/tutors/t7.png', '/tutors/t8.png']
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']
const AUDS = ['Дети', 'Подростки', 'Взрослые', 'Бизнес', 'Начинающие']

// Форма создания/редактирования своей анкеты репетитора
function TutorForm({ mine, E, onClose, onSaved }) {
  const lang = useI18nStore(s => s.lang)
  const [f, setF] = useState(() => ({
    name: mine?.name || '', type: mine?.type || 'Репетитор', avatar_url: mine?.avatar_url || DEMO_AVATARS[0],
    country: mine?.country || 'Германия', city: mine?.city || '', district: mine?.district || '',
    format: mine?.format || 'Онлайн', price: mine?.price ?? 0, experience: mine?.experience ?? 0,
    levels: mine?.levels || ['A1', 'A2'], audience: mine?.audience || ['Взрослые'],
    about: mine?.about || '', contact: mine?.contact || '',
  }))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const toggle = (k, v) => setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))

  const save = async () => {
    if (!f.name.trim()) { alert(E.tutorsNameRequired); return }
    setSaving(true)
    try {
      await api.post('/tutors', { ...f, langs: ['Немецкий'], price: Number(f.price) || 0, experience: Number(f.experience) || 0 })
      onSaved()
    } catch (e) { alert(E.errorPrefix + e.message) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!window.confirm(E.tutorsDeleteConfirm)) return
    try { await api.delete('/tutors/mine'); onSaved() } catch (e) { alert(E.errorPrefix + e.message) }
  }

  const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, marginBottom: 10 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 20, maxWidth: 460, width: '100%', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{mine ? E.tutorsFormTitleMine : E.tutorsFormTitleNew}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink-soft)' }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>{E.tutorsAvatarLabel}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {DEMO_AVATARS.map(a => (
            <img key={a} src={a} alt="" onClick={() => set('avatar_url', a)}
              style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', cursor: 'pointer', border: `2px solid ${f.avatar_url === a ? 'var(--accent)' : 'var(--line)'}` }} />
          ))}
        </div>

        <input style={inp} placeholder={E.tutorsNamePlaceholder} value={f.name} onChange={e => set('name', e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={{ ...inp, flex: 1 }} value={f.type} onChange={e => set('type', e.target.value)}>
            <option value="Репетитор">{trVal(TYPE_LABELS, 'Репетитор', lang)}</option>
            <option value="Школа">{trVal(TYPE_LABELS, 'Школа', lang)}</option>
          </select>
          <select style={{ ...inp, flex: 1 }} value={f.format} onChange={e => set('format', e.target.value)}>
            <option value="Онлайн">{trVal(FORMAT_LABELS, 'Онлайн', lang)}</option>
            <option value="Офлайн">{trVal(FORMAT_LABELS, 'Офлайн', lang)}</option>
            <option value="Оба">{trVal(FORMAT_LABELS, 'Оба', lang)}</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inp, flex: 1 }} placeholder={E.tutorsCountryPlaceholder} value={f.country} onChange={e => set('country', e.target.value)} />
          <input style={{ ...inp, flex: 1 }} placeholder={E.tutorsCityPlaceholder} value={f.city} onChange={e => set('city', e.target.value)} />
        </div>
        <input style={inp} placeholder={E.tutorsDistrictPlaceholder} value={f.district} onChange={e => set('district', e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inp, flex: 1 }} type="number" placeholder={E.tutorsPricePlaceholder} value={f.price} onChange={e => set('price', e.target.value)} />
          <input style={{ ...inp, flex: 1 }} type="number" placeholder={E.tutorsExperiencePlaceholder} value={f.experience} onChange={e => set('experience', e.target.value)} />
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '2px 0 6px' }}>{E.tutorsLevelsLabel}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {LEVELS.map(l => <Chip key={l} active={f.levels.includes(l)} onClick={() => toggle('levels', l)}>{l}</Chip>)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>{E.tutorsAudienceLabel}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {AUDS.map(a => <Chip key={a} active={f.audience.includes(a)} onClick={() => toggle('audience', a)}>{trVal(AUD_LABELS, a, lang)}</Chip>)}
        </div>

        <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} placeholder={E.tutorsAboutPlaceholder} value={f.about} onChange={e => set('about', e.target.value)} />
        <input style={inp} placeholder={E.tutorsContactPlaceholder} value={f.contact} onChange={e => set('contact', e.target.value)} />

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{saving ? E.tutorsSaving : E.tutorsSave}</button>
          {mine && <button onClick={remove} style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontWeight: 600, cursor: 'pointer' }}>{E.tutorsDelete}</button>}
        </div>
      </div>
    </div>
  )
}
