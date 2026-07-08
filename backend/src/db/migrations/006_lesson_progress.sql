-- Текстовый прогресс обработки урока для отображения в UI
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS progress TEXT;
