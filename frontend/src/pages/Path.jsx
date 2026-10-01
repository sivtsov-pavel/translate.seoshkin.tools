import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Puzzle, Layers, CheckCircle2, Gamepad2, SquarePen, Map, Check, Lock, BookMarked, Flame, Zap, Gem } from 'lucide-react'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getLessonTitle } from '../utils/translation.js'
import { useIntroStore } from '../store/intro.js'
import { speak, speakAuto, uiLocale } from '../hooks/useSpeech.jsx'
import { roadPath, layoutNodes, splitRoadBySections, NODE_SIZE } from './path/road.js'
import { RoadNode, TypeIcon, TYPE_COLOR } from './path/nodes.jsx'
import { useViewport } from './path/useViewport.js'

// Экран «Путь» (режим новичка) — карта уроков по макету docs/maket-home.
//
// Одна извилистая дорога сверху вниз, разбитая на главы-разделы: пройденная глава сворачивается
// в полосу, текущая раскрыта, будущая заперта. Так дорога на 49 уроков перестаёт быть лентой без
// единой точки, где можно сказать «эту часть я закончил».
//
// Макет был нарисован для ПК и планшета, мобильную карту хендофф велел не трогать. Павел решил
// иначе (01.10.2026): «натяни его на все версии». Поэтому компоненты узлов, разделов и карточки
// общие для всех ширин, а меняются только размеры колонки и место карточки урока — на телефоне
// рядом с узлом её разместить негде, и она раскрывается под ним.
//
// Вся механика тапов осталась прежней: она выстрадана жалобами и переписыванию не подлежит
// (05.09, 06.09, 09.09.2026) — см. комментарии у selected, прокрутки и подсказки.

