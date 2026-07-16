import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { getLessonTitle } from '../utils/translation.js'
import { useI18nStore } from '../store/i18n.js'

// 📚 Наборы по темам: глобальные тематические комплекты слов (Глаголы, Числа, Школа…),
// собранные из всех уроков без дублей. Пополняются из тетради/доски/фото. Учишься по темам.
const THEME_ICON = {
  'Школа и учёба': '🏫', 'Языки': '🌍', 'Семья и друзья': '👨‍👩‍👧', 'Глаголы': '🏃', 'Числа': '🔢',
  'Время': '⏰', 'Транспорт': '🚌', 'Еда и напитки': '🍎', 'Документы и данные': '📄',
  'Города и страны': '🗺️', 'Места и направления': '🧭', 'Грамматика': '📐', 'Эмоции': '😊',
  'Дом и быт': '🏠', 'Природа': '🌳', 'Одежда': '👕', 'Покупки': '🛒', 'Цвета': '🎨',
  'Тело и здоровье': '🧍', 'Работа и профессии': '👷', 'Технологии': '💻', 'Люди': '🧑‍🤝‍🧑',
  'Общение': '💬', 'Разное': '📦',
}
const iconFor = (theme) => THEME_ICON[theme] || '📦'

export default function Sets() {
  const navigate = useNavigate()
  const { lang } = useI18nStore()
  const [sets, setSets] = useState(null)

  useEffect(() => {
    api.get('/lessons')
      .then(rows => setSets((rows || []).filter(l => l.is_set)
        .sort((a, b) => (b.words_total || 0) - (a.words_total || 0))))
      .catch(() => setSets([]))
  }, [])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 60px' }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(59,122,87,0.12))', border: '1px solid var(--line)', borderRadius: 18, padding: '22px', marginBottom: 20 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>📚 Наборы по темам</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
          Слова собраны по темам из всех уроков, без дублей. Учись по темам — под рукой и без беспорядка.
        </div>
      </div>

      {!sets && <div style={{ color: 'var(--ink-soft)' }}>Загрузка…</div>}
      {sets && sets.length === 0 && (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 14, border: '1px dashed var(--line)' }}>
          Наборы ещё собираются. Обнови страницу через минуту.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {sets?.map(s => {
          // Иконку берём по русскому ключу темы, а подпись — локализованную
          const icon = iconFor(s.set_theme)
          const theme = getLessonTitle(s.title, s.title_translations, lang) || s.set_theme || s.title
          return (
            <div key={s.id} onClick={() => navigate(`/exercise-session?lesson_id=${s.id}`)} style={{
              cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
              padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
              transition: 'border-color .15s, transform .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.transform = 'translateY(0)' }}>
              <div style={{ fontSize: 40, lineHeight: 1 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{theme}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{s.words_total || 0} слов</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
