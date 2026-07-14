-- Мульти-таргет: целевой изучаемый язык (что учим). По умолчанию 'de' (немецкий) —
-- весь текущий контент остаётся немецким. Позже: es, fr, it, en, …
ALTER TABLE users    ADD COLUMN IF NOT EXISTS target_lang TEXT NOT NULL DEFAULT 'de'; -- активный язык пользователя
ALTER TABLE lessons  ADD COLUMN IF NOT EXISTS target_lang TEXT NOT NULL DEFAULT 'de';
ALTER TABLE courses  ADD COLUMN IF NOT EXISTS target_lang TEXT NOT NULL DEFAULT 'de';

CREATE INDEX IF NOT EXISTS idx_lessons_target ON lessons(target_lang);
