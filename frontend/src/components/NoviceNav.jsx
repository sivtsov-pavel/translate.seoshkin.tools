import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Backpack, BookOpen, Languages, MoreHorizontal, Library, Bot,
  BookText, MessageCircle, GraduationCap, MessagesSquare, Settings, X,
} from 'lucide-react'
import { useI18nStore } from '../store/i18n.js'
import { AutoSpeakToggle, SpeakTranslationToggle } from '../hooks/useSpeech.jsx'

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
  { to: '/',           C: Home,      label: t.path.title },
  { to: '/sets',       C: Backpack,  label: t.sets.title.replace(/^[^\p{L}]+/u, '') },
  { to: '/vocabulary', C: BookOpen,  label: t.nav.vocabulary },
  { to: '/reader',     C: Languages, label: t.nav.reader },
]

// Боковая панель шире таб-бара, поэтому книги и тренер видны сразу, без «Ещё»
const SIDE_EXTRA = (t) => [
  { to: '/books',      C: Library, label: t.nav.books || 'Книги' },
  { to: '/ai-trainer', C: Bot,     label: t.nav.aiTrainer || 'Тренер' },
]

const MORE = (t) => [
  { to: '/lessons',    C: BookText,       label: t.nav.lessons },
  { to: '/books',      C: Library,        label: t.nav.books || 'Книги' },
  { to: '/ai-trainer', C: Bot,            label: t.nav.aiTrainer || 'Тренер' },
  { to: '/phrasebook', C: MessageCircle,  label: t.nav.phrasebook || 'Разговорник' },
  { to: '/grammar',    C: GraduationCap,  label: t.nav.grammar || 'Грамматика' },
  { to: '/chat',       C: MessagesSquare, label: t.nav.chat || 'Чат' },
  { to: '/settings',   C: Settings,       label: t.nav.tabSettings },
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
            <span className="novice-tab-ico"><item.C size={20} strokeWidth={1.9} /></span>
            <span>{item.label}</span>
          </Link>
        ))}
        <button className={`novice-tab ${moreOpen ? 'is-active' : ''}`} onClick={() => setMoreOpen(v => !v)}>
          <span className="novice-tab-ico"><MoreHorizontal size={20} strokeWidth={1.9} /></span>
          <span>{t.nav.more}</span>
        </button>
      </nav>

      {/* Планшет и ПК: та же пятёрка слева + книги и тренер, места хватает */}
      <nav className="novice-rail">
        <div className="novice-rail-inner">
          {[...main, ...SIDE_EXTRA(t)].map(item => (
            <Link key={item.to} to={item.to} className={`novice-rail-item ${isActive(item.to) ? 'is-active' : ''}`}>
              <span className="novice-rail-ico"><item.C size={21} strokeWidth={1.9} /></span>
              <span className="novice-rail-label">{item.label}</span>
            </Link>
          ))}
          <button className="novice-rail-item" onClick={() => setMoreOpen(true)}>
            <span className="novice-rail-ico"><MoreHorizontal size={21} strokeWidth={1.9} /></span>
            <span className="novice-rail-label">{t.nav.more}</span>
          </button>
        </div>
      </nav>

      {/* «Ещё» — шторка снизу: разделы, нужные редко */}
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
            {MORE(t).map(item => (
              <button key={item.to} className="novice-more-row"
                onClick={() => { setMoreOpen(false); navigate(item.to) }}>
                <item.C size={19} strokeWidth={1.9} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
