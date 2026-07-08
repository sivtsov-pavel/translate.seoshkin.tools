ALTER TABLE words DROP CONSTRAINT IF EXISTS words_lesson_id_fkey;
ALTER TABLE words ADD CONSTRAINT words_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;
