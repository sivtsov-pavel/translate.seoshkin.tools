-- Озвучка карточки на виджете: включена или нет.
--
-- Хранится рядом с токеном по той же причине, что и notify_on: связь с нативной частью
-- односторонняя, и настройки должны показывать настоящее состояние, а не память браузера.
ALTER TABLE widget_tokens ADD COLUMN IF NOT EXISTS sound_on BOOLEAN NOT NULL DEFAULT TRUE;
