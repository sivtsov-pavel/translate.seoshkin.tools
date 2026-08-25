# Виджет «Пройдено X из 2 обязательных упражнений» — ответы по стеку (для Gemini)

Документ отвечает на 4 вопроса к ТЗ. Написан разработчиком приложения, факты — из
кода репозитория `translate.seoshkin.tools` (Deutsch Lernen / deutschlernen.ai).

---

## 0. Главная поправка к постановке задачи

В вопросах предполагается, что у приложения есть нативная кодовая база (RN/Flutter/Swift/Kotlin)
и «фоновый сервис приложения», у которого виджет может спросить прогресс. **Этого нет.**

| Платформа | Что есть на самом деле |
|---|---|
| Веб | React 18 + Vite, PWA (Workbox `sw.js` + `push-sw.js`), Web Push на VAPID, Badging API |
| Бэкенд | Fastify 4 + PostgreSQL 16 (raw SQL), Docker Compose, JWT (`fastify.authenticate`) |
| Android | **TWA**, сгенерированный Bubblewrap CLI. `packageId = tools.seoshkin.translate`, host `deutschlernen.ai`, `minSdkVersion 21`. Gradle-проект на Kotlin/Java существует, но весь UI — сайт внутри Custom Tabs. **JS↔native моста нет.** |
| iOS | **Нативного приложения не существует вовсе.** Только PWA, добавленная на «Домой» через Safari. |

Следствия, которые обязаны попасть в ТЗ:

1. **Android-виджет реален** — `AppWidgetProvider` добавляется в тот же Gradle-проект TWA.
   Но данные он берёт **с бэкенда по HTTP**, а не у «фонового сервиса»: сервиса нет,
   и веб-код внутри Custom Tabs нативному коду ничего передать не может.
2. **iOS-виджет сегодня невозможен в принципе.** WidgetKit требует нативного приложения,
   опубликованного в App Store: аккаунт Apple Developer ($99/год), Xcode-проект, ревью.
   Это не «часть ТЗ на виджет», это отдельный проект. См. §4.
3. **Foreground Service не нужен и вреден.** Android его убивает / требует постоянного
   уведомления. Правильный инструмент — `WorkManager` + событие выхода из приложения.
4. **Метрика «Пройдено X из 2» не соответствует логике приложения.** Правило открытия
   следующего урока в коде (`backend/src/services/drip.js`, константа `LESSON_PASSED_HAVING`)
   такое: обязательны **два ТИПА упражнений по КАЖДОМУ слову урока** — `flashcard`
   (карточка) и `multiple_choice` («выбери ответ»). В уроке на 20 слов это 20 + 20 = **40
   шагов**, а не 2. Остальные типы (диктант, речь, грамматика, фразы) в минимум не входят
   — они уходят в «хвосты» и догоняются позже.

   Плюс второе условие: урок открывается, только когда **и предыдущий пройден, и наступил
   учебный день** по расписанию курса (`course_schedules`: дни недели + дата старта).
   Формула доступа: `открыто = max(календарь, пройдено+1, начато+1)`. Без расписания курс
   закрыт целиком.

   Поэтому виджет показывает **«Урок 7 — 34 из 40»**, а рядом второе состояние:
   «урок пройден, следующий откроется в понедельник». Считать «2 упражнения» нельзя —
   цифра разойдётся с приложением в первый же день.
5. Контент мультиязычный: активный язык передаётся заголовком `X-Target-Lang`,
   интерфейс локализован на 10 языков — **подписи виджета тоже нужны на 10 локалей**.

---

## 1. Архитектура решения

**Единственный источник правды — PostgreSQL на сервере.** Виджет — «глупый рендер»
ответа API; он ничего не вычисляет и не хранит состояние прогресса. Любая попытка вести
свой счётчик в виджете даёт расхождение с приложением, и это будет главный баг фичи.

```
PostgreSQL ──► Fastify: GET /api/daily/goal ──► [сеть]
                                                  │
                       Android: WidgetWorker (WorkManager, OkHttp)
                                                  │
                       кэш в SharedPreferences (последний удачный ответ)
                                                  │
                       RemoteViews ──► AppWidgetProvider ──► домашний экран
```

