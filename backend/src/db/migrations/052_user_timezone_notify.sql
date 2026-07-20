-- Таймзона пользователя (IANA, напр. Europe/Berlin) и настройки уведомлений.
-- Проблема: пуши шли по фиксированному UTC (09:00/18:00/10:00), для Берлина (UTC+2 летом)
-- «09:00» приходило в 11:00. Теперь напоминания привязаны к ЛОКАЛЬНОМУ времени юзера.
-- timezone определяется на фронте (Intl…) и сохраняется при входе/в настройках.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Berlin';

-- notify_prefs: тумблеры и время (Duolingo-стиль). Время в ЛОКАЛЬНОЙ TZ юзера, формат 'HH:MM'.
--   morning    — «открылся новый урок» + вехи (поздравления), утреннее время
--   evening    — «не потеряй серию» / «позанимайся», вечернее время
--   milestones — поздравления с порогами слов/уроков (шлём в утреннем слоте)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs jsonb NOT NULL
  DEFAULT '{"morning":{"on":true,"time":"09:00"},"evening":{"on":true,"time":"21:30"},"milestones":{"on":true}}'::jsonb;
