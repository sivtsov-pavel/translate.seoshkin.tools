# Промт для Опуса — Сессия 1: Время в календаре + напоминания по таймзоне

Скопируй весь этот файл как первое сообщение новой сессии Opus.

---

Ты — Claude (Opus), работаешь с Павлом над PWA для изучения языков **translate.seoshkin.tools / deutschlernen.ai**.

## Контекст проекта
- Стек: Fastify 4 (raw SQL) + React 18/Vite + PostgreSQL 16 + Docker Compose.
- Главный бэклог — **`IDEAS.md`** в корне репо. Сверяйся и отмечай `[x]` с датой.
- Деплой сам: `git push` → `ssh gcloud-seosite` → `cd /home/seosite/translate && git pull` → `docker compose -f docker-compose.prod.yml build backend frontend && up -d`. БД: сервис `db`, юзер `german_app`, база `german_learning`.
- ⚠️ nginx-шлюз `seoshkin_nginx` НЕ трогать через `up` с volume-правками (кладёт все сайты) — только `nginx -s reload`.
- Всё сразу на 10 локалей интерфейса. Общение и комментарии — русский, имена в коде — английский.

## Задача: Время в календаре + управление напоминаниями (по таймзоне пользователя)

**Проблема:** дрип-напоминания и milestone-пуши идут по крону в фиксированный **UTC** (drip 09:00 UTC, evening 18:00 UTC, milestones 10:00 UTC — см. `backend/src/services/drip.js` `startDripCron`, `backend/src/services/motivation.js` `startMotivationCron`). Для пользователя в Берлине (UTC+2 летом) «09:00» приходит в 11:00. Павел ждал пуш в 9:00 — не пришёл.

**Что сделать:**
1. **Таймзона пользователя.** Добавить `users.timezone` (IANA, напр. `Europe/Berlin`), миграция в `backend/src/db/migrations/`. Автоопределение на фронте (`Intl.DateTimeFormat().resolvedOptions().timeZone`) → сохранять при входе/в настройках.
2. **Время в расписании курса.** Таблица `course_schedules` (миграция 050) — добавить поле времени старта урока + время утреннего/вечернего напоминания (по пользователю; вечернее ~21:30 «по возвращении с работы»). UI — в `SchedulePicker` (`frontend/src/pages/CourseView.jsx`).
3. **Крон по таймзонам.** Переделать `runDripPush` / `runEveningReminders` / `runMilestones`: крон тикает каждые 15-30 мин (UTC), внутри — слать пуш только тем, у кого локальное время совпало с их выбранным временем напоминания. Дедуп по дате (уже есть паттерн через `users.motivation` jsonb + `course_schedules.last_push_index`).
4. **Настройки уведомлений** (Duolingo-стиль): тумблеры «утреннее напоминание», «вечернее», «мотивация/вехи», выбор времени — на страницу настроек.

**Ключевые файлы:** `backend/src/services/drip.js`, `backend/src/services/motivation.js`, `backend/src/routes/courses.js` (GET/PUT `/api/courses/:id/schedule`), `frontend/src/pages/CourseView.jsx` (`SchedulePicker`), страница настроек.

**Проверка:** создать тестовое расписание с временем через 1-2 мин от «сейчас» в своей TZ → убедиться, что пуш приходит в нужное локальное время и один раз.

## Правила
- Короткий план (3-7 пунктов) → жди подтверждения Павла → пиши код → скажи что проверить.
- Не удаляй данные из БД без бэкапа и подтверждения.
- После деплоя проверяй: контейнеры Up, логи бэкенда без ошибок, сайт 200.

## Что уже сделано (не переделывай) — см. IDEAS.md, раздел 2026-07-20
Строгий дрип, дрип-дашборд, «сдал зачёт = пройден», панель прогресса (2 шкалы + карточки/серия), обязательный выбор календаря, нумерация курсов, глобус-перевод. Пуш-подписки в таблице `push_subscriptions`, отправка — `backend/src/services/push.js` (`sendToUser`).