### Новый эндпоинт (бэкенд, делается первым)

```
GET /api/widget/state        Authorization: Bearer <token>   X-Target-Lang: de
→ {
    "date": "2026-08-25",              // локальная дата ученика
    "lesson": { "id": 41, "number": 7, "title": "家族" },
    "required": { "done": 34, "total": 40 },   // flashcard + multiple_choice по словам урока
    "byType": {                                 // для подписи «карточки 20/20, выбор 14/20»
      "flashcard":       { "done": 20, "total": 20 },
      "multiple_choice": { "done": 14, "total": 20 }
    },
    "state": "in_progress",            // in_progress | passed_waiting_calendar | no_schedule | all_done
    "nextUnlockDate": null,            // дата открытия следующего урока, если ждём календарь
    "tails": 12,                       // отложенные упражнения и фразы (хвосты)
    "streak": 7,
    "nextUrl": "/lesson/41",
    "updatedAt": "2026-08-25T09:12:03Z"
  }
```

Четыре состояния — не одно: идёт урок / урок пройден, ждём учебного дня / расписание
курса не выбрано / курс кончился. Виджет обязан уметь показать каждое, иначе после
прохождения урока он замрёт на «40 из 40» и будет выглядеть сломанным.

Отдавать `ETag` / поддерживать `If-None-Match`: виджет опрашивает регулярно, 304 экономит
и трафик, и батарею.

### Аутентификация виджета — узкое место, решать явно

У нативного кода **нет доступа** к куке/`localStorage` сайта: Custom Tabs изолирован.
Токен нужно передать из веба в нативную часть один раз, при включении виджета.

**Способ (работает в TWA):** в настройках приложения кнопка «Подключить виджет» открывает
собственный пакет по intent-схеме:

```js
// фронтенд, только внутри Android-обёртки
location.href =
  `intent://widget-link?token=${encodeURIComponent(widgetToken)}` +
  `#Intent;scheme=dlwidget;package=tools.seoshkin.translate;end`
