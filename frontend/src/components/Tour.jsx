import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18nStore } from '../store/i18n.js'
import { useAuthStore } from '../store/auth.js'
import { useUiModeStore } from '../store/uiMode.js'
import tourStrings from '../i18n/tour.json'

// Онбординг-тур по всей системе. Простым, тёплым языком — для детей и взрослых,
// которые не дружат с технологиями. Подсвечивает ТОЛЬКО видимые элементы; для шагов
// по разделам сам открывает меню. Запуск — кнопкой 🧭 в любой момент + раз при первом входе.

// Первый ВИДИМЫЙ элемент из списка селекторов (пропускаем скрытые копии: сайдбар/шторка/полоса)
function visibleEl(sels) {
  const W = window.innerWidth, H = window.innerHeight
  for (const sel of (sels || [])) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      const onScreen = r.width > 4 && r.height > 4 && r.right > 4 && r.left < W - 4 && r.bottom > 0 && r.top < H
      const cs = getComputedStyle(el)
      if (onScreen && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null) return el
    }
  }
  return null
}

export default function Tour({ onClose, onMenu }) {
  const { lang } = useI18nStore()
  const { user } = useAuthStore()
  const novice = useUiModeStore(s => s.resolve)(user) === 'novice'
  const T = tourStrings[lang] || tourStrings.ru

  // Селектор пункта МЕНЮ строго внутри шторки/сайдбара (а не одноимённой ссылки в топбаре/нижней панели)
  const M = (href) => [`.layout-drawer a[href="${href}"]`, `.layout-sidebar a[href="${href}"]`]

  // Разделы за кнопкой «Ещё» у новичка: строка в шторке или пункт боковой панели на ПК
  const NM = (href) => [`.novice-more-sheet [href="${href}"]`, `.novice-more-row[data-to="${href}"]`, `.novice-rail a[href="${href}"]`]

  // Тур для УЧЕНИКА (режим новичка). Отдельный, потому что учительский рассказывает
  // про шторку, сайдбар, камеру, смену курса и расписание — ничего этого у ученика
  // на экране нет, и его шаги молча пропускались: вместо тура оставался огрызок.
  // Здесь ведём по тому, что ученик видит: дорога, станции, четыре кнопки, тренер.
  const noviceSteps = [
    { center: true, title: T.welcomeTitle, text: T.nvWelcomeText || T.welcomeText },
    { sels: ['[data-current-node]', '.path-road'], title: T.nvRoadTitle || '🧵 Твоя дорога', text: T.nvRoadText || 'Уроки идут дорожкой, как тропинка. Кружок с огоньком — то, что нужно пройти сейчас. Прошёл — загорится галочка ✓, и откроется следующий.' },
    { sels: ['.path-road'], title: T.nvStationTitle || '🎤 Станции по пути', text: T.nvStationText || 'Между уроками стоят станции: проговорить слова, потренировать грамматику, собрать набор фраз. Они короткие — на пару минут, зато речь и правила подтягиваются сами.' },
    { sels: ['.path-top-tiles'], title: T.nvStatsTitle || '🔥 Серия и очки', text: T.nvStatsText || 'Сверху три кружка: сколько дней подряд ты занимаешься, очки за сегодня и пройденные уроки. Занимайся хоть по пять минут в день — серия не прервётся.' },
    { sels: ['.novice-tabbar', '.novice-rail'], title: T.nvNavTitle || '👇 Четыре кнопки', text: T.nvNavText || 'Внизу всё управление: дорога, словарь, переводчик и «Ещё». Больше ничего искать не нужно — это весь интерфейс.' },
    { sels: ['.novice-fab', '.novice-fab-desktop'], title: T.nvFabTitle || '🤖 Тренер Pablo', text: T.nvFabText || 'Круглая кнопка посередине — твой личный тренер. Говори с ним голосом или пиши: он ответит на изучаемом языке и мягко поправит. Как учитель, только всегда под рукой.' },
    { sels: ['.novice-tabbar a[href="/vocabulary"]', '.novice-rail a[href="/vocabulary"]'], title: T.vocabTitle, text: T.nvVocabText || T.vocabText },
    { sels: ['.novice-tabbar a[href="/reader"]', '.novice-rail a[href="/reader"]'], title: T.nvReaderTitle || '🌍 Переводчик', text: T.nvReaderText || 'Вставь сюда любой текст на изучаемом языке. Не понял слово — нажми на него пальцем: покажет перевод и прочитает вслух.' },
    { sels: ['.novice-tab--more'], title: T.nvMoreTitle || '⋯ Кнопка «Ещё»', text: T.nvMoreText || 'Остальное спрятано сюда, чтобы не мешало: наборы слов, книги, разговорник, грамматика, чат и настройки. Нажми — выедет снизу.' },
    { menu: true, sels: ['.novice-more-sound'], title: T.nvSoundTitle || '🔊 Озвучка', text: T.nvSoundText || 'Прямо в этой шторке два переключателя: читать слова вслух самому и озвучивать перевод. Они тут, а не в дальних настройках, потому что нужны прямо во время занятия.' },
    { menu: true, sels: NM('/sets'), title: T.setsNavTitle, text: T.setsNavText },
    { menu: true, sels: NM('/books'), title: T.booksTitle, text: T.nvBooksText || T.booksText },
    { menu: true, sels: NM('/grammar'), title: T.grammarTitle, text: T.grammarText },
    { menu: true, sels: NM('/settings'), title: T.profileTitle, text: T.nvSettingsText || 'Тема, язык приложения, размер шрифта, голос озвучки и установка приложения на телефон. Там же переключатель «новичок / эксперт»: эксперт показывает полный интерфейс со всеми разделами — но начинать удобнее так, как сейчас.' },
    { center: true, title: T.nvEndTitle || '🎉 Всё, ты готов!', text: T.nvEndText || 'Начни с горящего кружка на дороге — дальше приложение само подскажет, что делать. Захочешь пройти тур ещё раз — он в настройках. Удачи!' },
  ]

  // menu:true — шаг по разделу (тур сам откроет меню). center:true — карточка по центру без подсветки.
  const expertSteps = [
    { center: true, title: T.welcomeTitle || 'Привет! 👋', text: T.welcomeText || 'Давай я за минутку покажу, где что находится. Ничего сложного — просто нажимай «Далее».' },
    { sels: ['.layout-hamburger', '.layout-sidebar'], title: T.menuTitle || 'Главное меню', text: T.menuText || 'Отсюда открываются все разделы. На телефоне — кнопка с тремя палочками ☰ слева вверху. Нажал — выехало меню.' },
    { menu: true, sels: M('/'), title: T.todayTitle || '🏠 Сегодня', text: T.todayText || 'Главная страница. Тут твои уроки и задания на сегодня — с чего начинать, видно сразу.' },
    { sels: ['[data-tour="change-course"]'], title: T.courseTitle || '🌍 Выбор курса', text: T.courseText || 'Учишь несколько языков? Нажми «Сменить курс» — переключишься между немецким, испанским, английским. Уроки, словарь, цифры и алфавит будут на языке курса.' },
    { sels: ['[data-tour="schedule"]'], title: T.scheduleTitle || '📅 Расписание уроков', text: T.scheduleText || 'Для нового курса можно задать расписание — по каким дням открывать новые уроки, чтобы учиться в удобном ритме.' },
    { menu: true, sels: M('/sets'), title: T.setsNavTitle || '🎒 Наборы', text: T.setsNavText || 'Тематические подборки слов — еда, город, дом и другие темы. Удобно, когда хочешь потренировать что-то одно.' },
    { menu: true, sels: M('/vocabulary'), title: T.vocabTitle || '📖 Словарь', text: T.vocabText || 'Все слова, которые ты учишь. Можно послушать, как они звучат, и повторить.' },
    { menu: true, sels: M('/ai-trainer'), title: T.trainerTitle || '🤖 AI-тренер Pablo', text: T.trainerText || 'Твой личный помощник Pablo. Говори с ним голосом или пиши — он ответит по-немецки и мягко поправит, если ошибся. Как живой учитель, только всегда рядом.' },
    { menu: true, sels: M('/reader'), title: T.readerTitle || '👓 Читалка', text: T.readerText || 'Читай тексты на изучаемом языке. Не понял слово? Просто нажми на него пальцем — покажет перевод и озвучит.' },
    { menu: true, sels: M('/books'), title: T.booksTitle || '📚 Книги', text: T.booksText || 'Книги, которые дал учитель. Приложение запоминает, где ты остановился — вернёшься и продолжишь с того же места.' },
    { menu: true, sels: M('/phrasebook'), title: T.phraseTitle || '💬 Разговорник', text: T.phraseText || 'Готовые полезные фразы на каждый день — чтобы сразу заговорить, а не искать слова.' },
    { menu: true, sels: M('/grammar'), title: T.grammarTitle || '🎓 Грамматика', text: T.grammarText || 'Правила языка — простыми словами и с цветными табличками. Понятно даже без учителя.' },
    { menu: true, sels: M('/love'), title: T.loveTitle || '❤️ Любовь к детям', text: T.loveText || 'Тёплые, ласковые фразы, чтобы говорить своим детям добрые слова на новом языке.' },
    { sels: ['.dl-metrics'], title: T.progressTitle || '📈 Твой прогресс', text: T.progressText || 'Тут видно, сколько уроков ты прошёл и сколько слов выучил. Полоски растут каждый день — приятно наблюдать!' },
    { sels: ['.dl-path'], title: T.pathTitle || '🧵 Путь уроков', text: T.pathText || 'Уроки идут дорожкой, как тропинка в парке. Нажми на кружок — откроется урок с заданиями. Пройдёшь — загорится галочка ✓.' },
    { sels: ['.dl-features'], title: T.gamesTitle || '🎮 Игры и тренер', text: T.gamesText || 'Учиться можно играя: выбери ответ, карточки, кроссворд, найди пару. Так слова запоминаются легче.' },
    { sels: ['.dl-fab-camera'], title: T.cameraTitle || '📷 Камера', text: T.cameraText || 'Сфотографируй слова из учебника или тетради — приложение само их прочитает, переведёт и добавит в урок. Ничего печатать не надо.' },
    { center: true, title: T.teacherTitle || '🛠️ Учителю и ученику', text: T.teacherText || 'Внутри урока учитель может перегенерировать задания и добавить слова с фото. А ученик после каждого блока упражнений (выбери ответ → буква → пропуск → предложение → проговори → склонение → диктант) видит выбор: продолжить, сменить тип или позвать тренера — чтобы не бросать на полпути.' },
    { sels: ['[aria-label="Профиль"]', '.layout-sidebar'], title: T.profileTitle || '👤 Профиль и настройки', text: T.profileText || 'Твоя кнопка справа вверху. Там светлая или тёмная тема, язык приложения, размер шрифта, озвучка и другие настройки профиля, а также выход.' },
    { sels: ['[aria-label="Тур"]'], title: T.againTitle || '🧭 Повторить тур', text: T.againText || 'Захочешь пройти этот тур ещё раз — нажми на компас 🧭 вверху в любой момент. Всё, ты готов! Удачи в учёбе! 🎉' },
  ]

  const steps = novice ? noviceSteps : expertSteps

  // «Меню» у каждого режима своё: у учителя выезжает шторка Layout, у новичка —
  // панель «Ещё», живущая внутри NoviceNav, поэтому её открываем событием.
  const openMenu = useCallback((open) => {
    if (novice) window.dispatchEvent(new CustomEvent('dl-novice-more', { detail: { open } }))
    else onMenu?.(open)
  }, [novice]) // eslint-disable-line

  const [i, setI] = useState(-1)
  const [rect, setRect] = useState(null) // прямоугольник элемента или 'center'
  const timers = useRef([])
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  // Перейти к шагу idx в направлении dir (пропуская недоступные)
  const go = useCallback((idx, dir = 1) => {
    clearTimers()
    if (idx < 0 || idx >= steps.length) { onClose?.(); return }
    const step = steps[idx]
    openMenu(!!step.menu)
    timers.current.push(setTimeout(() => {
      if (step.center) { setI(idx); setRect('center'); return }
      const el = visibleEl(step.sels)
      if (!el) { go(idx + dir, dir); return } // элемента нет на этой странице → пропускаем
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      timers.current.push(setTimeout(() => { setI(idx); setRect(el.getBoundingClientRect()) }, 240))
    }, step.menu ? 400 : 160))
  }, []) // eslint-disable-line

  // При закрытии тура шторку «Ещё» гасим сами: её открывал тур, а не ученик,
  // и оставленная нараспашку она перекрывает дорогу.
  useEffect(() => {
    go(0)
    return () => { clearTimers(); if (novice) openMenu(false) }
  }, []) // eslint-disable-line

  // Перемер при скролле/ресайзе
  useEffect(() => {
    const on = () => {
      const step = steps[i]
      if (!step || step.center) return
      const el = visibleEl(step.sels)
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', on)
    window.addEventListener('scroll', on, true)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true) }
  }, [i]) // eslint-disable-line

  if (i < 0 || !rect) return null
  const isCenter = rect === 'center'
  const isLast = i >= steps.length - 1

  // Позиция карточки. Шаги по меню — карточку ставим ВНИЗУ по центру, чтобы не висела над шторкой.
  const isMenu = !isCenter && steps[i].menu
  let card
  if (isCenter) {
    card = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  } else if (isMenu) {
    // У новичка шторка «Ещё» выезжает снизу и накрыла бы карточку, поэтому её —
    // наверх. У учителя меню сбоку, и низ остаётся свободным.
    card = novice
      ? { top: 16, left: '50%', transform: 'translateX(-50%)' }
      : { bottom: 'calc(var(--bottom-nav-h, 0px) + 20px)', left: '50%', transform: 'translateX(-50%)' }
  } else {
    const below = rect.bottom + 210 < window.innerHeight
    card = {
      top: below ? rect.bottom + 14 : Math.max(12, rect.top - 190),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500 }}>
      {/* Ловец кликов: тап по фону не проваливается в меню/оверлей под туром */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={e => e.stopPropagation()} />
      {isCenter
        ? <div style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,14,0.62)' }} />
        : <div style={{ position: 'absolute', top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16, borderRadius: 14, boxShadow: '0 0 0 4000px rgba(20,18,14,0.62), 0 0 0 3px var(--blue)', transition: 'all .25s ease', pointerEvents: 'none' }} />}

      <div style={{ position: 'absolute', ...card, width: 290, maxWidth: 'calc(100vw - 24px)', background: 'var(--surface)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 16px 40px rgba(0,0,0,0.35)', border: '1px solid var(--line)' }}>
        {/* Крестик закрыть */}
        <button onClick={onClose} aria-label="Закрыть тур" style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--surface-2)', color: 'var(--ink-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>✕</button>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', paddingRight: 30 }}>
          {steps.map((s, k) => <span key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: k === i ? 'var(--blue)' : 'var(--line)' }} />)}
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--ink)', fontFamily: 'var(--heading-font)' }}>{steps[i].title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{steps[i].text}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 12.5, cursor: 'pointer' }}>{T.skip || 'Пропустить'}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {i > 0 && <button onClick={() => go(i - 1, -1)} style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{T.back || 'Назад'}</button>}
            <button onClick={() => go(i + 1, 1)} style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{isLast ? (T.done || 'Готово') : (T.next || 'Далее')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
