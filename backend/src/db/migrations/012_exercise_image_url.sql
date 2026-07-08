-- Добавляем image_url к упражнениям (независимо от words)
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Расширяем CHECK constraint чтобы включить letter_fill
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_type_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_type_check
  CHECK (type IN ('flashcard','fill_blank','multiple_choice','sentence_write','letter_fill'));
