-- Отдельный список слов «из тетради/доски» (текстом), помимо основного text_content (учебник)
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS text_content_extra TEXT;
