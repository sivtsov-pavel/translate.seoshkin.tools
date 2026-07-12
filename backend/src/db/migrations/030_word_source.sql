-- Источник слов: 'textbook' (из учебника) / 'extra' (тетрадь, доска, дописанные)
-- Всё существующее считаем словами из учебника (это загружал учитель).
ALTER TABLE words        ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'textbook';
ALTER TABLE lesson_media ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'textbook';
