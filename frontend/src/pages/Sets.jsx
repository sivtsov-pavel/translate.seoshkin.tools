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
  const t = useI18nStore(s => s.t)
  const navigate = useNavigate()
  const { lang } = useI18nStore()
  const [sets, setSets] = useState(null)
  // Два вида наборов на одной странице: слова по темам и фразы. Отдельный раздел
  // заводить не стали — учить и то и другое ученик приходит в одно место.
  const [tab, setTab] = useState('words')
  const [topics, setTopics] = useState(null)

  useEffect(() => {
    api.get('/lessons')
      .then(rows => setSets((rows || []).filter(l => l.is_set)
        .sort((a, b) => (b.words_total || 0) - (a.words_total || 0))))
      .catch(() => setSets([]))
  }, [])

  useEffect(() => {
    if (tab !== 'phrases' || topics) return
    api.get(`/phrase-topics?lang=${lang}`).then(setTopics).catch(() => setTopics([]))
  }, [tab, lang])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '18px 16px 60px' }}>
      <div style={{ background: 'linear-gradient(135deg, rgba(124,92,255,0.16), rgba(59,122,87,0.12))', border: '1px solid var(--line)', borderRadius: 18, padding: '22px', marginBottom: 20 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>{t.sets.title}</div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: 4 }}>
          Слова собраны по темам из всех уроков, без дублей. Учись по темам — под рукой и без беспорядка.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[['words', `📚 ${t.sets.tabWords}`], ['phrases', `🗣 ${t.sets.tabPhrases}`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 14,
              border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--line)'}`,
              background: tab === key ? 'var(--accent)' : 'var(--surface)',
              color: tab === key ? 'var(--accent-ink)' : 'var(--ink-soft)',
            }}>{label}</button>
        ))}
      </div>

      {tab === 'phrases' && (
        <>
          {!topics && <div style={{ color: 'var(--ink-soft)' }}>{t.common.loading}</div>}
          {topics && topics.length === 0 && (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 14, border: '1px dashed var(--line)' }}>
              {t.phrases.empty}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
            {topics?.map(topic => (
              <div key={topic.id} onClick={() => navigate(`/phrases/${topic.id}`)} style={{
                cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
                padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>{topic.emoji || '🗣'}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{topic.title}</div>
                {topic.title_local && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{topic.title_local}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {topic.level} · {topic.done}/{topic.total}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'words' && !sets && <div style={{ color: 'var(--ink-soft)' }}>{t.common.loading}</div>}
      {tab === 'words' && sets && sets.length === 0 && (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-soft)', background: 'var(--surface-2)', borderRadius: 14, border: '1px dashed var(--line)' }}>
          Наборы ещё собираются. Обнови страницу через минуту.
        </div>
      )}
      <div style={{ display: tab === 'words' ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
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
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t.vocabulary.wordsCount(s.words_total || 0)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
