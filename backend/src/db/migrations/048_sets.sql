-- Тематические наборы: глобальные темы (Глаголы, Числа, Школа…), собранные из под-уроков.
-- Набор = урок с флагом is_set. Слова в наборе дедуплены; книги-уроки остаются источником.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_set BOOLEAN DEFAULT false;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS set_theme TEXT;
CREATE INDEX IF NOT EXISTS idx_lessons_is_set ON lessons(is_set) WHERE is_set = true;
