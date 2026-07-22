import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18nStore } from '../store/i18n.js'

// Онбординг-тур по всей системе. Простым, тёплым языком — для детей и взрослых,
// которые не дружат с технологиями. Подсвечивает ТОЛЬКО видимые элементы; для шагов
// по разделам сам открывает меню. Запуск — кнопкой 🧭 в любой момент + раз при первом входе.

// Первый ВИДИМЫЙ элемент из списка селекторов (пропускаем скрытые копии: сайдбар/шторка/полоса)
function visibleEl(sels) {
  for (const sel of (sels || [])) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      if (el.offsetParent !== null && r.width > 4 && r.height > 4) return el
    }
  }
  return null
}

export default function Tour({ onClose, onMenu }) {
  const { t } = useI18nStore()
  const T = t.tour || {}

  // menu:true — шаг по разделу (тур сам откроет меню). center:true — карточка по центру без подсветки.
  const steps = [
    { center: true, title: T.welcomeTitle || 'Привет! 👋', text: T.welcomeText || 'Давай я за минутку покажу, где что находится. Ничего сложного — просто нажимай «Далее».' },
    { sels: ['.layout-hamburger', '.layout-sidebar'], title: T.menuTitle || 'Главное меню', text: T.menuText || 'Отсюда открываются все разделы. На телефоне — кнопка с тремя палочками ☰ слева вверху. Нажал — выехало меню.' },
    { menu: true, sels: ['a[href="/"]'], title: T.todayTitle || '🏠 Сегодня', text: T.todayText || 'Главная страница. Тут твои уроки и задания на сегодня — с чего начинать, видно сразу.' },
    { menu: true, sels: ['a[href="/vocabulary"]'], title: T.vocabTitle || '📖 Словарь', text: T.vocabText || 'Все слова, которые ты учишь. Можно послушать, как они звучат, и повторить.' },
    { menu: true, sels: ['a[href="/ai-trainer"]'], title: T.trainerTitle || '🤖 AI-тренер Pablo', text: T.trainerText || 'Твой личный помощник Pablo. Говори с ним голосом или пиши — он ответит по-немецки и мягко поправит, если ошибся. Как живой учитель, только всегда рядом.' },
    { menu: true, sels: ['a[href="/reader"]'], title: T.readerTitle || '👓 Читалка', text: T.readerText || 'Читай тексты на изучаемом языке. Не понял слово? Просто нажми на него пальцем — покажет перевод и озвучит.' },
    { menu: true, sels: ['a[href="/books"]'], title: T.booksTitle || '📚 Книги', text: T.booksText || 'Книги, которые дал учитель. Приложение запоминает, где ты остановился — вернёшься и продолжишь с того же места.' },
    { menu: true, sels: ['a[href="/phrasebook"]'], title: T.phraseTitle || '💬 Разговорник', text: T.phraseText || 'Готовые полезные фразы на каждый день — чтобы сразу заговорить, а не искать слова.' },
    { menu: true, sels: ['a[href="/grammar"]'], title: T.grammarTitle || '🎓 Грамматика', text: T.grammarText || 'Правила языка — простыми словами и с цветными табличками. Понятно даже без учителя.' },
    { menu: true, sels: ['a[href="/love"]'], title: T.loveTitle || '❤️ Любовь к детям', text: T.loveText || 'Тёплые, ласковые фразы, чтобы говорить своим детям добрые слова на новом языке.' },
    { sels: ['.dl-metrics'], title: T.progressTitle || '📈 Твой прогресс', text: T.progressText || 'Тут видно, сколько уроков ты прошёл и сколько слов выучил. Полоски растут каждый день — приятно наблюдать!' },
    { sels: ['.dl-path'], title: T.pathTitle || '🧵 Путь уроков', text: T.pathText || 'Уроки идут дорожкой, как тропинка в парке. Нажми на кружок — откроется урок с заданиями. Пройдёшь — загорится галочка ✓.' },
    { sels: ['.dl-features'], title: T.gamesTitle || '🎮 Игры и тренер', text: T.gamesText || 'Учиться можно играя: выбери ответ, карточки, кроссворд, найди пару. Так слова запоминаются легче.' },
    { sels: ['.dl-fab-camera'], title: T.cameraTitle || '📷 Камера', text: T.cameraText || 'Сфотографируй слова из учебника или тетради — приложение само их прочитает, переведёт и добавит в урок. Ничего печатать не надо.' },
    { sels: ['[aria-label="Профиль"]', '.layout-sidebar'], title: T.profileTitle || '👤 Профиль и настройки', text: T.profileText || 'Твоя кнопка справа вверху. Там светлая или тёмная тема, язык приложения, настройки и выход.' },
    { sels: ['[aria-label="Тур"]'], title: T.againTitle || '🧭 Повторить тур', text: T.againText || 'Захочешь пройти этот тур ещё раз — нажми на компас 🧭 вверху в любой момент. Всё, ты готов! Удачи в учёбе! 🎉' },
  ]

  const [i, setI] = useState(-1)
  const [rect, setRect] = useState(null) // прямоугольник элемента или 'center'
  const timers = useRef([])
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  // Перейти к шагу idx в направлении dir (пропуская недоступные)
  const go = useCallback((idx, dir = 1) => {
    clearTimers()
    if (idx < 0 || idx >= steps.length) { onClose?.(); return }
    const step = steps[idx]
    onMenu?.(!!step.menu)
    timers.current.push(setTimeout(() => {
      if (step.center) { setI(idx); setRect('center'); return }
      const el = visibleEl(step.sels)
      if (!el) { go(idx + dir, dir); return } // элемента нет на этой странице → пропускаем
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      timers.current.push(setTimeout(() => { setI(idx); setRect(el.getBoundingClientRect()) }, 240))
    }, step.menu ? 400 : 160))
  }, []) // eslint-disable-line

  useEffect(() => { go(0); return clearTimers }, []) // eslint-disable-line

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

  // Позиция карточки
  let card
  if (isCenter) {
    card = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
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

      <div style={{ position: 'absolute', ...card, width: 290, background: 'var(--surface)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 16px 40px rgba(0,0,0,0.35)', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
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