```

Нативная `WidgetLinkActivity` ловит это, кладёт токен в `EncryptedSharedPreferences`
и сразу же запускает первое обновление.

Требования безопасности:
- это **отдельный узкий токен виджета** (scope: только `/api/daily/goal`), не основной JWT;
- выдаётся эндпоинтом `POST /api/widget/token` авторизованному пользователю, срок ~180 дней,
  отзывается в настройках;
- хранится только в `EncryptedSharedPreferences`.

### Когда виджет обновляется

| Триггер | Как |
|---|---|
| Пользователь свернул/закрыл приложение | `onStop()` наследника TWA `LauncherActivity` → `OneTimeWorkRequest` — **главный триггер, даёт мгновенную актуальность** |
| Периодически | `PeriodicWorkRequest`, 30 мин (система не даст чаще 15) |
| Тап по кнопке «обновить» на виджете | `PendingIntent` → broadcast → `OneTimeWorkRequest` |
| Смена суток | `AlarmManager` на локальную полночь — обнулить «сделано» |
| Пользователь добавил виджет | `onEnabled()` / `onUpdate()` |

Сеть недоступна — рисуем последний кэш и метку «данные от HH:MM», не пустой виджет.

### ⚠️ Риск сборки, критичный для нашего проекта

`npx @bubblewrap/cli update` **регенерирует Android-проект из `twa-manifest.json`** — в git
у нас лежит только манифест, самого Gradle-проекта в репозитории нет. Любые нативные файлы
виджета, положенные в сгенерированный проект, будут стёрты при следующей пересборке.

Поэтому в ТЗ обязателен пункт: исходники виджета хранятся в git отдельно
(`android-twa/widget/**`) + скрипт `android-twa/apply-widget.sh`, который после `update`
копирует файлы, дописывает `<receiver>` в `AndroidManifest.xml` и зависимости в
`build.gradle`. Скрипт прописывается в `android-twa/README.md` и в `RELEASE_CHECKLIST.md`.

### Развилка, которую должен решить владелец продукта

| | A. Остаёмся на TWA + патч-скрипт | B. Переезд обёртки на Capacitor |
|---|---|---|
| Объём | Меньше: трогаем только Android-обёртку | Больше: смена обёртки, новая сборка и тест |
| Синхронизация | Через сеть; мост — intent + токен | Прямой JS↔native мост, `Preferences` → `SharedPreferences`, виджет читает локально, мгновенно и офлайн |
| Токен для виджета | Нужен отдельный, см. выше | Не нужен — приложение само кладёт цифры |
| Пересборки | Патч-скрипт после каждого `update` | Проект в git, ничего не перетирается |
| iOS в будущем | Не приближает | Даёт готовую базу для iOS-обёртки и WidgetKit |

**Рекомендация: A для первой версии виджета** (одна фича не оправдывает смены обёртки),
**B — если решаем делать iOS-приложение**, тогда виджеты обеих платформ строятся на одной базе.

В обоих случаях `packageId` и **ключ подписи менять нельзя**: Google Play привязывает
приложение к ключу навсегда.

---

## 2. Android — пошаговая реализация

Ориентир: Kotlin, `minSdk 21`, `RemoteViews` (Jetpack Glance требует API 23+ — не подходит).

### Шаг 1. `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- POST_NOTIFICATIONS уже есть: в twa-manifest enableNotifications: true -->
<!-- Foreground Service и RECEIVE_BOOT_COMPLETED НЕ нужны: работает WorkManager -->

<application>
  <receiver
      android:name=".widget.DailyGoalWidgetProvider"
      android:exported="false">
    <intent-filter>
      <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
      <action android:name="tools.seoshkin.translate.ACTION_WIDGET_REFRESH" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/daily_goal_widget_info" />
  </receiver>

  <!-- приём токена из веба -->
  <activity android:name=".widget.WidgetLinkActivity" android:exported="true"
            android:theme="@android:style/Theme.NoDisplay">
    <intent-filter>
      <action android:name="android.intent.action.VIEW" />
      <category android:name="android.intent.category.DEFAULT" />
      <category android:name="android.intent.category.BROWSABLE" />
      <data android:scheme="dlwidget" android:host="widget-link" />
    </intent-filter>
  </activity>
</application>
```

### Шаг 2. `res/xml/daily_goal_widget_info.xml`

```xml
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp" android:minHeight="70dp"
    android:targetCellWidth="3" android:targetCellHeight="1"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/widget_daily_goal"
    android:previewImage="@drawable/widget_preview"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen" />
```
`updatePeriodMillis="0"` — обновлениями управляет WorkManager, системный таймер не нужен
(он всё равно не даёт чаще 30 мин и будит устройство зря).

### Шаг 3. Провайдер

```kotlin
class DailyGoalWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { renderFromCache(ctx, mgr, it) }
        WidgetSync.requestNow(ctx)          // и сразу пробуем свежие данные
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == ACTION_REFRESH) WidgetSync.requestNow(ctx)
    }

    override fun onEnabled(ctx: Context)  { WidgetSync.schedulePeriodic(ctx) }
    override fun onDisabled(ctx: Context) { WidgetSync.cancelAll(ctx) }

    companion object {
        const val ACTION_REFRESH = "tools.seoshkin.translate.ACTION_WIDGET_REFRESH"

        /** Рисует виджет из кэша — единственное место отрисовки. */
        fun renderFromCache(ctx: Context, mgr: AppWidgetManager, id: Int) {
            val s = WidgetStore(ctx).read()          // done / required / streak / syncedAt
            val views = RemoteViews(ctx.packageName, R.layout.widget_daily_goal).apply {
                setTextViewText(R.id.title, ctx.getString(R.string.widget_title))
                setTextViewText(R.id.counter,
                    ctx.getString(R.string.widget_progress, s.done, s.required))
                setProgressBar(R.id.bar, s.required, s.done.coerceAtMost(s.required), false)
                setTextViewText(R.id.hint, if (s.done >= s.required)
                    ctx.getString(R.string.widget_done)
                    else ctx.getString(R.string.widget_cta))

                // тап по виджету → приложение на нужный экран
                setOnClickPendingIntent(R.id.root, openApp(ctx, s.nextUrl))
                setOnClickPendingIntent(R.id.refresh, refreshIntent(ctx))
            }
            mgr.updateAppWidget(id, views)
        }

        private fun openApp(ctx: Context, path: String): PendingIntent {
            val i = Intent(ctx, LauncherActivity::class.java).apply {
                data = Uri.parse("https://deutschlernen.ai$path?from=widget")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            return PendingIntent.getActivity(ctx, path.hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        private fun refreshIntent(ctx: Context) = PendingIntent.getBroadcast(
            ctx, 1, Intent(ctx, DailyGoalWidgetProvider::class.java).setAction(ACTION_REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
```

### Шаг 4. Worker (вместо Service)

```kotlin
class WidgetSyncWorker(ctx: Context, params: WorkerParameters) :
        CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val store = WidgetStore(applicationContext)
        val token = store.token() ?: return@withContext Result.success()  // не подключён

        val req = Request.Builder()
            .url("https://deutschlernen.ai/api/daily/goal")
            .header("Authorization", "Bearer $token")
            .header("X-Target-Lang", store.targetLang())
            .apply { store.etag()?.let { header("If-None-Match", it) } }
            .build()

        try {
            OkHttpClient().newCall(req).execute().use { resp ->
                when {
                    resp.code == 304 -> { store.touch(); redrawAll() }
                    resp.isSuccessful -> {
                        store.save(resp.body!!.string(), resp.header("ETag"))
                        redrawAll()
                    }
                    resp.code == 401 -> { store.clearToken(); redrawAll() } // показать «подключите виджет»
                }
            }
            Result.success()
        } catch (e: IOException) {
            redrawAll()          // рисуем кэш с меткой времени
            Result.retry()       // WorkManager сам повторит с backoff
        }
    }

    private fun redrawAll() { /* AppWidgetManager → renderFromCache для каждого id */ }
}

object WidgetSync {
    fun requestNow(ctx: Context) = WorkManager.getInstance(ctx).enqueueUniqueWork(
        "widget-now", ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<WidgetSyncWorker>()
            .setConstraints(Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build())

    fun schedulePeriodic(ctx: Context) = WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
        "widget-periodic", ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<WidgetSyncWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build())
}
```

### Шаг 5. Мгновенное обновление после работы в приложении

```kotlin
// наследник TWA-активности; в манифесте заменить androidbrowserhelper LauncherActivity
class AppLauncherActivity :
        com.google.androidbrowserhelper.trusted.LauncherActivity() {
    override fun onStop() {
        super.onStop()
        WidgetSync.requestNow(this)   // вышел из приложения — виджет уже верный
    }
}
```

### Шаг 6. Приём токена из веба

```kotlin
class WidgetLinkActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        intent?.data?.getQueryParameter("token")?.let {
            WidgetStore(this).saveToken(it)
            WidgetSync.requestNow(this)
            WidgetSync.schedulePeriodic(this)
        }
        finish()
    }
}
```

### Шаг 7. Строки — на 10 локалей

`values/strings.xml` + `values-de`, `values-en`, `values-es`, `values-fr`, `values-it`,
`values-pl`, `values-pt`, `values-tr`, `values-uk` (набор — как в `frontend/src/i18n/`).
Счётчик — через `plurals`, иначе в русском/украинском будет «1 упражнений».

---

## 3. iOS

**Сейчас реализовать нельзя.** Причина не в сложности кода, а в том, что нативного
приложения нет: WidgetKit-расширение существует только внутри приложения из App Store.

Что понадобится, если решим делать (отдельная фаза, отдельный бюджет):

1. Обёртка PWA в нативное приложение — **Capacitor** (тогда логично и Android перевести на него).
2. Аккаунт Apple Developer, публикация в App Store, прохождение ревью
   (у «просто обёрток сайта» ревью Apple заметно строже, чем у Google — это отдельный риск,
   Guideline 4.2 Minimum Functionality).
3. **App Group** (`group.tools.seoshkin.translate`) — общий контейнер приложения и виджета:
   приложение пишет `UserDefaults(suiteName:)`, виджет читает. Это и есть iOS-механизм
   синхронизации, аналог SharedPreferences.
4. Widget Extension: `TimelineProvider` + `IntentConfiguration`, обновление
   `WidgetCenter.shared.reloadTimelines(ofKind:)` — вызывается приложением сразу после
   изменения прогресса. Плюс `.after(date)` в таймлайне как страховка (бюджет обновлений
   у iOS ограничен, часто дёргать нельзя).
5. `AppIntent` (iOS 17+) — интерактивная кнопка прямо на виджете («Начать»); на iOS 16
   деградирует в обычный тап с `widgetURL`.
6. Отдельно: живая плитка на Lock Screen (`accessoryCircular`) — почти бесплатно поверх
   того же таймлайна.

**Что доступно на iOS уже сегодня, без нативного приложения:** Web Push (iOS 16.4+, только
для PWA, добавленной на «Домой») и Badging API — красный кружок с числом на иконке.
У нас и то, и другое уже работает (`frontend/public/push-sw.js`). Для задачи «не забыть про
2 упражнения» это закрывает 80% пользы виджета.

---

## 4. Синхронизация «Пройдено X из 2» — правила

1. **Считает только сервер.** Виджет и приложение отображают одно и то же поле из одного
   эндпоинта. Никаких параллельных вычислений в клиентах — расхождение цифр в приложении
   и на домашнем экране убивает доверие к фиче быстрее любого краша.
2. **Кэш ≠ источник правды.** Локально хранится только последний ответ + `ETag` + время
   синхронизации, чтобы было что рисовать офлайн. Рисуем с пометкой времени.
3. **Момент актуализации — выход из приложения** (`onStop` → Worker). Пользователь сделал
   упражнения и свернул приложение → к моменту, когда он смотрит на домашний экран,
   виджет уже верный. Периодика (30 мин) — только подстраховка для «прогресс сбросился ночью»
   и изменений с другого устройства.
4. **Сутки закрываются по локальной дате пользователя**, а не по UTC и не по времени сервера.
   Часовой пояс уже хранится (`services/timeutil.js`). `AlarmManager` на локальную полночь
   перерисовывает виджет в «0 из 2».
5. **Оптимистичного счётчика в виджете нет.** Виджет не увеличивает `done` сам «на всякий
   случай» — только то, что подтвердил сервер.
6. **Считаем из той же таблицы, что и гейт урока** — `user_exercise_progress` (факт
   отработки упражнения), не `exercise_attempts` (все попытки, включая повторные). Это две
   разные таблицы, и если виджет возьмёт вторую, его число разойдётся с реальным открытием
   урока. SQL обязан переиспользовать существующее правило `LESSON_PASSED_HAVING`, а не
   быть написанным заново: у нас уже был баг, когда урок не открывался из-за расхождения
   определений (22.08.2026).
7. **Несколько устройств** — телефон, планшет, десктоп. Виджет обязан переживать
   «сделал на другом устройстве»: единственный правильный ответ — периодический опрос
   плюс опрос при открытии/закрытии приложения. Push-канал сюда не тянуть: у нас Web Push
   через сервис-воркер, а сервис-воркер обновить нативный `AppWidget` не может в принципе.
8. **Что показывать в трёх состояниях:** не подключён (кнопка «Подключить в приложении»),
   нет сети (кэш + «данные от 09:12»), выполнено (галка + серия дней) — в ТЗ нужны все три,
   не только счастливый путь.

---

## Порядок работ

1. Бэкенд: вынести счёт «сколько осталось до открытия следующего урока» рядом с
   `LESSON_PASSED_HAVING` (единое определение на все места), лёгкий эндпоинт
   `GET /api/widget/state` с ETag, `POST /api/widget/token` + отзыв токена.
   Отдельно от тяжёлого `/api/path`, который собирает всю дорогу десятком запросов.
2. Веб: блок «Виджет на домашний экран» в настройках + intent-ссылка привязки (только Android).
3. Android: виджет, Worker, WidgetStore, наследник LauncherActivity, строки на 10 локалей.
4. Сборка: `android-twa/widget/**` в git + `apply-widget.sh`, пункт в `RELEASE_CHECKLIST.md`.
5. Проверка на живом устройстве: свежая установка, офлайн, смена суток, второе устройство,
   отзыв токена.
6. iOS — отдельным решением, не в этой фазе.