export default function Path() {
  const navigate = useNavigate()
  const { t, lang } = useI18nStore()
  const vp = useViewport()
  const [data, setData] = useState(null)
  const [games, setGames] = useState([])          // готовые классные игры — как в полном интерфейсе
  // Первое знакомство: что нажать и по каким дням учиться. Показываем один раз —
  // отметку держим и на устройстве (чтобы не мигало до ответа сервера), и на сервере
  // (флаг is_default у расписания гаснет, как только человек ответил).
  const introOpen = useIntroStore(s => s.open)
  const setIntroOpen = useIntroStore(s => s.setOpen)
  const [introBusy, setIntroBusy] = useState(false)

  // Тап по узлу раскрывает его, а не проваливает в упражнение: карта должна быть
  // интерактивной — сначала видно, что внутри станции, и уже оттуда выбираешь.
  // Ключ выбранного узла. Три состояния, и это важно:
  //   undefined — ещё ничего не трогали, карточку показываем у текущего урока;
  //   <ключ>    — раскрыт этот узел;
  //   null      — человек ЗАКРЫЛ карточку, не показываем ничего.
  // Пока «закрыто» и «не трогали» были одним и тем же null, повторный тап по текущему
  // уроку закрывал карточку и тут же открывал её заново — она не реагировала вовсе
  // (жалоба Павла 05.09.2026).
  const [selected, setSelected] = useState(undefined)
  const [details, setDetails] = useState(null)     // содержимое станции (грузим по тапу)

  // По умолчанию — только свой раздел (просьба Павла, 13.08): вся дорога на 49 уроков
  // превращает экран в бесконечную ленту. Выбор запоминаем на устройстве.
  const [showAll, setShowAll] = useState(() => {
    try { return localStorage.getItem('path_show_all') === '1' } catch { return false }
  })
  const setRoadMode = (all) => {
    try { localStorage.setItem('path_show_all', all ? '1' : '') } catch {}
    setShowAll(all)
  }

  // Разделы, которые человек переключил РУКАМИ. Храним не «раскрытые», а «перевёрнутые
  // относительно умолчания»: умолчание зависит от режима дороги (в «Мой раздел» пройденные
  // свёрнуты, в «Вся дорога» раскрыто всё), и список раскрытых пришлось бы пересобирать
  // при каждом переключении.
  const [flipped, setFlipped] = useState(() => new Set())
  const toggleSection = (i) => setFlipped(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  // Экран закрылся с открытым окном — снимаем флаг, иначе тур не запустится уже никогда
  useEffect(() => () => setIntroOpen(false), [])

  // Прокрутил дорогу — карточка схлопывается. Пока она открыта, она занимает место на
  // карте, и людям это мешало смотреть остальные узлы: закрывать её вторым тапом
  // догадывались не все (жалоба Павла 06.09.2026). Прокрутка — естественный жест
  // «мне сейчас не про этот узел».
  //
  // Взводим с задержкой: сразу после открытия экрана страница сама подкручивается к
  // текущему узлу, и без паузы карточка закрывалась бы от собственной прокрутки.
  useEffect(() => {
    let armed = false
    let from = window.scrollY
    const arm = setTimeout(() => { armed = true; from = window.scrollY }, 700)
    const onScroll = () => {
      if (!armed) return
      if (Math.abs(window.scrollY - from) < 60) return   // мелкое дрожание — не жест
      setSelected(null)
      setDetails(null)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { clearTimeout(arm); window.removeEventListener('scroll', onScroll) }
  }, [selected])

  // Esc закрывает карточку — требование доступности из SPEC (раздел 7)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setSelected(null); setDetails(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    api.get('/path').then(d => {
      setData(d)
      // Окно показываем, если сервер говорит «календарь поставлен по умолчанию, человека
      // не спрашивали», либо если этот ученик вообще впервые видит новый экран.
      const seen = (() => { try { return localStorage.getItem('novice_intro_seen') === '1' } catch { return true } })()
      if ((d?.schedule_hint?.length > 0) || !seen) setIntroOpen(true)
    }).catch(() => setData({ error: true }))
    api.get('/class-games').then(rows => setGames((rows || []).filter(g => g.status === 'ready'))).catch(() => {})
  }, [])

  // Окно знакомства проговариваем вслух. Читать умеют не все, а первый экран — ровно
  // то место, где человек и застревает.
  const introSpeech = () => [t.path.introTitle, t.path.introStart].join('. ')
  useEffect(() => {
    if (introOpen) speakAuto(introSpeech(), uiLocale(lang))
  }, [introOpen])   // eslint-disable-line react-hooks/exhaustive-deps

  const closeIntro = async (goSchedule) => {
    const courseId = data?.schedule_hint?.[0]?.course_id
    setIntroBusy(true)
    try { localStorage.setItem('novice_intro_seen', '1') } catch {}
    if (courseId) { try { await api.post(`/courses/${courseId}/schedule/confirm`, {}) } catch {} }
    setIntroBusy(false)
    setIntroOpen(false)
    if (goSchedule && courseId) navigate(`/courses/${courseId}`)
    else if (goSchedule) navigate('/courses')
  }

  // Автопрокрутка к текущему узлу: иначе ученик открывает экран на первом уроке и не
  // понимает, где он сейчас.
  useEffect(() => {
    if (!data?.nodes?.length) return
    const id = setTimeout(() => {
      document.querySelector('[data-current-node]')
        ?.scrollIntoView({ behavior: 'auto', block: 'center' })
    }, 80)
    return () => clearTimeout(id)
  }, [data, showAll])

  if (!data) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>{t.common.loading}</div>
  if (data.error || !data.nodes?.length) {
    return <div style={{ padding: 28, textAlign: 'center', color: 'var(--ink-soft)' }}>{t.path.empty}</div>
  }

  const { nodes, stats, road, tails, weekly, skills, sections = [], chest, daily = [] } = data
  // Дорога — уроки вперемежку со станциями (речь, грамматика, наборы слов, зачёт).
  // Станция стоит НА пути, а не в стороне: иначе диктант и произношение не делают.
  const items = road?.length ? road : nodes.map(n => ({ kind: 'lesson', ...n }))
  const current = nodes.find(n => n.state === 'current')
  const curSection = sections.findIndex(s => s.state === 'current')

  const go = (n) => {
    if (n?.__url) return navigate(n.__url)   // строка внутри карточки станции
    // «Продолжить урок» — короткий подход по двум главным типам (узнавание и карточки).
    // Полный список шагов — по кнопке «Выбор упражнения».
    if (n.kind === 'lesson') return navigate(`/exercise-session?lesson_id=${n.lesson_id}&types=multiple_choice,flashcard&shuffle=1`)
    if (n.type === 'exam')    return navigate(`/exercise-session?lesson_id=${n.lesson_id}&exam=1`)
    if (n.type === 'wordset') return navigate(`/exercise-session?lesson_id=${n.lesson_id}`)
    if (n.type === 'phraseset') return navigate(`/phrases/${n.topic_id}`)
    if (n.type === 'speech')  return navigate(`/checkpoint/speech/${n.lesson_id}`)
    return navigate(`/checkpoint/grammar/${(n.lesson_ids || []).join(',')}`)
  }

  const buckets = splitRoadBySections(items, sections)
  // Какие разделы показываем. «Мой раздел» — текущий и соседние; «Вся дорога» — всё.
  const visibleSections = showAll ? sections : sections.filter((s, i) => i >= curSection - 1)
  // Раскрыт ли раздел. В «Мой раздел» пройденные свёрнуты в полосу (их много, и дорога
  // превращалась в ленту), в «Вся дорога» раскрыто ВСЁ — включая ещё не открытые уроки.
  // Ради этого тумблер и нужен: Павел 01.10.2026 — «не показывается вся карта, чтобы
  // пройти все заново». Клик по разделу переворачивает умолчание в любую сторону.
  const isSectionOpen = (s, i) => {
    const byDefault = showAll || s.state === 'current'
    return flipped.has(i) ? !byDefault : byDefault
  }

  return (
    <div className="path-layout">
      <main className="path-col">
        <ColumnHead t={t} lang={lang} current={current} sections={sections}
          showAll={showAll} setRoadMode={setRoadMode}
          doneLessons={data.done_lessons} totalLessons={data.total_lessons} />

        {/* Статистика строкой — на планшете (на ПК она в правой колонке, на телефоне ниже) */}
        <div className="path-tiles path-tiles--row">
          <Tile icon={<Flame size={18} />} tone="#E0782E" value={stats.streak} label={t.path.streak} />
          <Tile icon={<Zap size={18} />} tone="#E3AE3A" value={stats.xp_today} label={t.path.xpToday} />
          <Tile icon={<Gem size={18} />} tone="#7C4DCC" value={`${data.done_lessons}/${data.total_lessons}`} label={t.path.lessons} />
          {chest && <Tile icon={<span style={{ fontSize: 17 }}>🎁</span>} tone="#B98718"
            value={chest.left} label={t.path.chest} />}
        </div>

        {visibleSections.map((s) => {
          const i = sections.indexOf(s)
          const open = isSectionOpen(s, i)
          return (
            <Fragment key={i}>
              <SectionHead section={s} t={t} lang={lang} open={open}
                onToggle={() => toggleSection(i)}
                onRepeat={() => navigate(`/exercise-session?lesson_id=${s.lesson_ids[0]}`)} />
              {open && (
                <Road items={buckets[i] || []} vp={vp} t={t} lang={lang} go={go}
                  chest={s.state === 'current' ? chest : null}
                  dim={s.state === 'future'}
                  selected={selected} setSelected={setSelected}
                  details={details} setDetails={setDetails} />
              )}
            </Fragment>
          )
        })}

        {/* Хвосты — общим числом: пропущенное не теряется и видно, сколько его */}
        {tails?.total > 0 && (
          <button className="path-tails"
            onClick={() => navigate(current ? `/exercise-session?lesson_id=${current.lesson_id}&tails=1` : '/')}>
            <span>↩️ {t.path.tails}</span>
            <span className="path-tails-n">{tails.total}</span>
          </button>
        )}

        {/* Мотивация на телефоне — НАД играми (просьба Павла, 13.08): неделя и умения под
            длинной дорогой не находились. На ПК та же информация в правой колонке. */}
        {!vp.isDesk && (
          <div className="path-motivation">
            {weekly?.length > 0 && <WeekCard weekly={weekly} t={t} />}
            {skills && <SkillsCard skills={skills} t={t} />}
          </div>
        )}

        {/* Игры и тёплые разделы. В новом дизайне их не перенесли с главной полного
            интерфейса, и попасть в них стало неоткуда (жалоба Павла 05.09.2026:
            «потеряли разделы, Любовь к детям надо вывести на главный»). */}
        <div className="path-extras">
          <div className="path-extras-title">{t.path.extras}</div>
          <div className="path-extras-grid">
            <Extra ico={<Heart size={19} />} tone="#e0576f" title={t.dashboard.loveTitle}
              sub={t.dashboard.loveDesc} onClick={() => navigate('/love')} />
            <Extra ico={<Layers size={19} />} tone="#7C4DCC" title={t.dashboard.matchTitle}
              sub={t.dashboard.matchDesc} onClick={() => navigate('/game/match')} />
            <Extra ico={<Puzzle size={19} />} tone="#23809E" title={t.dashboard.crossTitle}
              sub={t.dashboard.crossDesc} onClick={() => navigate('/game/crossword')} />
            <Extra ico={<CheckCircle2 size={19} />} tone="#2F8F6A" title={t.dashboard.chooseAnswerTitle}
              sub={t.dashboard.chooseAnswerDesc} onClick={() => navigate('/exercise-session?type=multiple_choice')} />
            <Extra ico={<SquarePen size={19} />} tone="#B07F1C" title={t.dashboard.createSetTitle}
              sub={t.dashboard.createSetDesc} onClick={() => navigate('/vocabulary')} />
            {/* Классная игра: пока учитель её не собрал, ведём в тот же список — иначе
                кнопка молчит на нажатие и выглядит сломанной. */}
            <Extra ico={<Gamepad2 size={19} />} tone="#E0782E" title={t.dashboard.classGameTitle}
              sub={games.length ? t.dashboard.classGameReady : t.dashboard.classGameNot}
              onClick={() => games.length && navigate(`/class-game/${games[0].id}`)}
              muted={!games.length} />
          </div>
        </div>
      </main>

      {/* Правая колонка — только ПК (≥1280). На планшете те же цифры стоят строкой наверху. */}
      <aside className="path-aside">
        <div className="path-tiles">
          <Tile icon={<Flame size={18} />} tone="#E0782E" value={stats.streak} label={t.path.streak} />
          <Tile icon={<Zap size={18} />} tone="#E3AE3A" value={stats.xp_today} label={t.path.xpToday} />
          <Tile icon={<Gem size={18} />} tone="#7C4DCC" value={`${data.done_lessons}/${data.total_lessons}`} label={t.path.lessons} />
        </div>

        {daily.length > 0 && <DailyCard daily={daily} t={t} />}
        {chest && <ChestCard chest={chest} t={t} />}
        {weekly?.length > 0 && <WeekCard weekly={weekly} t={t} />}
        {skills && <SkillsCard skills={skills} t={t} />}
        <LegendCard t={t} />
      </aside>

      {/* Первое знакомство: одна кнопка «Старт» и один вопрос про календарь. */}
      {introOpen && (
        <div className="novice-intro-overlay" onClick={() => closeIntro(false)}>
          <div className="novice-intro" onClick={e => e.stopPropagation()}>
            <h2>{t.path.introTitle}</h2>
            <p>{t.path.introStart}</p>
            {data.schedule_hint?.length > 0 && <p>{t.path.introSchedule}</p>}
            <div className="novice-intro-btns">
              <button className="novice-intro-btn" type="button"
                onClick={() => speak(introSpeech(), uiLocale(lang))}>
                🔊 {t.exercise.listen || 'Слушать'}
              </button>
              <button className="novice-intro-btn novice-intro-btn--main" disabled={introBusy}
                onClick={() => closeIntro(false)}>{t.path.introOk}</button>
              {data.schedule_hint?.length > 0 && (
                <button className="novice-intro-btn" disabled={introBusy}
                  onClick={() => closeIntro(true)}>{t.path.introPickDays}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Шапка колонки: надзаголовок, название текущего урока, переключатель, прогресс ───────
function ColumnHead({ t, lang, current, sections, showAll, setRoadMode, doneLessons, totalLessons }) {
  const title = current
    ? (getLessonTitle(current.title, current.title_translations, lang) || `${t.path.lesson} ${current.number ?? ''}`)
    : t.path.title

  return (
    <header className="path-colhead">
      <div className="path-colhead-row">
        <div style={{ minWidth: 0 }}>
          <div className="path-eyebrow">{t.path.myRoad}</div>
          <h1 className="path-h1">{title}</h1>
        </div>

        {/* Переключатель. nowrap обязателен: без него «Вся дорога · 49» ломалась на две
            строки и кнопка переставала читаться как кнопка (известная беда макета). */}
        <div className="path-seg" role="group">
          <button className={!showAll ? 'is-on' : ''} onClick={() => setRoadMode(false)}>
            {t.path.mySection}
          </button>
          <button className={showAll ? 'is-on' : ''} onClick={() => setRoadMode(true)}>
            <Map size={14} aria-hidden /> {t.path.wholeRoad} · {totalLessons}
          </button>
        </div>
      </div>

      {/* Прогресс курса — ПО РАЗДЕЛАМ, а не 49 чёрточками: полсотни полосок в ряд не
          считываются вовсе, а пять глав видно с одного взгляда. */}
      <div className="path-progress">
        <div className="path-progress-bars">
          {sections.map((s, i) => (
            <span key={i} className={`path-progress-seg is-${s.state}`}>
              {s.state === 'current' && (
                <i style={{ width: `${s.total ? Math.round((s.done / s.total) * 100) : 0}%` }} />
              )}
            </span>
          ))}
        </div>
        <span className="path-progress-num">{t.path.ofLessons(doneLessons, totalLessons)}</span>
      </div>
    </header>
  )
}

// ── Шапка раздела: пройденный сворачивается в полосу, текущий — карточка, будущий заперт ──
function SectionHead({ section, t, lang, open, onToggle, onRepeat }) {
  const name = (getLessonTitle(section.title, section.title_translations, lang) || section.title || '')
    // Из названия убираем приставку «Урок 31:» — раздел назван темой своего первого урока,
    // а номер урока в заголовке главы только путает.
    .replace(/^[^:]{1,24}\d[^:]{0,8}:\s*/, '')

  if (section.state === 'done') {
    return (
      <div className={`path-sec path-sec--done${open ? ' is-open' : ''}`}>
        <button className="path-sec-strip" onClick={onToggle}
          aria-expanded={open} aria-label={`${t.path.section} ${section.number} — ${t.path.sectionDone}`}>
          <span className="path-sec-check"><Check size={16} strokeWidth={3.2} aria-hidden /></span>
          <span className="path-sec-striptext">
            {t.path.section} {section.number} · {name} — {t.path.sectionDone}, {t.path.ofLessons(section.done, section.total)}
          </span>
        </button>
        <button className="path-sec-repeat" onClick={onRepeat}>{t.path.repeat}</button>
      </div>
    )
  }

  const future = section.state === 'future'
  return (
    <div className={`path-sec-card${future ? ' is-future' : ''}`}>
      <span className="path-sec-num">{section.number}</span>
      <div className="path-sec-body">
        {/* Диапазон уроков в надзаголовке. Название раздела берётся из темы его первого
            урока, и у повторительных глав оно выходит никаким («Разное», «Грамматика») —
            цена автоматического деления. Номера уроков говорят, где ты, даже когда имя
            не говорит ничего. */}
        <div className="path-sec-eyebrow">
          {t.path.section} {section.number}
          {section.from != null && section.to != null && ` · ${t.path.lesson} ${section.from}–${section.to}`}
        </div>
        <div className="path-sec-name">{name}</div>
        <div className="path-sec-progress">
          <span className="path-sec-bar">
            <i style={{ width: `${section.total ? Math.round((section.done / section.total) * 100) : 0}%` }} />
          </span>
          <span className="path-sec-count">{t.path.ofLessons(section.done, section.total)} {t.path.lessonsOf}</span>
        </div>
      </div>
      {future
        // На узких ширинах текст прячем, остаётся замок с подсказкой: длинная строка
        // «Откроется после контрольной» переносилась на две и ломала карточку.
        ? <span className="path-sec-lock" title={t.path.sectionLocked}>
            <Lock size={15} aria-hidden /><span>{t.path.sectionLocked}</span>
          </span>
        : <button className="path-sec-ref" onClick={onRepeat}>
            <BookMarked size={15} aria-hidden /><span>{t.path.reference}</span>
          </button>}
    </div>
  )
}

// ── Дорога одного раздела ───────────────────────────────────────────────────────────────
function Road({ items, vp, t, lang, go, chest, dim, selected, setSelected, details, setDetails }) {
  // Высота раскрытой карточки. На телефоне она лежит ПОД узлом и без этого накрыла бы
  // следующий — до него нельзя было бы дотянуться, не закрыв текущий.
  const [cardH, setCardH] = useState(0)

  // Разовая подсказка «нажми на кружок». Люди не понимали, что узлы вообще нажимаются:
  // карта читалась как картинка прогресса (жалоба Павла 06.09.2026).
  const [tapHintSeen, setTapHintSeen] = useState(() => {
    try { return localStorage.getItem('path_tap_hint_seen') === '1' } catch { return true }
  })

  const keyOf = (n, i) => `${n.kind}-${n.type || 'lesson'}-${n.lesson_id ?? n.topic_id ?? i}`

  // Раскрыт ли узел — ОДНО правило на всё: и для отрисовки, и для тапа, и для того,
  // где дорога расступается. Пока правило было продублировано, тап по текущему уроку
  // (он раскрыт сам, без выбора) считал его закрытым и «открывал» повторно.
  const isNodeOpen = (n, i) => selected === undefined
    ? (n.kind === 'lesson' && n.state === 'current')
    : selected === keyOf(n, i)

  const openNode = async (n, i) => {
    setCardH(0)
    if (!tapHintSeen) {
      setTapHintSeen(true)
      try { localStorage.setItem('path_tap_hint_seen', '1') } catch {}
    }
    // Тап по раскрытому узлу — закрыть. null, а не undefined: «закрыто» не должно
    // означать «вернуться к текущему уроку», иначе карточка не закрывается никогда.
    if (isNodeOpen(n, i)) { setSelected(null); setDetails(null); return }
    setSelected(keyOf(n, i)); setDetails(null)
    if (n.kind === 'checkpoint' && (n.type === 'speech' || n.type === 'grammar')) {
      const lid = n.lesson_id ?? (n.lesson_ids || [])[0]
      if (lid) {
        try { setDetails(await api.get(`/path/lesson/${lid}`)) } catch { setDetails({ error: true }) }
      }
    }
  }

  // Сундук — синтетический узел в конце текущего раздела: в данных его нет, он считается
  // из того, сколько уроков раздела осталось.
  const withChest = useMemo(() => {
    if (!chest) return items
    const exam = items.findIndex(x => x.type === 'exam')
    const node = { kind: 'chest', type: 'chest', state: chest.left === 0 ? 'open' : 'locked', __chest: chest }
    if (exam === -1) return [...items, node]
    return [...items.slice(0, exam), node, ...items.slice(exam)]
  }, [items, chest])

  const openIdx = withChest.findIndex(isNodeOpen)
  // Куда показывает разовая подсказка: первый НЕ раскрытый доступный узел. Именно он и
  // объясняет то, чего люди не понимали, — что нажимается любой кружок.
  const hintIdx = tapHintSeen ? -1 : withChest.findIndex((n, i) => n.state !== 'locked' && !isNodeOpen(n, i))

  // На телефоне карточка раскрывается ПОД узлом и раздвигает дорогу; на планшете и ПК она
  // стоит сбоку, и раздвигать ничего не нужно — место под неё уже заложено шагом afterCurrent.
  const shift = vp.isPhone && openIdx >= 0 && cardH ? cardH + 16 : 0

  const pts = layoutNodes(withChest, {
    centerX: vp.view / 2, startY: 70, step: vp.step,
    afterCurrent: vp.isPhone ? 40 : 90, scale: vp.scale,
  })
  const points = pts.map((p, i) => ({ ...p, y: p.y + (i > openIdx ? shift : 0) }))
  if (!points.length) return null

  const d = roadPath(points.map(p => [p.x, p.y]))
  const height = points[points.length - 1].y + 120

  // Нить зелёная ровно до ПЕРВОГО непройденного узла — то есть до места, где путь реально
  // прерывается. По «последнему пройденному» линия закрашивала и пробелы: между 5 и 12
  // уроком дыра, а нить всё равно шла зелёной до 20-го.
  let firstGap = withChest.findIndex(n => n.state !== 'done')
  if (firstGap === -1) firstGap = points.length
  const filled = points.length ? Math.max(0, Math.min(1, (firstGap - 0.5) / points.length)) : 0

  return (
    <div className={`path-road${dim ? ' path-road--dim' : ''}`} style={{ height }}>
      <svg viewBox={`0 0 ${vp.view} ${height}`} preserveAspectRatio="xMidYMin meet"
        className="path-road-svg" aria-hidden>
        {/* Три слоя: полотно, белый пунктир по центру, пройденный участок поверх */}
        <path d={d} fill="none" stroke="var(--road)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 14" opacity=".9" strokeLinecap="round" />
        <path d={d} fill="none" stroke="var(--road-done)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round"
          pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - filled, transition: 'stroke-dashoffset .6s ease-out' }} />
        <path d={d} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 14" opacity=".55"
          pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - filled }} />
      </svg>

      {points.map(({ x, y }, i) => {
        const n = withChest[i]
        const k = keyOf(n, i)
        const isLesson = n.kind === 'lesson'
        const isOpen = isNodeOpen(n, i)
        const kind = isLesson ? 'lesson' : n.type
        const size = NODE_SIZE[n.type === 'chest' ? 'chest' : n.type === 'exam' ? 'exam' : n.state] || 64
        const left = `${(x / vp.view) * 100}%`

        const title = isLesson
          ? (getLessonTitle(n.title, n.title_translations, lang) || `${t.path.lesson} ${n.number ?? ''}`)
          : n.type === 'chest' ? t.path.chestNode
          : n.type === 'exam'  ? t.path.examNode
          : (n.type === 'wordset' || n.type === 'phraseset')
              ? (getLessonTitle(n.title, n.title_translations, lang) || n.title || t.path.cpWordset)
              : t.path[{ speech: 'cpSpeech', grammar: 'cpGrammar' }[n.type]]

        // Подпись под кружком: у урока номер уже стоит в карточке, поэтому из названия
        // убираем приставку «Урок 7:» — иначе подпись начинается с того же числа.
        const caption = isLesson ? String(title).replace(/^[^:]{1,24}\d[^:]{0,8}:\s*/, '') : title
        const sub = isLesson ? `${t.path.lesson} ${n.number ?? ''}`
          : n.type === 'chest' ? t.path.chestLeft(n.__chest.left)
          : n.type === 'exam'  ? t.path.examHint(n.total ?? 0)
          : null

        return (
          <Fragment key={k}>
            <div className="path-node-slot"
              style={{ left, top: y - size / 2, width: size, height: size, zIndex: isOpen ? 6 : 2 }}
              {...(isLesson && n.state === 'current' ? { 'data-current-node': '1' } : {})}>
              {n.state === 'current' && <span className="path-now">{t.path.now}</span>}
              <RoadNode node={n} title={title} label={`${title}${sub ? ', ' + sub : ''}`}
                isOpen={isOpen} onOpen={() => openNode(n, i)} />
            </div>

            {/* Подпись под кружком. Раньше в кружке стояли цифра или обрубок («Речь», «Грам»),
                и карта читалась как схема: понять, что за урок, можно было только тапнув.
                У раскрытого узла подпись не нужна — в карточке стоит то же название. */}
            {!isOpen && (
              <div className="path-cap" style={{
                top: y + size / 2 + 16,
                left: `clamp(0px, calc(${left} - 75px), calc(100% - 150px))`,
                opacity: n.state === 'locked' ? 0.55 : 1,
              }}>
                <span className="path-cap-title">{caption}</span>
                {sub && <span className="path-cap-sub">{sub}</span>}
              </div>
            )}

            {i === hintIdx && (
              <div className="path-tap-hint" style={{
                top: y - size / 2 - 62,
                left: `clamp(0px, calc(${left} - 110px), calc(100% - 220px))`, width: 220,
              }}>
                <div className="path-tap-hint-bubble">{t.path.tapHint}</div>
              </div>
            )}

            {/* Карточка урока. На ПК и планшете — СБОКУ от узла (SPEC, раздел 7), на телефоне
                под ним: рядом с кругом на 390px места на карточку просто нет, и когда её туда
                ставили, половина уезжала за край (жалоба Павла 05.09.2026). */}
            {isOpen && (
              <div ref={el => { const h = el?.getBoundingClientRect().height; if (h && Math.abs(h - cardH) > 1) setCardH(h) }}
                className={`path-card-wrap${vp.isPhone ? ' is-below' : ''}`}
                style={vp.isPhone
                  ? { top: y + size / 2 + 12, left: `clamp(0px, calc(${left} - 50%), 0px)`, width: '100%' }
                  : { top: y - 74, left: `calc(${left} + ${size / 2 + 22}px)` }}>
                <NodeCard n={n} title={title} details={details} t={t} go={go} kind={kind} />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

// ── Карточка узла ───────────────────────────────────────────────────────────────────────
function NodeCard({ n, title, details, t, go, kind }) {
  const isLesson = n.kind === 'lesson'
  const locked = n.state === 'locked'
  const c = TYPE_COLOR[kind] || TYPE_COLOR.lesson
  const steps = details?.steps || []
  const byType = (type) => steps.find(s => s.type === type)

  const rows = []
  if (n.kind === 'checkpoint' && n.type === 'speech' && details) {
    if (details.phrases?.total) rows.push({ label: t.phrases.lessonSet, done: details.phrases.done, total: details.phrases.total, go: `/phrases/lesson/${n.lesson_id}` })
    const d = byType('dictation'); if (d) rows.push({ label: t.exercise.dictation, done: d.done, total: d.total, go: `/exercise-session?lesson_id=${n.lesson_id}&type=dictation` })
    const sp = byType('speech');   if (sp) rows.push({ label: t.exercise.speech || 'Произношение', done: sp.done, total: sp.total, go: `/exercise-session?lesson_id=${n.lesson_id}&type=speech` })
  }
  if (n.kind === 'checkpoint' && n.type === 'grammar' && details) {
    const cj = byType('conjugation'); if (cj) rows.push({ label: t.exercise.conjugation, done: cj.done, total: cj.total, go: `/exercise-session?lesson_id=${details.lesson.id}&type=conjugation` })
    const dc = byType('declension'); if (dc) rows.push({ label: t.exercise.declension || 'Падежи', done: dc.done, total: dc.total, go: `/exercise-session?lesson_id=${details.lesson.id}&type=declension` })
    const ar = byType('article');    if (ar) rows.push({ label: t.exercise.article || 'Артикль', done: ar.done, total: ar.total, go: `/exercise-session?lesson_id=${details.lesson.id}&type=article` })
  }

  const done = isLesson ? n.ex_done : n.done
  const total = isLesson ? n.ex_total : n.total
  const pct = total ? Math.round((done / total) * 100) : 0

  const kindLabel = isLesson ? t.path.kindLesson
    : ({ speech: t.path.cpSpeech, grammar: t.path.cpGrammar, wordset: t.path.cpWordset,
         phraseset: t.path.cpPhraseset, exam: t.path.cpExam, chest: t.path.chestNode })[n.type] || ''

  return (
    <div className="path-card">
      <span className="path-card-tail" aria-hidden />
      <div className="path-card-head">
        <span className="path-card-chip" style={{ color: c.dark, background: `${c.main}1F` }}>
          <TypeIcon type={kind} size={12} /> {kindLabel}
        </span>
        {isLesson && n.number != null && (
          <span className="path-card-num">{t.path.lesson} {n.number}</span>
        )}
      </div>

      <div className="path-card-title">{title}</div>

      {locked && (
        <div className="path-card-locked">
          <div style={{ fontWeight: 700 }}>🔒 {t.path.lockedTitle}</div>
          <div style={{ marginTop: 3, lineHeight: 1.35 }}>{t.path.lockedHint}</div>
        </div>
      )}

      {/* Что внутри станции */}
      {rows.length > 0 && (
        <div className="path-card-rows">
          {rows.map(r => (
            <button key={r.label} onClick={() => go({ __url: r.go })} className="path-card-row">
              <span>{r.label}</span>
              <span style={{ color: r.done >= r.total ? 'var(--good)' : 'var(--ink-soft)' }}>{r.done}/{r.total}</span>
            </button>
          ))}
        </div>
      )}

      {n.kind === 'checkpoint' && !rows.length && details === null && (n.type === 'speech' || n.type === 'grammar') && (
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>…</div>
      )}

      {total > 0 && (
        <div className="path-card-progress">
          <span className="path-card-bar"><i style={{ width: `${pct}%` }} /></span>
          <span>{done}/{total}</span>
        </div>
      )}

      {!locked && n.type !== 'chest' && (
        <button className="path-card-go" onClick={() => go(n)}>
          ▶ {isLesson ? t.path.continueLesson : t.path.start}
        </button>
      )}

      {/* Пропустить станцию: непройденное уходит в хвосты и вернётся позже.
          Речь ночью не сделаешь — но и терять её нельзя. */}
      {n.kind === 'checkpoint' && (n.type === 'speech' || n.type === 'grammar') && (
        <button className="path-card-alt" onClick={async () => {
          const lid = n.lesson_id ?? (n.lesson_ids || [])[0]
          try { await api.post('/path/checkpoint/defer', { type: n.type, lesson_id: lid }) } catch {}
          go({ __url: '/' })
        }}>
          {t.phrases.skip} → {t.path.tails}
        </button>
      )}

      {isLesson && !locked && (
        <button className="path-card-alt" onClick={() => go({ __url: `/lesson/${n.lesson_id}` })}>
          {t.path.chooseExercise}
        </button>
      )}
    </div>
  )
}

// ── Карточки правой колонки ─────────────────────────────────────────────────────────────
function DailyCard({ daily, t }) {
  const label = { batch: t.path.dailyBatch, fresh: t.path.dailyFresh, review: t.path.dailyReview }
  return (
    <div className="path-aside-card">
      <div className="path-aside-title">{t.path.dailyTitle}</div>
      {daily.map(d => {
        const ok = d.done >= d.total
        return (
          <div key={d.key} className="path-daily-row">
            <div className="path-daily-head">
              <span>{label[d.key] || d.key}</span>
              <span style={{ color: ok ? 'var(--good)' : 'var(--ink-soft)', fontWeight: ok ? 800 : 600 }}>
                {ok ? t.path.dailyDone : `${d.done}/${d.total}`}
              </span>
            </div>
            <span className="path-daily-bar">
              <i style={{ width: `${d.total ? Math.round((d.done / d.total) * 100) : 0}%`,
                background: ok ? 'var(--good)' : '#7C4DCC' }} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChestCard({ chest, t }) {
  const pct = chest.total ? Math.round((chest.done / chest.total) * 100) : 0
  return (
    <div className="path-aside-card path-aside-card--chest">
      <div className="path-chest-row">
        <span className="path-chest-ico">🎁</span>
        <span style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{t.path.chest}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{t.path.chestLeft(chest.left)}</div>
          <span className="path-chest-bar"><i style={{ width: `${pct}%` }} /></span>
        </span>
      </div>
    </div>
  )
}

function WeekCard({ weekly, t }) {
  const max = Math.max(...weekly.map(x => x.count), 1)
  return (
    <div className="path-aside-card">
      <div className="path-aside-title">{t.path.week}</div>
      <div className="path-week">
        {weekly.map((d, i) => {
          const today = i === weekly.length - 1
          return (
            <div key={d.date} className="path-week-col">
              <div className="path-week-bar" style={{
                height: Math.max(6, Math.round((d.count / max) * 58)),
                background: today ? '#E3AE3A' : '#7C4DCC',
              }} />
              <span style={{ fontWeight: today ? 800 : 600, color: today ? 'var(--ink)' : 'var(--ink-soft)' }}>
                {(t.path.weekdays || [])[d.weekday - 1] || ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SkillsCard({ skills, t }) {
  return (
    <div className="path-aside-card">
      <div className="path-aside-title">{t.path.skills}</div>
      <Skill label={t.path.skillWords}  value={skills.words_known} pct={Math.min(100, skills.words_known / 5)} color="#7C4DCC" />
      <Skill label={t.path.skillListen} value={`${skills.listen_pct}%`} pct={skills.listen_pct} color="#23809E" />
      <Skill label={t.path.skillSpeak}  value={`${skills.speak_pct}%`} pct={skills.speak_pct} color="#2F8F6A" />
    </div>
  )
}

function LegendCard({ t }) {
  const rows = [
    ['speech', t.path.cpSpeech], ['wordset', t.path.cpWordset],
    ['phraseset', t.path.cpPhraseset], ['grammar', t.path.cpGrammar],
  ]
  return (
    <div className="path-aside-card">
      <div className="path-aside-title">{t.path.types}</div>
      <div className="path-legend">
        {rows.map(([type, label]) => (
          <span key={type} className="path-legend-row">
            <span className="path-legend-ico" style={{ color: TYPE_COLOR[type].main, borderColor: TYPE_COLOR[type].main }}>
              <TypeIcon type={type} size={13} />
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function Skill({ label, value, pct, color }) {
  return (
    <div className="path-skill">
      <div className="path-skill-head"><span>{label}</span><span>{value}</span></div>
      <span className="path-skill-bar">
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </span>
    </div>
  )
}

function Tile({ icon, tone, value, label }) {
  return (
    <div className="path-tile">
      <span className="path-tile-ico" style={{ color: tone }}>{icon}</span>
      <span className="path-tile-val">{value}</span>
      <span className="path-tile-lab">{label}</span>
    </div>
  )
}

// Плитка раздела под дорогой: цветной значок, название, короткое пояснение.
function Extra({ ico, tone, title, sub, onClick, muted = false }) {
  return (
    <button className="path-extra" onClick={onClick} style={{ opacity: muted ? 0.55 : 1 }}>
      <span className="path-extra-ico" style={{ background: tone }}>{ico}</span>
      <span className="path-extra-title">{title}</span>
      <span className="path-extra-sub">{sub}</span>
    </button>
  )
}
