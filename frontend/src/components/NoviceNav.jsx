import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Backpack, BookOpen, Languages, MoreHorizontal, Library, Bot,
  BookText, MessageCircle, GraduationCap, MessagesSquare, Settings, X, Compass,
} from 'lucide-react'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { AutoSpeakToggle, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'
import UiModeToggle from './UiModeToggle.jsx'

// Навигация режима «новичок» (макет 2a, docs/design_novichok).
//
// В макете каждый пункт — крупная геометрическая фигура своего цвета: круг, квадрат,
// ромб. Фигура узнаётся быстрее подписи, поэтому внизу их всего четыре (последняя —
// троеточие «Ещё»), а остальные разделы живут за ним: те же фигуры, только строкой.
//
// Иконку внутрь фигуры кладём нашу, из lucide: геометрия из макета плюс привычные
// значки приложения.
//
// Правки Павла 12.08: «Читалка» → «Переводчик» (слово никто не понимал), «Наборы»
// в основные, «Книги» видны в боковой панели, где места больше.
const SHAPE = { circle: 'circle', square: 'square', diamond: 'diamond' }

const MAIN = (t) => [
  { to: '/',           C: Home,     shape: SHAPE.circle,  tone: 'a', label: t.path.title },
  { to: '/sets',       C: Backpack, shape: SHAPE.square,  tone: 'b', label: t.sets.title.replace(/^[^\p{L}]+/u, '') },
  { to: '/vocabulary', C: BookOpen, shape: SHAPE.diamond, tone: 'c', label: t.nav.vocabulary },
]

// Боковая панель шире таб-бара — там сразу видны и переводчик, и книги, и тренер
const SIDE_EXTRA = (t) => [
  { to: '/reader',     C: Languages, shape: SHAPE.circle, tone: 'd', label: t.nav.reader },
  { to: '/books',      C: Library,   shape: SHAPE.square, tone: 'b', label: t.nav.books || 'Книги' },
  { to: '/ai-trainer', C: Bot,       shape: SHAPE.circle, tone: 'c', label: t.nav.aiTrainer || 'Тренер' },
]

const MORE = (t, isOwner) => [
  { to: '/reader',     C: Languages,      shape: SHAPE.circle,  tone: 'd', label: t.nav.reader },
  { to: '/books',      C: Library,        shape: SHAPE.square,  tone: 'b', label: t.nav.books || 'Книги' },
  { to: '/ai-trainer', C: Bot,            shape: SHAPE.circle,  tone: 'c', label: t.nav.aiTrainer || 'Тренер' },
  // «Уроки» показываем только учителю: ученик видит их как второй путь и начинает
  // проходить задания оттуда, мимо дороги на главной.
  ...(isOwner ? [{ to: '/lessons', C: BookText, shape: SHAPE.square, tone: 'a', label: t.nav.lessons }] : []),
  { to: '/phrasebook', C: MessageCircle,  shape: SHAPE.diamond, tone: 'c', label: t.nav.phrasebook || 'Разговорник' },
  { to: '/grammar',    C: GraduationCap,  shape: SHAPE.square,  tone: 'd', label: t.nav.grammar || 'Грамматика' },
  { to: '/chat',       C: MessagesSquare, shape: SHAPE.circle,  tone: 'b', label: t.nav.chat || 'Чат' },
  { to: '/settings',   C: Settings,       shape: SHAPE.square,  tone: 'c', label: t.nav.tabSettings },
]

// Фигура с иконкой внутри. Ромб поворачиваем, иконку внутри — обратно,
// иначе она ляжет боком.
function Shape({ C, shape, tone, size = 'md', active = false }) {
  const px = size === 'lg' ? 46 : size === 'sm' ? 34 : 40
  const icon = size === 'lg' ? 22 : size === 'sm' ? 17 : 19
  return (
    <span className={`nv-shape nv-shape--${shape} nv-tone-${tone} ${active ? 'is-active' : ''}`}
      style={{ width: px, height: px }}>
      <span className={shape === SHAPE.diamond ? 'nv-shape-inner nv-shape-inner--diamond' : 'nv-shape-inner'}>
        <C size={icon} strokeWidth={2} />
      </span>
    </span>
  )
}

export default function NoviceNav() {
  const { t } = useI18nStore()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'owner'
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const isActive = (to) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  const main = MAIN(t)

  return (
    <>
      {/* Телефон: четыре крупные кнопки, последняя — троеточие «Ещё» */}
      <nav className="novice-tabbar novice-tabbar--4">
        {main.map(item => (
          <Link key={item.to} to={item.to} className={`novice-tab ${isActive(item.to) ? 'is-active' : ''}`}>
            <Shape C={item.C} shape={item.shape} tone={item.tone} active={isActive(item.to)} />
            <span>{item.label}</span>
          </Link>
        ))}
        <button className={`novice-tab ${moreOpen ? 'is-active' : ''}`} onClick={() => setMoreOpen(v => !v)}>
          <Shape C={MoreHorizontal} shape={SHAPE.circle} tone="e" active={moreOpen} />
          <span>{t.nav.more}</span>
        </button>
      </nav>

      {/* Планшет и ПК: те же фигуры слева */}
      <nav className="novice-rail">
        <div className="novice-rail-inner">
          {[...main, ...SIDE_EXTRA(t)].map(item => (
            <Link key={item.to} to={item.to} className={`novice-rail-item ${isActive(item.to) ? 'is-active' : ''}`}>
              <Shape C={item.C} shape={item.shape} tone={item.tone} active={isActive(item.to)} />
              <span className="novice-rail-label">{item.label}</span>
            </Link>
          ))}
          <button className="novice-rail-item" onClick={() => setMoreOpen(true)}>
            <Shape C={MoreHorizontal} shape={SHAPE.circle} tone="e" />
            <span className="novice-rail-label">{t.nav.more}</span>
          </button>

          {/* Низ панели: настройки, тур и тумблер режима. На компьютере старая шапка
              не показывается, и без этого блока переключиться обратно в «эксперта»
              было нечем. */}
          <div className="novice-rail-bottom">
            <Link to="/settings" className={`novice-rail-item ${isActive('/settings') ? 'is-active' : ''}`}>
              <Shape C={Settings} shape={SHAPE.square} tone="e" active={isActive('/settings')} />
              <span className="novice-rail-label">{t.nav.tabSettings}</span>
            </Link>
            <button className="novice-rail-item" onClick={() => window.dispatchEvent(new CustomEvent('dl-start-tour'))}>
              <Shape C={Compass} shape={SHAPE.circle} tone="d" />
              <span className="novice-rail-label">{t.nav.tourApp || 'Тур'}</span>
            </button>
            <div className="novice-rail-mode"><UiModeToggle compact /></div>
          </div>
        </div>
      </nav>

      {/* «Ещё» — крупные строки с теми же фигурами */}
      {moreOpen && (
        <>
          <div className="novice-more-overlay" onClick={() => setMoreOpen(false)} />
          <div className="novice-more-sheet">
            {/* Крестик обязателен: свайпа вниз у шторки нет, и закрыть её можно было
                только тычком мимо — Павел на этом и споткнулся. */}
            <button className="novice-more-close" onClick={() => setMoreOpen(false)} aria-label="✕">
              <X size={20} />
            </button>
            <div className="novice-more-handle" />

            {/* Озвучка — сюда, а не в дальние настройки: этими двумя тумблерами
                пользуются во время занятия, а не раз в жизни. */}
            <div className="novice-more-sound">
              <AutoSpeakToggle pill />
              <SpeakTranslationToggle />
            </div>

            {MORE(t, isOwner).map(item => (
              <button key={item.to} className="novice-more-row"
                onClick={() => { setMoreOpen(false); navigate(item.to) }}>
                <Shape C={item.C} shape={item.shape} tone={item.tone} size="lg" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
