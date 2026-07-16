-- Связь под-урока с родителем (тематическая разбивка 14 → 14.1/14.2…).
-- Нужна для вложенного вывода ленты: под-уроки показываем внутри родителя.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS parent_lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_parent ON lessons(parent_lesson_id);

-- Бэкфилл существующих под-уроков (14.1 → родитель «Урок 14») по номеру в названии
UPDATE lessons sub
SET parent_lesson_id = par.id
FROM lessons par
WHERE sub.parent_lesson_id IS NULL
  AND sub.title ~ 'Урок\s+[0-9]+\.[0-9]'
  AND par.title ~ ('Урок\s+' || substring(sub.title from 'Урок\s+([0-9]+)\.') || '\D')
  AND par.title !~ 'Урок\s+[0-9]+\.[0-9]'
  AND par.owner_id = sub.owner_id;
