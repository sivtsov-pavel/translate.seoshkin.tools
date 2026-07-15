-- Переводы описания урока на локали интерфейса (как title_translations для заголовка).
-- Заполняется автоматически при обработке урока (enrichLesson), с учётом активных локалей.
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT '{}';
