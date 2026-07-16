# Пять независимых задач (2026-07-16) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пять независимых улучшений: настройки переживают чистку PWA, копирование в режиме «Разговор» Читалки, swap языков в «Двуязычном» режиме, QR-код приглашения в класс, кнопка камеры на Дашборде.

**Architecture:** Каждая задача самодостаточна, разные файлы (кроме Task 1+2, которые оба трогают `TextReader.jsx`, но в разных, не пересекающихся секциях режима — риска конфликта нет). Задача 1 переиспользует уже существующую бэкенд-инфраструктуру (`user_settings.visual`), не создаёт новую миграцию.

**Tech Stack:** React 18 + Vite (frontend), Fastify 4 + PostgreSQL raw SQL (backend). Задача 4 добавляет новую зависимость `qrcode` (npm, локальная генерация в canvas/data-URL, без внешних CDN — не нарушает CSP).

## Global Constraints

- Комментарии в коде — русский. Имена переменных/функций — английский.
- НЕ трогать логику, не упомянутую в задаче.
- Работа остаётся в ветке `worktree-sonnet-ui-tasks`, НЕ мержить в `main` без отдельного подтверждения (как в предыдущих раундах).
- НЕ делать `git reset --hard` нигде.
- Каждая задача собирается (`cd frontend && npx vite build`) без ошибок перед коммитом.
- Backend-тесты — vitest, если задача трогает бэкенд-логику с ветвлениями (не тривиальный CRUD).

---

## Task 1: Настройки переживают чистку PWA — довязать существующий `user_settings.visual`

**Расхождение с изначальной формулировкой задачи (уже согласовано с Павлом):** в БД уже есть таблица `user_settings` с колонкой `visual JSONB` (миграция `028_user_settings_visual.sql`) и готовые роуты `GET /api/settings` (возвращает `{..., visual}`) и `PATCH /api/settings/visual` (принимает `{visual: {...}}`, upsert) — `backend/src/routes/settings.js`. Фронтенд их никогда не вызывал. НЕ создавать новую колонку/миграцию/роуты — подключить существующее. Расширить состав `visual`-блока: сейчас это `zoom/fontFamily/headingFont/headingSize/accentColor/voiceRate/mobileLayout` (объект `toSave`, `Settings.jsx:211`) — добавить туда же `trainerReactions` (сейчас `localStorage.trainer_reactions`) и `voiceName` (сейчас `localStorage` под `VOICE_KEY`).

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `api.get('/settings')` → `{..., visual: {...} | null}`; `api.patch('/settings/visual', { visual })` → `{ ok: true }` (обе уже существуют, `backend/src/routes/settings.js:5-14, 17-28`).

- [ ] **Step 1: Прочитать текущую структуру `Settings.jsx`**

Найти: где объявлены `trainer_reactions`-toggle (~строка 10-13), `VOICE_KEY`/выбор голоса (~34-49), `voice_rate` (~58), блок `LS_KEY`/`toSave` (~204-212). Номера строк примерные (из более раннего чтения файла) — сверить на месте, файл мог сдвинуться.

- [ ] **Step 2: Добавить импорт `api`**

Если `api` из `../api/client.js` ещё не импортирован в файле — добавить импорт.

- [ ] **Step 3: Загрузка настроек при старте**

Добавить `useEffect` (в главном компоненте страницы, рядом с другими эффектами), который при монтировании:
1. Читает локальный кеш как сейчас (уже работает, не трогать).
2. Дополнительно дёргает `api.get('/settings')`, и если `res.visual` непустой объект — применяет его поверх локального состояния (перезаписывает `zoom/fontFamily/headingFont/headingSize/accentColor/voiceRate/mobileLayout/trainerReactions/voiceName`, каждое — в соответствующий `useState`/`localStorage`, тем же способом, каким они сейчас применяются из `localStorage` при инициализации). Обернуть в `try/catch` — если запрос упал (нет сети/токена), молча остаться на локальном кеше, не ломать страницу.

```js
useEffect(() => {
  (async () => {
    try {
      const res = await api.get('/settings')
      if (res?.visual && Object.keys(res.visual).length) {
        applyServerVisual(res.visual)  // см. Step 4 — применяет поля к состоянию + localStorage
      }
    } catch { /* нет сети/токена — остаёмся на локальном кеше */ }
  })()
}, [])
```

- [ ] **Step 4: Функция `applyServerVisual`**

Написать рядом с остальной логикой сохранения (можно как обычную функцию внутри компонента, не хук):

