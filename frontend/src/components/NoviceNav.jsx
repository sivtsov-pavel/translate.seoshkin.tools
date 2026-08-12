import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useI18nStore } from '../store/i18n.js'

// Навигация режима «новичок» (макет 2a, docs/design_novichok).
//
// Принцип макета: одна навигация на всех платформах — пять пунктов, ничего лишнего.
// Телефон получает таб-бар снизу, планшет и ПК — ту же пятёрку слева. Всё остальное
// (грамматика, разговорник, школа, отчёты, игры) живёт за кнопкой «Ещё»: ученику эти
// разделы нужны редко, а из-за них меню и выглядело «как для учителя».
//
// Правки Павла 12.08: «Читалка» переименована в «Переводчик» (никто не понимал, что это),
// «Наборы» подняты в основную пятёрку как важный учебный раздел, «Книги» видны в боковой
// панели, где места больше.
const MAIN = (t) => [
  { to: '/',           icon: '🛤',  label: t.path.title },
  { to: '/sets',       icon: '📚', label: t.sets.title.replace(/^[^\p{L}]+/u, '') },
  { to: '/vocabulary', icon: '📔', label: t.nav.vocabulary },
  { to: '/reader',     icon: '🌐', label: t.nav.reader },
]

// Боковая панель шире таб-бара, поэтому книги и тренер видны сразу, без «Ещё»
const SIDE_EXTRA = (t) => [
  { to: '/books',      icon: '📖', label: t.nav.books || 'Книги' },
  { to: '/ai-trainer', icon: '🤖', label: t.nav.aiTrainer || 'Тренер' },
]

const MORE = (t) => [
  { to: '/lessons',    icon: '🗂', label: t.nav.lessons },
  { to: '/books',      icon: '📖', label: t.nav.books || 'Книги' },
  { to: '/ai-trainer', icon: '🤖', label: t.nav.aiTrainer || 'Тренер' },
  { to: '/phrasebook', icon: '💬', label: t.nav.phrasebook || 'Разговорник' },
  { to: '/grammar',    icon: '📐', label: t.nav.grammar || 'Грамматика' },
  { to: '/chat',       icon: '✉️', label: t.nav.chat || 'Чат' },
  { to: '/settings',   icon: '⚙️', label: t.nav.tabSettings },
]

export default function NoviceNav() {
  const { t } = useI18nStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  const main = MAIN(t)

  return (
    <>
      {/* Телефон: таб-бар из пяти кнопок */}
      <nav className="novice-tabbar">
        {main.map(item => (
          <Link key={item.to} to={item.to} className={`novice-tab ${isActive(item.to) ? 'is-active' : ''}`}>
            <span className="novice-tab-ico">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        <button className={`novice-tab ${moreOpen ? 'is-active' : ''}`} onClick={() => setMoreOpen(v => !v)}>
          <span className="novice-tab-ico">•••</span>
          <span>{t.nav.more}</span>
        </button>
      </nav>

      {/* Планшет и ПК: та же пятёрка слева + книги и тренер, места хватает */}
      <nav className="novice-rail">
        <div className="novice-rail-inner">
          {[...main, ...SIDE_EXTRA(t)].map(item => (
            <Link key={item.to} to={item.to} className={`novice-rail-item ${isActive(item.to) ? 'is-active' : ''}`}>
              <span className="novice-rail-ico">{item.icon}</span>
              <span className="novice-rail-label">{item.label}</span>
            </Link>
          ))}
          <button className="novice-rail-item" onClick={() => setMoreOpen(true)}>
            <span className="novice-rail-ico">•••</span>
            <span className="novice-rail-label">{t.nav.more}</span>
          </button>
        </div>
      </nav>

      {/* «Ещё» — шторка снизу: разделы, нужные редко */}
      {moreOpen && (
        <>
          <div className="novice-more-overlay" onClick={() => setMoreOpen(false)} />
          <div className="novice-more-sheet">
            <div className="novice-more-handle" />
            {MORE(t).map(item => (
              <button key={item.to} className="novice-more-row"
                onClick={() => { setMoreOpen(false); navigate(item.to) }}>
                <span style={{ fontSize: 19 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
