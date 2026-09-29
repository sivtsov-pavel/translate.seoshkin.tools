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

// Метка пройденности плитки. Одна на обе вкладки: у наборов слов и фраз она
// обязана выглядеть одинаково, иначе ученик решит, что это разные вещи.
//
// Три состояния, а не два: «не начинал» (полоски нет вовсе), «в работе»
// (полоска с долей) и «пройден» (галочка). Без среднего состояния набор,
// открытый наполовину, выглядит как нетронутый — ровно та потеря ориентира,
// на которую жалуется Павел.
function SetProgress({ done, total }) {
  if (!total) return null
  const complete = done >= total
  const ratio = Math.min(1, done / total)
  return (
    <div style={{ width: '100%', marginTop: 2 }}>
      <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 999,
          background: complete ? 'var(--good, #3BA55D)' : 'var(--accent)' }} />
      </div>
      <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 700,
        color: complete ? 'var(--good, #3BA55D)' : 'var(--ink-soft)' }}>
        {complete ? '✓ ' : ''}{done}/{total}
      </div>
    </div>
  )
}

// Галочка в углу плитки — видна одним взглядом по сетке, не вчитываясь в цифры
function DoneBadge() {
  return (
    <div style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: '50%',
      background: 'var(--good, #3BA55D)', color: '#fff', fontSize: 13, fontWeight: 800,
      display: 'grid', placeItems: 'center', lineHeight: 1 }}>✓</div>
  )
}

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
            {topics?.map(topic => (
              <div key={topic.id} onClick={() => navigate(`/phrases/${topic.id}`)} style={{
                position: 'relative',
                cursor: 'pointer', background: 'var(--surface)', borderRadius: 16,
                border: `1px solid ${topic.total && topic.done >= topic.total ? 'var(--good, #3BA55D)' : 'var(--line)'}`,
                padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
              }}>
                {topic.total > 0 && topic.done >= topic.total && <DoneBadge />}
                <div style={{ fontSize: 40, lineHeight: 1 }}>{topic.emoji || '🗣'}</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{topic.title}</div>
                {topic.title_local && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{topic.title_local}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{topic.level}</div>
                <SetProgress done={topic.done} total={topic.total} />
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
      <div style={{ display: tab === 'words' ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
        {sets?.map(s => {
          // Иконку берём по русскому ключу темы, а подпись — локализованную
          const icon = iconFor(s.set_theme)
          const theme = getLessonTitle(s.title, s.title_translations, lang) || s.set_theme || s.title
          const exDone = s.exercises_done || 0
          const exTotal = s.exercises_total || 0
          const complete = exTotal > 0 && exDone >= exTotal
          const edge = complete ? 'var(--good, #3BA55D)' : 'var(--line)'
          return (
            <div key={s.id} onClick={() => navigate(`/exercise-session?lesson_id=${s.id}`)} style={{
              position: 'relative',
              cursor: 'pointer', background: 'var(--surface)', border: `1px solid ${edge}`, borderRadius: 16,
              padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
              transition: 'border-color .15s, transform .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = edge; e.currentTarget.style.transform = 'translateY(0)' }}>
              {complete && <DoneBadge />}
              <div style={{ fontSize: 40, lineHeight: 1 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{theme}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t.vocabulary.wordsCount(s.words_total || 0)}</div>
              <SetProgress done={exDone} total={exTotal} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