```js
// Применяет настройки с сервера поверх текущего состояния + локального кеша.
// Вызывается один раз при старте, если сервер прислал непустой visual-блок.
function applyServerVisual(v) {
  if (v.zoom != null) setZoom(v.zoom)
  if (v.fontFamily) setFontFamily(v.fontFamily)
  if (v.headingFont) setHeadingFont(v.headingFont)
  if (v.headingSize != null) setHeadingSize(v.headingSize)
  if (v.accentColor) setAccentColor(v.accentColor)
  if (v.voiceRate != null) localStorage.setItem('voice_rate', String(v.voiceRate))
  if (v.mobileLayout) setMobileLayout(v.mobileLayout)
  if (v.trainerReactions != null) { setOn(v.trainerReactions); localStorage.setItem('trainer_reactions', v.trainerReactions ? 'true' : 'false') }
  if (v.voiceName) { setSelected(v.voiceName); localStorage.setItem(VOICE_KEY, v.voiceName) }
}
```

Точные имена сеттеров (`setZoom`, `setFontFamily`, `setOn`, `setSelected` и т.д.) — сверить с реальными `useState` в файле на месте (в брифе они по смыслу совпадают с уже читанными строками 10, 34 и блоком у `toSave`); если имя отличается — использовать реальное, не выдумывать новое.

- [ ] **Step 5: Сохранение на сервер при изменении**

В месте, где сейчас пишется `localStorage.setItem(LS_KEY, JSON.stringify(toSave))` (~строка 212), сразу после — добавить дебounced или прямой вызов сохранения на сервер с РАСШИРЕННЫМ объектом (включая `trainerReactions`/`voiceName`):

```js
const toSaveFull = { ...toSave, trainerReactions: on, voiceName: selected }
localStorage.setItem(LS_KEY, JSON.stringify(toSaveFull))
api.patch('/settings/visual', { visual: toSaveFull }).catch(() => {})
```

(`.catch(() => {})` — сохранение на сервер best-effort, не блокирует UI и не показывает alert при сетевой ошибке, локальный кеш уже обновлён синхронно.)

Также добавить аналогичный `api.patch('/settings/visual', { visual: {...} })` (best-effort, `.catch(() => {})`) в местах, где отдельно меняются `trainer_reactions` (Step в файле ~строка 13) и выбор голоса (~строка 49) — ЕСЛИ они меняются вне общего блока `toSave` (сверить на месте; если toggle/выбор голоса уже вызывают тот же общий save-путь — отдельно дублировать не нужно).

- [ ] **Step 6: Собрать фронтенд**

Run: `cd frontend && npx vite build`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat(settings): настройки переживают чистку PWA — довязан существующий GET/PATCH /api/settings/visual"
```

---

## Task 2: Второй чекбокс копирования в режиме «Разговор» Читалки

**Files:**
- Modify: `frontend/src/pages/TextReader.jsx`

**Контекст:** режим «Двуязычный» уже имеет два чекбокса (оригинал/перевод) через `bilingualCopySelected`/`bilingualTransSelected` и `copyBilingualSelection` (коммит `fe91814`, компонент `CopyBox` определён локально внутри `bilingual.map`, строки ~1054-1100). Нужно то же самое для режима `conversation` (`convMessages.map`, строки ~766-800) — сейчас там копирования вообще нет (ни одного чекбокса).

**Interfaces:**
- Produces: `convCopySelected`, `convTransSelected` (Set), `copyConvSelection()` — используются в новом `CopySelectionBar` для режима conversation.

- [ ] **Step 1: Добавить состояние выбора для conversation**

Рядом с `bilingualCopySelected`/`bilingualTransSelected` (строка ~349-350):

```js
  const [convCopySelected, setConvCopySelected]   = useState(new Set())  // выбранные оригиналы реплик
  const [convTransSelected, setConvTransSelected] = useState(new Set())  // выбранные переводы реплик
