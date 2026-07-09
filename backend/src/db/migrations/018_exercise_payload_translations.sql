ALTER TABLE exercises ADD COLUMN IF NOT EXISTS payload_translations JSONB DEFAULT '{}';
