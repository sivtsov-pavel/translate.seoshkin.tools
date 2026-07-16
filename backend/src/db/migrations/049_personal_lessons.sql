-- Личные наборы ученика (например «🔥 Мои сложные слова»): видны только владельцу,
-- не попадают в общий список уроков и в глобальные наборы по темам.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_lessons_personal_owner ON lessons(owner_id) WHERE is_personal;