```

- [ ] **Step 2: Тоггл-функции**

Рядом с `toggleBilingualCopy`/`toggleBilingualTrans` (строки ~450-462), по тому же паттерну:

```js
  const toggleConvCopy = useCallback((id) => {
    setConvCopySelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const toggleConvTrans = useCallback((id) => {
    setConvTransSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
```

Обрати внимание: `convMessages` идентифицируются по `msg.id` (не по индексу массива, в отличие от `bilingual`, где используется индекс `i`) — Set хранит `msg.id`, не индекс.

- [ ] **Step 3: Функция копирования**

Рядом с `copyBilingualSelection`:

```js
  // Копируем выбранное из разговора: оригинал реплики и/или её перевод, что отмечено.
  // Порядок — как в истории разговора (по порядку convMessages, не по порядку клика).
  const copyConvSelection = async () => {
    const parts = []
    for (const msg of convMessages) {
      if (convCopySelected.has(msg.id) && msg.original) parts.push(msg.original)
      if (convTransSelected.has(msg.id) && msg.translation && msg.translation !== '…' && msg.translation !== '❌') parts.push(msg.translation)
    }
    const textToCopy = parts.join('\n\n').trim()
    if (!textToCopy) return
    await navigator.clipboard.writeText(textToCopy)
    setConvCopySelected(new Set())
    setConvTransSelected(new Set())
    flashCopied()
  }
```

- [ ] **Step 4: Чекбоксы в рендере `convMessages.map`**

В блоке `convMessages.map(msg => {...})` (строки ~766-800) добавить чекбоксы рядом с подписями языков — по образцу `CopyBox` из bilingual-режима. `CopyBox` сейчас определена ЛОКАЛЬНО внутри `bilingual.map` — вынести её на уровень модуля (маленький компонент, экспорт не нужен, просто функция вне `TextReader`) ИЛИ продублировать такую же маленькую функцию внутри `convMessages.map` (на усмотрение — вынос чище, но конфликтов с существующим кодом бильингвального рендера не создаёт ни один из вариантов; **рекомендуется вынести на уровень модуля**, чтобы не дублировать 15 строк JSX):

```jsx
              convMessages.map(msg => {
                const isSrc = msg.side === 'src'
                const fromLang = getLang(isSrc ? convSrcLang : convTgtLang)
                const toLang   = getLang(isSrc ? convTgtLang : convSrcLang)
                const copySelected  = convCopySelected.has(msg.id)
                const transSelected = convTransSelected.has(msg.id)
                return (
                  <div key={msg.id} style={{
                    alignSelf: isSrc ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    background: isSrc ? 'var(--accent-soft)' : 'var(--surface-2)',
                    border: `1px solid ${(copySelected || transSelected) ? 'var(--accent)' : isSrc ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: isSrc ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                    padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <CopyBox on={copySelected} onToggle={() => toggleConvCopy(msg.id)} />
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fromLang.flag} {fromLang.label}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                      {msg.original}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <CopyBox on={transSelected} onToggle={() => toggleConvTrans(msg.id)} />
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>→ {toLang.flag} {toLang.label}</div>
                    </div>
                    <div style={{ fontSize: 14, color: msg.translation === '…' ? 'var(--ink-soft)' : 'var(--accent)', fontStyle: msg.translation === '…' ? 'italic' : 'normal' }}>
                      {msg.translation}
                      {msg.translation && msg.translation !== '…' && msg.translation !== '❌' && (
                        <button onClick={() => speakOut(msg.translation, isSrc ? convTgtLang : convSrcLang)}
                          title="Воспроизвести перевод"
                          style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13, padding: '0 2px' }}>
                          🔊
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
```

Существующая раскраска рамки `border: '1px solid var(--accent)'` для `isSrc` сообщений (акцентная рамка своей реплики) теперь конкурирует с подсветкой выбора — в примере выше выбор (`copySelected || transSelected`) приоритетнее, `isSrc` — вторична. Это осознанный выбор дизайна на месте реализации, не блокирующий.

- [ ] **Step 5: `CopySelectionBar` для conversation**

Найти, как `CopySelectionBar` подключается для `mode === 'bilingual'` (в конце файла, рядом со строкой ~1136-1145: `{mode === 'bilingual' && <CopySelectionBar count={biSelCount} .../>}`). Добавить аналогичный блок для `mode === 'conversation'`:

```jsx
      {mode === 'conversation' && (
        <CopySelectionBar
          count={convCopySelected.size + convTransSelected.size}
          onCopy={copyConvSelection}
          onCancel={() => { setConvCopySelected(new Set()); setConvTransSelected(new Set()) }}
          copied={copyFeedback}
          bottomOffset={hasSelection ? 'calc(55vh + 16px)' : 16}
        />
      )}
```

(`bottomOffset`/`copied`/`hasSelection` — использовать те же переменные, что уже используются для bilingual-варианта того же компонента, сверить точные имена на месте.)

- [ ] **Step 6: Сброс выбора при смене режима/языка разговора**

Найти место, где `mode`-табы сбрасывают `bilingualCopySelected`/`bilingualTransSelected` при переключении (строка ~689: `onClick={() => { setMode(tab.key); ... }}`) — добавить туда же `setConvCopySelected(new Set()); setConvTransSelected(new Set())`. Также сбросить оба Set там, где сейчас `setConvMessages([])` (кнопка очистки разговора, строка ~645) и в `swapConvLangs` (если считается уместным — реплики остаются валидными после swap языков, т.к. `msg.original`/`msg.translation` не меняются местами при swap направления новых реплик, так что сброс НЕ обязателен — оставить выбор как есть при swap).

- [ ] **Step 7: Собрать фронтенд**

Run: `cd frontend && npx vite build`
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/TextReader.jsx
git commit -m "feat(reader): второй чекбокс копирования в режиме «Разговор» — оригинал/перевод/оба"
```

---

## Task 3: Swap-стрелочка языков в «Двуязычном» режиме Читалки

**Files:**
- Modify: `frontend/src/pages/TextReader.jsx`

**Контекст:** «переводчик» в этом проекте — это режим «Двуязычный» (`biSrc`/`biTgt`) внутри Читалки (комментарий в коде: `// Языки для переводчика и разговора`, строка 74). Режим «Разговор» УЖЕ имеет свою кнопку `⇄` (`swapConvLangs`, строка 614, кнопка на строке 739-742) — трогать не нужно, он уже устроен как просят. Добавить то же самое для `biSrc`/`biTgt`.

**Interfaces:**
- Produces: `swapBiLangs()`.

- [ ] **Step 1: Функция swap**

Рядом с `swapConvLangs` (строка ~614):

```js
  // Меняем местами исходный/целевой язык двуязычного режима — и уже загруженные
  // пары (original↔translation), чтобы не терять готовый перевод при развороте.
  const swapBiLangs = () => {
    setBiSrc(biTgt)
    setBiTgt(biSrc)
    setBilingual(prev => prev.map(p => ({ original: p.translation, translation: p.original })))
  }
```

- [ ] **Step 2: Кнопка между `LangSelect`**

Найти блок с двумя `<LangSelect value={biSrc} .../>` и `<LangSelect value={biTgt} .../>` (строки ~932, 934, внутри `mode === 'bilingual'` секции). Сверить точную структуру — по образцу секции `mode === 'conversation'` (строки 737-744, `gridTemplateColumns: '1fr auto 1fr'` с кнопкой `⇄` посередине). Обернуть/перестроить так же:

```jsx
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <LangSelect value={biSrc} onChange={v => { setBiSrc(v); setBilingual([]) }} />
            <button onClick={swapBiLangs} title="Поменять языки"
              style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 18, color: 'var(--ink-soft)' }}>
              ⇄
            </button>
            <LangSelect value={biTgt} onChange={v => { setBiTgt(v); setBilingual([]) }} />
          </div>
```

Существующие `onChange` у `LangSelect` (которые сейчас, судя по прочитанному коду, делают `setBilingual([])` — сбрасывают перевод при ручной смене языка вручную) оставить как есть — они относятся к РУЧНОЙ смене одного языка через выпадающий список (справедливо сбрасывать перевод, т.к. пара языков стала непредсказуемой), а `swapBiLangs` — отдельная кнопка для ИМЕННО обмена местами, которая переиспользует уже переведённые пары вместо сброса. Сверить точную текущую вёрстку этого места в файле перед правкой — она может отличаться от строк 932/934, найденных при более раннем чтении (файл менялся другими коммитами с тех пор).

- [ ] **Step 3: Собрать фронтенд**

Run: `cd frontend && npx vite build`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TextReader.jsx
git commit -m "feat(reader): swap-стрелочка языков в Двуязычном режиме — меняет местами язык и готовые переводы"
```

---

## Task 4: QR-код приглашения в класс

**Files:**
- Modify: `frontend/package.json` (новая зависимость)
- Modify: `frontend/src/pages/School.jsx`

**Контекст:** страница `School.jsx` уже показывает код и ссылку-приглашение (`joinLink(code)`, строка 62; кнопки `CopyBtn` на строках 159-160, рядом с `selected.invite_code`). Нужно добавить QR-код той же ссылки рядом. Библиотека — `qrcode` (npm, `toCanvas`/`toDataURL`, полностью локальная генерация, ноль внешних запросов — не нарушает CSP).

**Interfaces:**
- Consumes: пакет `qrcode` (метод `QRCode.toDataURL(text, options): Promise<string>` — data-URL PNG).

- [ ] **Step 1: Установить зависимость**

Run: `cd frontend && npm install qrcode`
Expected: `qrcode` появляется в `frontend/package.json` `dependencies` и `package-lock.json` обновлён.

- [ ] **Step 2: Прочитать текущий блок приглашения в `School.jsx`**

Найти точный JSX вокруг строк 158-160 (`selected.invite_code`, `CopyBtn` для кода и ссылки) — сверить реальную структуру на месте (номера из более раннего чтения, файл мог сместиться).

- [ ] **Step 3: Компонент QR-кода**

Добавить импорт в начало `School.jsx`:

```js
import QRCode from 'qrcode'
```

Добавить маленький локальный компонент рядом с остальными хелперами файла (или прямо перед `export default function School`):

```jsx
// QR-код ссылки-приглашения — генерируется полностью на клиенте (без внешних
// сервисов/CDN), чтобы не нарушать CSP. Перегенерируется при смене ссылки.
function InviteQr({ text }) {
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(text, { width: 180, margin: 1 })
      .then(url => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [text])

  if (!dataUrl) return null
  return (
    <img src={dataUrl} alt="QR-код приглашения" width={180} height={180}
      style={{ borderRadius: 12, border: '1px solid var(--line)', background: '#fff', padding: 8 }} />
  )
}
```

(`useState`/`useEffect` уже импортированы в `School.jsx` из `react` — проверить на месте, добавить в существующий импорт, не дублировать строку импорта.)

- [ ] **Step 4: Вставить `<InviteQr>` рядом со ссылкой-приглашением**

В блоке, где сейчас `<CopyBtn text={joinLink(selected.invite_code)} label="🔗 Ссылка-приглашение" />` (строка ~160), добавить сразу после (или в удобное по вёрстке место того же блока):

```jsx
                  <InviteQr text={joinLink(selected.invite_code)} />
```

- [ ] **Step 5: Собрать фронтенд**

Run: `cd frontend && npx vite build`
Expected: без ошибок, `qrcode` корректно бандлится (это чистый JS-пакет без зависимостей от Node-специфичных API в browser-сборке — если сборка ругается на отсутствующие полифиллы `Buffer`/`process`, проверить актуальную версию `qrcode`, которая поддерживает browser-сборку из коробки; если проблема всё же есть — сообщить в отчёте, не тратить время на обход самостоятельно).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/pages/School.jsx
git commit -m "feat(school): QR-код ссылки-приглашения в класс (локальная генерация, без CDN)"
```

---

## Task 5: Кнопка «камера» на Дашборде

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Контекст:** существующая круглая кнопка «Повторить всё» — `position: fixed, right: 16, bottom: calc(var(--bottom-nav-h, 0px) + 16px)`, строки 272-289. Новая кнопка камеры — такая же круглая FAB, СТЕКОМ НАД существующей (тот же правый нижний угол, выше по Y), ведёт на `/lessons/new` (уже существующий роут, `NewLesson.jsx`).

**Interfaces:**
- Consumes: `navigate` из `useNavigate()` (уже используется в файле, строка 26).

- [ ] **Step 1: Добавить кнопку камеры**

Сразу перед блоком «Повторить всё» (перед строкой 272, `{total > 0 && (`), добавить:

```jsx
      {/* Круглая кнопка камеры — новый урок по фото. Стоит НАД «Повторить всё»
          в том же правом нижнем углу (не над «Повторить всё» по X, а выше по Y —
          та кнопка условна по total > 0, эта — всегда видна). */}
      <button
        onClick={() => navigate('/lessons/new')}
        title="Новый урок по фото"
        style={{
          position: 'fixed', zIndex: 50,
          right: 16, bottom: `calc(var(--bottom-nav-h, 0px) + ${total > 0 ? 78 : 16}px)`,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--surface)', color: 'var(--ink)',
          border: '1px solid var(--line)', cursor: 'pointer', fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
        📷
      </button>
```

Смещение `bottom` зависит от того, показана ли кнопка «Повторить всё» (`total > 0`) — если её нет, кнопка камеры опускается на её обычное место (16px от низа), а не висит в воздухе с пустым зазором. `78px` — эмпирическая высота кнопки «Повторить всё» (padding 13px×2 + строка текста ~15px + небольшой зазор) плюс отступ 16px; при реальной проверке в браузере скорректировать число, если визуально не совпадает (не критично для функциональности, только для аккуратности).

- [ ] **Step 2: Собрать фронтенд**

Run: `cd frontend && npx vite build`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): круглая кнопка камеры — быстрый переход к загрузке нового урока"
```

---

## После всех задач

Пять отдельных коммитов (уже соблюдено по шагам). Работа остаётся в ветке `worktree-sonnet-ui-tasks` до отдельного подтверждения на мерж в `main` и деплой.
