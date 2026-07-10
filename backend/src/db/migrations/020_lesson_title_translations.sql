ALTER TABLE lessons ADD COLUMN IF NOT EXISTS title_translations JSONB DEFAULT '{}';
